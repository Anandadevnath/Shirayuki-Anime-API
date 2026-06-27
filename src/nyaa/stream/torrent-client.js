// Single in-process WebTorrent client. One client is reused across all
// /api/v2/nyaa/stream/* requests so we don't spin up a new DHT node per call.
// Each torrent is added once and looked up by infoHash thereafter — keeping
// it alive lets a returning client resume a partially downloaded file.

import WebTorrent from 'webtorrent';
import { extractEpisodeFromName, VIDEO_EXTENSIONS, NYAA_BASE_URL } from '../scraper/_shared.js';
import { axios } from '../../utils/scrapper-deps.js';

// Fetch the .torrent file from nyaa.si. Used by probeHealth so we can add the
// torrent via its bencoded buffer (metadata parsed synchronously) instead of
// a magnet that requires DHT/tracker round-trips before 'ready' fires.
const fetchTorrentFileBuffer = async (torrentId) => {
  const res = await axios.get(`${NYAA_BASE_URL}/download/${torrentId}.torrent`, {
    proxy: false,
    timeout: 20000,
    responseType: 'arraybuffer',
    headers: {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: '*/*',
    },
  });
  return Buffer.from(res?.data || []);
};

const client = new WebTorrent({
  dht: true,
  lsd: true,
  pex: true,
  utPex: true,
  natUpnp: true,
  natPmp: true,
});

// Map<infoHash, Promise<torrent>> — collapses concurrent calls for the same
// hash onto a single underlying add. The promise resolves with the torrent
// once WebTorrent fires 'ready'.
const inFlight = new Map();

let serverlessWarned = false;

const isServerless = Boolean(
  process.env.VERCEL ||
  process.env.VERCEL_ENV ||
  process.env.AWS_LAMBDA_FUNCTION_NAME ||
  process.env.NETLIFY ||
  process.env.CF_PAGES ||
  process.env.RENDER ||
  process.env.RAILWAY,
);

const ensureClient = () => {
  if (isServerless && !serverlessWarned) {
    serverlessWarned = true;
    console.warn(
      '[nyaa/stream] WebTorrent requires a long-lived Node process with UDP ' +
      'peers and a DHT node. Running on a serverless platform is unlikely to ' +
      'work — use a VPS or bare-metal host.',
    );
  }
  return client;
};

client.on('error', (err) => {
  console.error('[nyaa/stream] client error:', err.message);
});

// Resolve once the torrent fires 'ready' (or reject on error / 60s timeout).
// If the torrent is already ready — true when the source is a bencoded
// .torrent buffer — skip the listener wiring entirely.
const awaitReady = (torrent, infoHash) =>
  new Promise((resolve, reject) => {
    if (torrent.ready) {
      resolve(torrent);
      return;
    }
    const finish = () => {
      clearTimeout(handle);
      torrent.removeListener('ready', onReady);
      torrent.removeListener('error', onError);
    };
    const onReady = () => {
      finish();
      torrent.on('error', (err) =>
        console.error(`[nyaa/stream] torrent ${infoHash} error:`, err.message));
      torrent.on('done', () =>
        console.log(`[nyaa/stream] torrent ${infoHash} download complete`));
      console.log(
        `[nyaa/stream] torrent ${infoHash} ready (${torrent.files.length} files)`,
      );
      resolve(torrent);
    };
    const onError = (err) => {
      finish();
      reject(err);
    };
    const handle = setTimeout(() => {
      finish();
      reject(new Error(`Torrent ${infoHash} metadata fetch timed out after 60s`));
    }, 60000);
    torrent.once('ready', onReady);
    torrent.once('error', onError);
  });

// Add the torrent via `factory(infoHash)` (returning the WebTorrent torrent
// object) and dedupe concurrent calls for the same infoHash. Rehydrates an
// already-loaded torrent from the client when one exists.
const addInternal = async (infoHash, factory) => {
  const existing = inFlight.get(infoHash);
  if (existing) return existing;

  const promise = (async () => {
    const cached = await client.get(infoHash);
    if (cached) return cached;
    return factory();
  })().then((torrent) => awaitReady(torrent, infoHash));

  inFlight.set(infoHash, promise);
  try {
    return await promise;
  } finally {
    // Leave the resolved torrent on the underlying WebTorrent client but drop
    // the in-flight promise so new callers hit the synchronous fast path.
    inFlight.delete(infoHash);
  }
};

const addMagnet = (magnet, infoHash) =>
  addInternal(infoHash, () => client.add(magnet));

const addTorrentFile = (buf, infoHash, { trackers } = {}) => {
  const buffer = Buffer.isBuffer(buf) ? buf : Buffer.from(buf || []);
  if (!buffer.length) throw new Error('Empty torrent file buffer');
  // .torrent buffer contains the full bencoded info dict, so WebTorrent
  // parses metadata synchronously and 'ready' fires before this returns.
  // Trackers from the magnet link are passed in explicitly because stripping
  // them leaves WebTorrent with only DHT, which is too slow for ffprobe/ffmpeg
  // pipes to read header bytes quickly.
  const opts = {};
  if (Array.isArray(trackers) && trackers.length) opts.announce = trackers;
  return addInternal(infoHash, () => client.add(buffer, opts));
};

