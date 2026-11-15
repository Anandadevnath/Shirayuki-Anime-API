import WebTorrent from 'webtorrent';
import { rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import config from './config.js';
import { selectFileIndex } from './file-select.js';
import { startHls } from './hls-transcoder.js';
import { findAbandoned } from './session-policy.js';
import { buildMagnet } from '../src/nyaa/_shared.js';
import { signStreamToken } from '../src/nyaa/scraper/stream-token.js';

// MKV headers (embedded fonts) are often 5-10 MB before the first frame, so the
// startup window must cover header + first segments, not a fixed piece count.
const STARTUP_CRITICAL_BYTES = 16 * 1024 * 1024;
const READY_POLL_MS = 500;

const log = (msg) => process.stdout.write(`[stream] ${new Date().toISOString()} ${msg}\n`);

const client = new WebTorrent({ uploadLimit: config.uploadLimit, natUpnp: false, natPmp: false });
client.on('error', (err) => log(`client error: ${err.message}`));

/** hash -> Promise<Torrent> */
const torrents = new Map();
/** `${hash}:${sel}` -> session */
const sessions = new Map();

const sessionKey = (hash, sel) => `${hash}:${sel}`;

const addTorrent = (hash) =>
  new Promise((resolve, reject) => {
    const torrent = client.add(buildMagnet(hash), {
      path: config.torrentDir,
      deselect: true,
      destroyStoreOnDestroy: true,
    });
    const timer = setTimeout(() => {
      torrent.destroy({ destroyStore: true });
      reject(new Error('Timed out fetching torrent metadata (no peers?)'));
    }, config.metadataTimeoutMs);
    torrent.once('ready', () => {
      clearTimeout(timer);
      resolve(torrent);
    });
    torrent.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });

const getTorrent = (hash) => {
  if (!torrents.has(hash)) {
    const pending = addTorrent(hash).catch((err) => {
      torrents.delete(hash);
      throw err;
    });
    torrents.set(hash, pending);
  }
  return torrents.get(hash);
};

const prioritizeFile = (torrent, file) => {
  file.select();
  const start = file._startPiece;
  const end = file._endPiece;
  // First pieces only: ffprobe/ffmpeg read linearly (-seekable 0), so the MKV cues at
  // the end are never needed for startup and would steal bandwidth from it.
  const pieces = Math.ceil(STARTUP_CRITICAL_BYTES / torrent.pieceLength);
  torrent.critical(start, Math.min(end, start + pieces));
};

// A session touched within this window counts as "being watched" and is never evicted.
const ACTIVE_WINDOW_MS = 2 * 60 * 1000;

export class WorkerBusyError extends Error {
  constructor() {
    super('Stream worker is at capacity, try again in a few minutes');
    this.status = 503;
  }
}

const isLive = (session) => sessions.get(session.key) === session;

/** Pick an idle session to evict, or throw if every slot is actively watched. */
const reserveSlot = () => {
  if (sessions.size < config.maxSessions) return null;
  const now = Date.now();
  const idle = [...sessions.values()]
    .filter((s) => now - s.lastAccess > ACTIVE_WINDOW_MS)
    .sort((a, b) => a.lastAccess - b.lastAccess)[0];
  if (!idle) throw new WorkerBusyError();
  return idle;
};

const createSession = (hash, sel, key) => {
  // Reserve the slot synchronously (no await before sessions.set), so concurrent
  // requests for the same key share one session and maxSessions is respected.
  const victim = reserveSlot();
  const session = {
    key,
    hash,
    sel,
    createdAt: Date.now(),
    lastAccess: Date.now(),
    outDir: path.join(config.hlsDir, `${hash}-${sel}`),
    file: null,
    hls: null,
    hlsStarting: null,
    error: null,
    ready: null,
  };
  sessions.set(key, session);
  if (victim) destroySession(victim.key, 'evicted (idle, max sessions)').catch(() => {});
  session.ready = getTorrent(hash)
    .then((torrent) => {
      if (!isLive(session)) throw new Error('session closed');
      const index = selectFileIndex(torrent.files, sel);
      session.file = torrent.files[index];
      prioritizeFile(torrent, session.file);
      log(`session ${key} -> ${session.file.name}`);
      return session;
    })
    .catch((err) => {
      session.error = err.message;
      if (isLive(session)) destroySession(key, `failed: ${err.message}`).catch(() => {});
      throw err;
    });
  return session;
};

/**
 * Get or create the session for hash/sel: torrent metadata + selected file.
 * With `create: false` (ffmpeg's internal reads) a missing session is an error,
 * so a closed session can never be revived by its own ffmpeg.
 */
export const getSession = async (hash, sel, { touch = true, create = true } = {}) => {
  const key = sessionKey(hash, sel);
  let session = sessions.get(key);
  if (!session) {
    if (!create) throw new Error('session not found');
    session = createSession(hash, sel, key);
  }
  if (touch) session.lastAccess = Date.now();
  return session.ready;
};

const internalRawUrl = (hash, sel) => {
  const t = signStreamToken({ hash, sel, ttlSec: config.tokenTtlSec, secret: config.secret });
  return `http://127.0.0.1:${config.port}/raw/${hash}/${sel}?internal=1&t=${encodeURIComponent(t)}`;
};

/** Ensure ffmpeg is producing HLS for this session. */
export const ensureHls = async (hash, sel) => {
  const session = await getSession(hash, sel);
  if (session.hls?.state === 'failed') {
    // Drop the broken session so the next request starts clean (and the sweep isn't blocked).
    const reason = session.hls.error || 'Transcoding failed';
    await destroySession(session.key, 'transcode failed');
    throw new Error(reason);
  }
  if (!session.hls && !session.hlsStarting) {
    session.hlsStarting = startHls({
      inputUrl: internalRawUrl(hash, sel),
      outDir: session.outDir,
      transcodeMode: config.transcode,
      log: (m) => log(`${session.key} ${m}`),
    })
      .then((handle) => {
        session.hls = handle;
        // Closed while ffprobe was running: don't leave ffmpeg orphaned.
        if (!isLive(session)) {
          handle.stop();
          throw new Error('session closed');
        }
        return handle;
      })
      .catch((err) => {
        session.error = err.message;
        session.hlsStarting = null;
        throw err;
      });
  }
  await session.hlsStarting;
  return session;
};

const countSegments = (playlist) => (playlist.match(/^seg_\d+\.ts$/gm) || []).length;

/**
 * Wait until the playlist lists at least one segment, or time out.
 * @returns {Promise<string|null>} playlist text, or null on timeout
 */
export const waitForPlaylist = async (session, timeoutMs = config.readyTimeoutMs) => {
  const deadline = Date.now() + timeoutMs;
  const file = path.join(session.outDir, 'index.m3u8');
  while (Date.now() < deadline) {
    if (session.hls?.state === 'failed') throw new Error(session.hls.error || 'Transcoding failed');
    if (!isLive(session)) throw new Error('session closed');
    try {
      const text = await readFile(file, 'utf8');
      if (countSegments(text) > 0) return text;
    } catch {
      // Not written yet.
    }
    await new Promise((r) => setTimeout(r, READY_POLL_MS));
  }
  return null;
};

export const findSession = (hash, sel) => sessions.get(sessionKey(hash, sel)) || null;

export async function destroySession(key, reason = 'idle') {
  const session = sessions.get(key);
  if (!session) return;
  sessions.delete(key);
  session.hls?.stop();
  // If ffprobe is still running, stop ffmpeg as soon as it starts.
  session.hlsStarting?.then((h) => h.stop()).catch(() => {});
  await rm(session.outDir, { recursive: true, force: true }).catch(() => {});
  const stillUsed = [...sessions.values()].some((s) => s.hash === session.hash);
  if (!stillUsed && torrents.has(session.hash)) {
    const pending = torrents.get(session.hash);
    torrents.delete(session.hash);
    pending.then((t) => t.destroy({ destroyStore: true })).catch(() => {});
  }
  log(`session ${key} closed (${reason})`);
}

/** Mark a session as watched (used while long /raw responses are streaming). */
export const touchSession = (session) => {
  if (session) session.lastAccess = Date.now();
};

export const sessionStatus = async (session) => {
  const torrent = await torrents.get(session.hash)?.catch(() => null);
  let segments = 0;
  try {
    segments = countSegments(await readFile(path.join(session.outDir, 'index.m3u8'), 'utf8'));
  } catch {
    segments = 0;
  }
  return {
    hash: session.hash,
    sel: session.sel,
    file: session.file ? { name: session.file.name, size: session.file.length, progress: session.file.progress } : null,
    peers: torrent?.numPeers ?? 0,
    downloadSpeed: torrent?.downloadSpeed ?? 0,
    uploadSpeed: torrent?.uploadSpeed ?? 0,
    hls: session.hls
      ? {
          state: session.hls.state,
          segments,
          duration: session.hls.duration,
          plan: session.hls.plan,
          error: session.hls.error,
        }
      : null,
    error: session.error,
    idleSec: Math.round((Date.now() - session.lastAccess) / 1000),
  };
};

export const listSessions = () => [...sessions.values()];

const sweep = async () => {
  const now = Date.now();
  for (const s of findAbandoned([...sessions.values()], now)) await destroySession(s.key, 'abandoned');
  for (const s of [...sessions.values()]) {
    if (now - s.lastAccess > config.idleMs) await destroySession(s.key, 'idle');
  }
};
setInterval(() => {
  sweep().catch((err) => log(`sweep error: ${err.message}`));
}, config.sweepIntervalMs).unref();

export const shutdown = async () => {
  for (const key of [...sessions.keys()]) await destroySession(key, 'shutdown');
  await new Promise((resolve) => client.destroy(() => resolve()));
};

export { log };
