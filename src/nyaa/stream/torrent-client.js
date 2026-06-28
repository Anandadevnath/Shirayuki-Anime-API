// Single in-process WebTorrent client. One client is reused across all
// /api/v2/nyaa/stream/* requests so we don't spin up a new DHT node per call.
// Each torrent is added once and looked up by infoHash thereafter — keeping
// it alive lets a returning client resume a partially downloaded file.
//
// Cache eviction: WebTorrent stores each torrent's chunks under
// `path` (defaults to /tmp/webtorrent) and never cleans them up by itself.
// To prevent unbounded disk growth we keep an LRU of loaded torrents and
// call client.remove(infoHash) once a torrent is the oldest and either the
// torrent-count or total-bytes cap has been exceeded. Defaults: 5 torrents
// or 5 GiB. Tune with WEBTORRENT_MAX_TORRENTS / WEBTORRENT_MAX_BYTES.

import WebTorrent from 'webtorrent';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
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

// Cache directory for downloaded chunks. WebTorrent's default is
// `os.tmpdir()/webtorrent` (i.e. /tmp/webtorrent on Linux). Allow override via
// WEBTORRENT_CACHE_DIR so the user can point it at a bigger disk.
const CACHE_DIR = (() => {
  const raw = process.env.WEBTORRENT_CACHE_DIR?.trim();
  if (!raw) return path.join(os.tmpdir(), 'webtorrent');
  try {
    fs.mkdirSync(raw, { recursive: true });
    return raw;
  } catch (err) {
    console.warn(`[nyaa/stream] WEBTORRENT_CACHE_DIR=${raw} unusable (${err.message}); falling back to default`);
    return path.join(os.tmpdir(), 'webtorrent');
  }
})();

// Eviction limits. Both default to safe-for-/tmp values. Override via env.
const MAX_TORRENTS = (() => {
  const n = Number(process.env.WEBTORRENT_MAX_TORRENTS);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 5;
})();
const MAX_BYTES = (() => {
  const n = Number(process.env.WEBTORRENT_MAX_BYTES);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 5 * 1024 * 1024 * 1024; // 5 GiB
})();

const client = new WebTorrent({
  dht: true,
  lsd: true,
  pex: true,
  utPex: true,
  natUpnp: true,
  natPmp: true,
  path: CACHE_DIR,
});

// LRU tracking — `lastAccess` is bumped on every add/lookup so we can pick the
// oldest torrent when we need to evict. Keyed by lower-cased infoHash.
const lastAccess = new Map(); // infoHash -> { ts: number, bytes: number }
const liveStreams = new Map(); // infoHash -> count of in-flight HTTP streams

const touchAccess = (infoHash, bytes = 0) => {
  const key = infoHash?.toLowerCase?.();
  if (!key) return;
  const prev = lastAccess.get(key);
  lastAccess.set(key, { ts: Date.now(), bytes: prev?.bytes ?? bytes });
};

// Approximate disk usage per torrent. Used only for cacheInfo diagnostics —
// eviction uses cacheDirBytes() instead, since per-torrent attribution
// requires torrent.files (which is empty until the torrent is 'ready').
const torrentOnDiskBytes = (torrent) => {
  if (!torrent) return 0;
  if (Array.isArray(torrent.files) && torrent.files.length) {
    return torrent.files.reduce((acc, f) => acc + (f.length || 0), 0);
  }
  return torrent.length || 0;
};

// Total bytes WebTorrent has on disk across ALL loaded torrents. We don't
// attribute bytes per torrent — instead we measure the whole CACHE_DIR and
// rely on the eviction policy (oldest-first LRU) to make room. WebTorrent
// stores every chunk under CACHE_DIR (the file's name is the basename of the
// torrent's file path), so a single directory walk gives us an authoritative
// figure. Cheap enough to run every 30 s.
const cacheDirBytes = () => dirSize(CACHE_DIR);

const dirSize = (dir) => {
  let total = 0;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    try {
      if (entry.isDirectory()) {
        total += dirSize(full);
      } else if (entry.isFile()) {
        total += fs.statSync(full).size;
      }
    } catch {
      // entry disappeared mid-walk — skip it
    }
  }
  return total;
};

