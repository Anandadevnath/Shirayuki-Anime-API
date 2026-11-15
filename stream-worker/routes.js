import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import path from 'node:path';
import config from './config.js';
import {
  getSession,
  ensureHls,
  waitForPlaylist,
  findSession,
  sessionStatus,
  listSessions,
  touchSession,
  log,
} from './torrent-manager.js';
import { mimeForFile } from './file-select.js';
import { SEGMENT_RE, fail, guard as guardWith, rewritePlaylist, parseRange } from './http-utils.js';

const RETRY_AFTER_SEC = '3';

const guard = (c) => guardWith(c, config.secret);
const params = (c) => ({ hash: c.req.param('hash').toLowerCase(), sel: c.req.param('sel') });

const TOUCH_EVERY_BYTES = 8 * 1024 * 1024;
const PREPARE_FAST_FAIL_MS = 50;

// Map internal errors to a status + a client-safe message. ffmpeg stderr can
// contain local paths and the internal URL/token, so it is logged, not returned.
const toClientError = (err, context) => {
  if (err.status === 503) return { status: 503, message: err.message };
  const msg = String(err.message || '');
  if (/metadata|no peers/i.test(msg)) return { status: 404, message: 'Torrent has no reachable peers right now' };
  if (/no playable|not found in this batch|not a video/i.test(msg)) return { status: 404, message: msg };
  if (/session (closed|not found)/i.test(msg)) return { status: 410, message: 'Session closed, request the playlist again' };
  log(`${context} failed: ${msg}`);
  return { status: 502, message: 'Could not prepare this stream (see worker logs)' };
};

const failWith = (c, err, context) => {
  const { status, message } = toClientError(err, context);
  if (status === 503) c.header('Retry-After', '60');
  return fail(c, status, message);
};

// Wrap an async iterator so every ~8 MiB served counts as viewer activity:
// a single long VLC/mpv request must not be swept as idle mid-episode.
async function* touchingIterator(iterator, session) {
  let sinceTouch = 0;
  for await (const chunk of iterator) {
    sinceTouch += chunk.length;
    if (sinceTouch >= TOUCH_EVERY_BYTES) {
      touchSession(session);
      sinceTouch = 0;
    }
    yield chunk;
  }
}