const lookupTorrent = async (infoHash) => {
  const torrent = await client.get(infoHash);
  return torrent?.ready ? torrent : null;
};

// Pick the video file inside a torrent that best matches the requested
// episode. Uses the same strict/fallback episode regex as the scraper so the
// stream endpoint and episode-sources endpoint agree on numbering.
const selectFile = (torrent, episodeNumber) => {
  if (!torrent?.files?.length) return null;

  const videoFiles = torrent.files.filter((f) => VIDEO_EXTENSIONS.test(f.name));
  if (!videoFiles.length) return null;

  if (!episodeNumber || episodeNumber < 1) {
    return videoFiles.reduce((a, b) => (a.length > b.length ? a : b));
  }

  let best = null;
  let bestDistance = Infinity;
  for (const file of videoFiles) {
    const ep = extractEpisodeFromName(file.name);
    if (!ep) continue;
    const distance = Math.abs(ep - episodeNumber);
    if (distance < bestDistance) {
      best = file;
      bestDistance = distance;
      if (distance === 0) break;
    }
  }
  return best || videoFiles.reduce((a, b) => (a.length > b.length ? a : b));
};

// Health probe: add the torrent, wait briefly for trackers/DHT, then count
// peers AND attempt to read the first bytes of the file the caller cares
// about. Returns `{ ok, peers, downloadedBytes, latencyMs }` so the resolver
// can rank candidates by liveness instead of trusting raw metadata.
//
// Why both peers AND bytes: a torrent can have peers but no-one is sending
// the file we want (choked, slow, or the peer has the torrent but isn't
// seeding the specific piece we asked for). Reading actual bytes is the
// only reliable liveness signal.
// Health probe: add the torrent, wait briefly for trackers/DHT, then count
// peers AND attempt to read the first bytes of the file the caller cares
// about. Returns `{ ok, peers, downloadedBytes, latencyMs }` so the resolver
// can rank candidates by liveness instead of trusting raw metadata.
//
// Accepts either:
//   - { torrentId, infoHash, trackers, ... }   — preferred; uses the bencoded
//     .torrent file from nyaa so metadata is parsed synchronously and
//     trackers from the magnet override the file's announce-list.
//   - { torrentRow, ... }                       — back-compat: rows from
//     extractTorrentRows expose the numeric id as `id`, not the hex hash.
const probeHealth = async ({
  torrentRow,
  torrentId: rawTorrentId,
  infoHash: rawInfoHash,
  trackers = [],
  episodeNumber,
  probeBytes = 16384,
  waitMs = 6000,
}) => {
  // Accept either the new explicit args or the legacy { torrentRow } shape.
  const torrentId = rawTorrentId || torrentRow?.id;
  const infoHash = (rawInfoHash || torrentRow?.infoHash || '').toLowerCase();
  if (!torrentId && !infoHash) {
    return { ok: false, peers: 0, downloadedBytes: 0, latencyMs: 0 };
  }

  const start = Date.now();

  // Already loaded? Skip the add and use the live torrent. The key under
  // which WebTorrent stores the torrent is the lower-cased hex info hash.
  let torrent = infoHash ? await client.get(infoHash) : null;
  if (!torrent) {
    torrent = await new Promise((resolve) => {
      let t;
      let added = false;
      const finish = (value) => {
        clearTimeout(handle);
        if (t) {
          t.removeListener('ready', onReady);
          t.removeListener('error', onError);
        }
        resolve(value);
      };
      const onReady = () => finish(t);
      const onError = (e) => {
        // "Cannot add duplicate torrent" is expected when another copy of
        // this hash is already loaded — fall through to the existing one.
        if (/duplicate/i.test(e.message || '')) {
          const existing = t?.infoHash ? client.get(t.infoHash.toLowerCase()) : null;
          if (existing) {
            try { t.destroy(); } catch {}
            t = existing;
            clearTimeout(handle);
            resolve(t);
            return;
          }
        }
        console.warn(`[nyaa/stream/probe] ${torrentId || infoHash} error:`, e.message);
        finish(null);
      };
      const handle = setTimeout(() => {
        if (added) console.warn(`[nyaa/stream/probe] ${torrentId || infoHash} timed out`);
        finish(t || null);
      }, 15000);

      try {
        if (infoHash) {
          // Magnet path: build with trackers so WebTorrent announces to them
          // and gets peers faster than DHT alone.
          const trackersParam = trackers.length
            ? trackers.map((tr) => `&tr=${encodeURIComponent(tr)}`).join('')
            : '';
          const magnet = `magnet:?xt=urn:btih:${infoHash}${trackersParam}`;
          t = client.add(magnet);
          added = true;
          // Attach listeners synchronously — duplicate-torrent errors fire
          // immediately on add().
          t.once('ready', onReady);
          t.once('error', onError);
          if (t.ready) {
            clearTimeout(handle);
            resolve(t);
          }
        } else if (torrentId) {
          // Numeric Nyaa id only — fetch the .torrent file ourselves so we
          // can pass its bencoded buffer (synchronous metadata parse).
          fetchTorrentFileBuffer(torrentId)
            .then((buf) => {
              if (!buf || !buf.length) {
                console.warn(`[nyaa/stream/probe] ${torrentId}: empty buffer`);
                finish(null);
                return;
              }
              try {
                const opts = {};
                if (Array.isArray(trackers) && trackers.length) opts.announce = trackers;
                t = client.add(buf, opts);
                added = true;
                t.once('ready', onReady);
                t.once('error', onError);
                if (t.ready) {
                  clearTimeout(handle);
                  resolve(t);
                }
              } catch (err) {
                console.warn(`[nyaa/stream/probe] ${torrentId} add failed:`, err.message);
                finish(null);
              }
            })
            .catch((err) => {
              console.warn(`[nyaa/stream/probe] ${torrentId} fetch failed:`, err.message);
              finish(null);
            });
          return; // finish() is handled in the .then/.catch above
        } else {
          finish(null);
          return;
        }
      } catch (err) {
        console.warn('[nyaa/stream/probe] add failed:', err.message);
        finish(null);
        return;
      }
    });
  }

  if (!torrent) return { ok: false, peers: 0, downloadedBytes: 0, latencyMs: Date.now() - start };

  // Wait briefly for peers to connect (trackers + DHT). We also poll up to
  // `waitMs` for the first wire to attach — `numPeers` is a tracker scrape
  // result and lags reality by tens of seconds on slow trackers.
  await new Promise((resolve) => {
    let elapsed = 0;
    const tick = 250;
    const check = () => {
      const wires = Array.isArray(torrent.wires) ? torrent.wires.length : 0;
      const reported = typeof torrent.numPeers === 'number' ? torrent.numPeers : 0;
      if (wires > 0 || reported > 0 || elapsed >= waitMs) {
        resolve();
        return;
      }
      elapsed += tick;
      setTimeout(check, tick);
    };
    check();
  });

  // numPeers is the count from the last tracker scrape and lags reality.
  // torrent.wires is the set of currently-connected peers — that's the
  // authoritative live signal. Take the max so we count peers the swarm
  // announced even if we haven't handshaked with them all yet.
  const livePeers = Array.isArray(torrent.wires) ? torrent.wires.length : 0;
  const reportedPeers = typeof torrent.numPeers === 'number' ? torrent.numPeers : 0;
  const peers = Math.max(livePeers, reportedPeers);

  // Find the file inside this torrent that matches the requested episode.
  const file = selectFile(torrent, episodeNumber) || torrent.files[0];
  if (!file) return { ok: false, peers, downloadedBytes: 0, latencyMs: Date.now() - start };

  // Try to actually pull the first chunk. If we get bytes, the torrent is
  // live enough to stream.
  let downloadedBytes = 0;
  let latencyMs = 0;
  try {
    await new Promise((resolve) => {
      const stream = file.createReadStream({ start: 0, end: probeBytes - 1 });
      let firstChunkTime = null;
      stream.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        if (!firstChunkTime) firstChunkTime = Date.now();
      });
      stream.on('end', () => {
        if (firstChunkTime) latencyMs = firstChunkTime - start;
        resolve();
      });
      stream.on('error', () => resolve());
      setTimeout(resolve, 5000);
    });
  } catch {
    // ignore
  }

  // Authoritative peer count: max of currently-connected wires and the last
  // tracker scrape. Wires is the live signal — numPeers can lag by tens of
  // seconds on slow trackers. Reporting only numPeers here caused the
  // auto-reroute to think a 2-wire torrent was dead and skip it.
  const finalPeers = Math.max(
    Array.isArray(torrent.wires) ? torrent.wires.length : 0,
    typeof torrent.numPeers === 'number' ? torrent.numPeers : 0,
  );

  return {
    ok: downloadedBytes > 0,
    peers: finalPeers,
    reportedPeers: typeof torrent.numPeers === 'number' ? torrent.numPeers : 0,
    liveWires: Array.isArray(torrent.wires) ? torrent.wires.length : 0,
    downloadedBytes,
    latencyMs,
    infoHash,
    torrent,
    file,
    fileIndex: torrent.files.indexOf(file),
  };
};

export const torrentClient = {
  ensureClient,
  addMagnet,
  addTorrentFile,
  lookupTorrent,
  selectFile,
  probeHealth,
};