// Drop the oldest torrent(s) until we're back under both caps. Skips torrents
// that still have an open HTTP stream so we never yank bytes out from under a
// playing browser. Returns the list of removed infoHashes for logging.
const evictIfNeeded = () => {
  const removed = [];
  // Sort loaded torrents by lastAccess ascending (oldest first).
  const allHashes = Array.from(lastAccess.keys()).filter((h) => client.get(h));

  const overCount = () => allHashes.length - MAX_TORRENTS;
  const overBytes = () => cacheDirBytes() - MAX_BYTES;

  let safety = allHashes.length + 1; // prevent infinite loops
  while (safety-- > 0 && (overCount() > 0 || overBytes() > 0)) {
    // Pick the oldest hash that has no active streams.
    const candidate = allHashes
      .filter((h) => (liveStreams.get(h) || 0) === 0)
      .sort((a, b) => lastAccess.get(a).ts - lastAccess.get(b).ts)[0];
    if (!candidate) {
      // Everything has active streams — bail rather than evicting under a live
      // player. The cap will be re-checked on the next stream end.
      break;
    }
    try {
      const bytesBefore = cacheDirBytes();
      // WebTorrent's client.remove is async — it does `await this.get(...)`
      // and throws if the torrent isn't there. The throw happens inside a
      // Promise we can't catch with try/catch, so we attach a .catch handler.
      // The sync `client.get` guard below short-circuits the common case.
      if (!client.get(candidate)) {
        lastAccess.delete(candidate);
        continue;
      }
      const removePromise = client.remove(candidate, { destroyStore: true }, (err) => {
        if (err) console.warn(`[nyaa/stream] evict ${candidate} failed:`, err.message);
        else console.log(`[nyaa/stream] evicted ${candidate.slice(0, 10)}...`);
      });
      // WebTorrent's remove returns the Promise but the API is callback-first.
      // Guard against both the resolved-but-erroring case and the
      // unhandled-rejection case.
      if (removePromise && typeof removePromise.catch === 'function') {
        removePromise.catch((err) => {
          console.warn(`[nyaa/stream] evict ${candidate} promise rejected:`, err.message);
        });
      }
      removed.push(candidate);
    } catch (err) {
      console.warn(`[nyaa/stream] evict ${candidate} threw:`, err.message);
    }
    lastAccess.delete(candidate);
    const idx = allHashes.indexOf(candidate);
    if (idx >= 0) allHashes.splice(idx, 1);
  }
  return removed;
};

// External hooks used by the stream controller to mark a torrent as "in use"
// while a browser is downloading it. Without this we could evict the torrent
// serving an active stream and cause the playback to stall.
const acquireStream = (infoHash) => {
  const key = infoHash?.toLowerCase?.();
  if (!key) return;
  liveStreams.set(key, (liveStreams.get(key) || 0) + 1);
};
const releaseStream = (infoHash) => {
  const key = infoHash?.toLowerCase?.();
  if (!key) return;
  const next = (liveStreams.get(key) || 0) - 1;
  if (next <= 0) liveStreams.delete(key);
  else liveStreams.set(key, next);
  // Stream just ended — touch the timestamp so it stays "recent" briefly, then
  // check whether we should evict older torrents now that this slot is free.
  touchAccess(key);
  evictIfNeeded();
};

// Periodic eviction sweep. Without this, a long-running stream whose source
// torrent keeps growing on disk could blow past MAX_BYTES without ever
// triggering a cap check (the only hooks today are add and release). Run
// every 30 s; the operation is cheap (one directory walk + O(N) comparisons)
// and only fires `client.remove` when the cap is actually exceeded.
const EVICT_INTERVAL_MS = 30_000;
let evictionTimer = null;
const startEvictionWatcher = () => {
  if (evictionTimer) return;
  evictionTimer = setInterval(() => {
    // Wrap in process-level handlers so an uncaught throw inside an async
    // client.remove callback can't kill the server. evictIfNeeded already
    // catches per-torrent errors, but WebTorrent occasionally emits async
    // errors on the next tick that we want to surface as warnings only.
    const onUnhandled = (err) => {
      console.warn('[nyaa/stream] unhandled error during periodic eviction:', err?.message || err);
    };
    process.once('uncaughtException', onUnhandled);
    try {
      const removed = evictIfNeeded();
      if (removed.length) {
        const total = cacheDirBytes();
        console.log(
          `[nyaa/stream] periodic eviction removed ${removed.length} torrent(s); cache now ${(total / 1e6).toFixed(1)} MB / ${(MAX_BYTES / 1e6).toFixed(0)} MB cap`,
        );
      }
    } catch (err) {
      console.warn('[nyaa/stream] periodic eviction threw:', err.message);
    } finally {
      process.removeListener('uncaughtException', onUnhandled);
    }
  }, EVICT_INTERVAL_MS);
  // unref so the timer never keeps the process alive on its own
  evictionTimer.unref?.();
};
startEvictionWatcher();

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

