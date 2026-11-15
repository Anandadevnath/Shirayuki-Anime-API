// Tiny fixed-window, per-client rate limiter (in-memory, per process).
// /episode/sources starts torrent + ffmpeg work on the stream worker, so it is
// the one nyaa route that needs a cap. On Vercel each instance keeps its own window.

const WINDOW_MS = 60 * 1000;
const MAX_CLIENTS_TRACKED = 5000;

const clientKey = (c) =>
  String(c.req.header('x-forwarded-for') || '').split(',')[0].trim() ||
  c.req.header('x-real-ip') ||
  c.env?.incoming?.socket?.remoteAddress ||
  'unknown';

/**
 * @param {number} limit requests per minute per client
 * @returns {(c: import('hono').Context) => { allowed: boolean, retryAfterSec: number }}
 */
export const createRateLimiter = (limit) => {
  const windows = new Map();
  return (c) => {
    const now = Date.now();
    const key = clientKey(c);
    const current = windows.get(key);
    const entry = current && now - current.start < WINDOW_MS ? current : { start: now, count: 0 };
    const next = { start: entry.start, count: entry.count + 1 };
    windows.delete(key);
    windows.set(key, next);
    while (windows.size > MAX_CLIENTS_TRACKED) windows.delete(windows.keys().next().value);
    return {
      allowed: next.count <= limit,
      retryAfterSec: Math.ceil((entry.start + WINDOW_MS - now) / 1000),
    };
  };
};