export const createWorkerApp = () => {
  const app = new Hono();
  app.use('*', cors({ origin: '*', exposeHeaders: ['Content-Length', 'Content-Range', 'Accept-Ranges'] }));

  app.get('/health', (c) => c.json({ success: true, data: { sessions: listSessions().length } }));

  // Start fetching + transcoding ahead of playback; returns immediately.
  app.post('/prepare/:hash/:sel', async (c) => {
    const bad = guard(c);
    if (bad) return bad;
    const { hash, sel } = params(c);
    // Fail fast when full, so the API can report it; everything else continues in the background.
    const started = ensureHls(hash, sel);
    started.catch((err) => log(`prepare ${hash}:${sel} failed: ${err.message}`));
    try {
      // A capacity error rejects within microtasks; real work takes far longer than this.
      await Promise.race([started, new Promise((r) => setTimeout(r, PREPARE_FAST_FAIL_MS))]);
    } catch (err) {
      return failWith(c, err, `prepare ${hash}:${sel}`);
    }
    return c.json({ success: true, data: { state: 'preparing' } }, 202);
  });

  app.get('/stream/:hash/:sel/index.m3u8', async (c) => {
    const bad = guard(c);
    if (bad) return bad;
    const { hash, sel } = params(c);
    const starting = ensureHls(hash, sel);
    // Created synchronously by ensureHls; a viewer blocked on startup is not abandoning it.
    const pendingSession = findSession(hash, sel);
    if (pendingSession) pendingSession.waiters = (pendingSession.waiters || 0) + 1;
    try {
      // Bound the whole request (metadata + ffprobe + first segment) below the player's
      // manifest timeout; on timeout the client retries and startup keeps running.
      const deadline = Date.now() + config.readyTimeoutMs;
      starting.catch(() => {});
      const session = await Promise.race([starting, new Promise((r) => setTimeout(r, config.readyTimeoutMs, null))]);
      const playlist = session ? await waitForPlaylist(session, Math.max(0, deadline - Date.now())) : null;
      if (!playlist) {
        c.header('Retry-After', RETRY_AFTER_SEC);
        return fail(c, 503, 'stream is still buffering, retry shortly');
      }
      c.header('Content-Type', 'application/vnd.apple.mpegurl');
      c.header('Cache-Control', 'no-cache');
      return c.body(rewritePlaylist(playlist, c.req.query('t')));
    } catch (err) {
      return failWith(c, err, `playlist ${hash}:${sel}`);
    } finally {
      if (pendingSession) {
        pendingSession.waiters -= 1;
        touchSession(pendingSession);
      }
    }
  });

  app.get('/stream/:hash/:sel/:file', async (c) => {
    const bad = guard(c);
    if (bad) return bad;
    const { hash, sel } = params(c);
    const name = c.req.param('file');
    const isSubs = name === 'subs.vtt';
    if (!isSubs && !SEGMENT_RE.test(name)) return fail(c, 400, 'invalid segment name');

    const session = findSession(hash, sel);
    if (!session) return fail(c, 404, 'session expired, reload the playlist');
    session.lastAccess = Date.now();

    // Names are regex-checked above, so this join cannot escape outDir.
    const filePath = path.join(session.outDir, name);
    try {
      const info = await stat(filePath);
      c.header('Content-Type', isSubs ? 'text/vtt; charset=utf-8' : 'video/mp2t');
      c.header('Content-Length', String(info.size));
      c.header('Cache-Control', isSubs ? 'no-cache' : 'public, max-age=3600');
      // subs.vtt may still be growing: never send more bytes than Content-Length promised.
      return c.body(Readable.toWeb(createReadStream(filePath, { end: Math.max(0, info.size - 1) })));
    } catch {
      return fail(c, 404, isSubs ? 'no text subtitles in this release' : 'segment not ready');
    }
  });

  // Direct file with HTTP Range support (VLC/mpv/ffmpeg). Also ffmpeg's input.
  app.get('/raw/:hash/:sel', async (c) => {
    const bad = guard(c);
    if (bad) return bad;
    const { hash, sel } = params(c);
    try {
      // ffmpeg's own reads (internal=1) neither count as activity nor may re-create a closed session.
      const isInternal = c.req.query('internal') === '1';
      const session = await getSession(hash, sel, { touch: !isInternal, create: !isInternal });
      const { file } = session;
      const range = parseRange(c.req.header('range'), file.length);
      c.header('Accept-Ranges', 'bytes');
      c.header('Content-Type', mimeForFile(file.name));
      if (range === 'unsatisfiable') {
        c.header('Content-Range', `bytes */${file.length}`);
        return c.body(null, 416);
      }
      const { start, end } = range || { start: 0, end: file.length - 1 };
      c.header('Content-Length', String(end - start + 1));
      if (range) c.header('Content-Range', `bytes ${start}-${end}/${file.length}`);
      // webtorrent files are async-iterable (streamx, not Node streams); cancelling the
      // web stream calls iterator.return(), which releases the piece reservations.
      const chunks = file[Symbol.asyncIterator]({ start, end });
      const body = ReadableStream.from(isInternal ? chunks : touchingIterator(chunks, session));
      return c.body(body, range ? 206 : 200);
    } catch (err) {
      return failWith(c, err, `raw ${hash}:${sel}`);
    }
  });

  app.get('/status/:hash/:sel', async (c) => {
    const bad = guard(c);
    if (bad) return bad;
    const { hash, sel } = params(c);
    const session = findSession(hash, sel);
    if (!session) return c.json({ success: true, data: { state: 'idle' } });
    return c.json({ success: true, data: await sessionStatus(session) });
  });

  app.notFound((c) => fail(c, 404, 'not found'));
  app.onError((err, c) => {
    log(`error: ${err.stack || err.message}`);
    return fail(c, 500, 'internal error');
  });
  return app;
};

