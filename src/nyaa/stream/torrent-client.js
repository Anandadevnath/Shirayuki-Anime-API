// Single in-process WebTorrent client. One client is reused across all
// /api/v2/nyaa/stream/* requests so we don't spin up a new DHT node per call.
// Each torrent is added once and looked up by infoHash thereafter — keeping
// it alive lets a returning client resume a partially downloaded file.

import WebTorrent from 'webtorrent';
import { extractEpisodeFromName, VIDEO_EXTENSIONS } from '../scraper/_shared.js';

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

const addTorrentFile = (buf, infoHash) => {
  const buffer = Buffer.isBuffer(buf) ? buf : Buffer.from(buf || []);
  if (!buffer.length) throw new Error('Empty torrent file buffer');
  // .torrent buffer contains the full bencoded info dict, so WebTorrent
  // parses metadata synchronously and 'ready' fires before this returns.
  return addInternal(infoHash, () => client.add(buffer, { announce: [] }));
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

export const torrentClient = {
  ensureClient,
  addMagnet,
  addTorrentFile,
  lookupTorrent,
  selectFile,
};