// Process-level guards. WebTorrent's client.remove does `await this.get(...)`
// and throws synchronously inside the awaited Promise if the hash isn't on
// the client. Even with our sync `client.get` guard there's a tiny race
// where a torrent is removed between the guard and the async remove. A
// thrown Error inside an async function without a downstream .catch becomes
// an unhandledRejection, which by default terminates the Node process — so
// we install a handler that logs and continues. Module-scoped flag prevents
// double-installation if this module is re-imported.
if (!globalThis.__pukuWebtorrentGuardsInstalled) {
  globalThis.__pukuWebtorrentGuardsInstalled = true;
  process.on('unhandledRejection', (reason) => {
    const msg = reason?.message || String(reason);
    if (/No torrent with id/.test(msg)) {
      console.warn('[nyaa/stream] swallowed unhandled rejection:', msg);
      return;
    }
    console.error('[nyaa/stream] unhandledRejection:', msg);
  });
  process.on('uncaughtException', (err) => {
    const msg = err?.message || String(err);
    if (/No torrent with id/.test(msg)) {
      console.warn('[nyaa/stream] swallowed uncaught exception:', msg);
      return;
    }
    console.error('[nyaa/stream] uncaughtException:', msg);
  });
}

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
      // Re-check the cache cap whenever this torrent pulls bytes. WebTorrent
      // emits `download` once per ~1 s of active downloading — cheap signal
      // that the on-disk footprint just grew. Without this the periodic
      // watcher (30 s) is the only enforcement point, which means a 30 s
      // stream can blow past MAX_BYTES before we react.
      torrent.on('download', () => {
        if (cacheDirBytes() > MAX_BYTES) {
          evictIfNeeded();
        }
      });
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
    if (cached) {
      touchAccess(infoHash, torrentOnDiskBytes(cached));
      return cached;
    }
    return factory();
  })().then((torrent) => {
    // Bump LRU timestamp once the torrent is ready (or already was).
    touchAccess(infoHash, torrentOnDiskBytes(torrent));
    // Make room before adding if we're already at the cap — unlikely but
    // covers the case where the client had stale torrents from a prior run.
    evictIfNeeded();
    return torrent;
  });

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
  if (torrent?.ready) {
    touchAccess(infoHash, torrentOnDiskBytes(torrent));
    return torrent;
  }
  return null;
};

// Explicit eviction. Used when the caller knows it no longer needs a torrent
// (e.g. user navigated away from a batch view). Skips removal if the torrent
// still has an active HTTP stream.
const removeTorrent = (infoHash) => {
  const key = infoHash?.toLowerCase?.();
  if (!key) return false;
  if ((liveStreams.get(key) || 0) > 0) return false;
  if (!client.get(key)) {
    lastAccess.delete(key);
    return false;
  }
  try {
    const p = client.remove(key, { destroyStore: true }, (err) => {
      if (err) console.warn(`[nyaa/stream] remove ${key} failed:`, err.message);
    });
    if (p && typeof p.catch === 'function') {
      p.catch((err) => console.warn(`[nyaa/stream] remove ${key} rejected:`, err.message));
    }
    lastAccess.delete(key);
    return true;
  } catch (err) {
    console.warn(`[nyaa/stream] remove ${key} threw:`, err.message);
    lastAccess.delete(key);
    return false;
  }
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
  removeTorrent,
  acquireStream,
  releaseStream,
  evictIfNeeded,
  startEvictionWatcher,
  selectFile,
  probeHealth,
  // Exposed for diagnostics / a future /admin/cache endpoint.
  cacheInfo: () => {
    const all = Array.from(lastAccess.entries()).map(([hash, meta]) => {
      const t = client.get(hash);
      return {
        infoHash: hash,
        lastAccess: meta.ts,
        bytes: torrentOnDiskBytes(t),
        activeStreams: liveStreams.get(hash) || 0,
        files: t?.files?.length ?? 0,
      };
    });
    return {
      cacheDir: CACHE_DIR,
      maxTorrents: MAX_TORRENTS,
      maxBytes: MAX_BYTES,
      torrentCount: all.length,
      cacheDirBytes: cacheDirBytes(),
      torrents: all.sort((a, b) => b.lastAccess - a.lastAccess),
    };
  },
};