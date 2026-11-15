import { createHmac, timingSafeEqual } from 'node:crypto';

// Signed stream URLs: the worker only streams hash/selection pairs the API
// issued, so it can't be abused as an open torrent-to-HTTP proxy.
// Token format: "<expUnixSec>.<base64url HMAC-SHA256(hash:sel:exp)>".

export const INFO_HASH_RE = /^[a-f0-9]{40}$/;
// "auto" = largest video file, "e<N>" = episode N inside a batch, "<N>" = file index.
export const SELECTION_RE = /^(auto|e\d{1,4}|\d{1,4})$/;

const DEV_FALLBACK_SECRET = 'shirayuki-dev-only-insecure-secret';

/**
 * Resolve the HMAC secret. Production refuses to run without one; dev falls
 * back to a fixed value so `npm run dev` + `npm run stream` work out of the box.
 */
export const resolveStreamSecret = (secret, nodeEnv) => {
  if (secret) return secret;
  if (nodeEnv === 'production') {
    const err = new Error('STREAM_SECRET is not configured on this server');
    err.status = 503;
    throw err;
  }
  return DEV_FALLBACK_SECRET;
};

const digest = (secret, hash, sel, exp) =>
  createHmac('sha256', secret).update(`${hash}:${sel}:${exp}`).digest('base64url');

/**
 * @param {{ hash: string, sel: string, ttlSec: number, secret: string, now?: number }} p
 * @returns {string}
 */
export const signStreamToken = ({ hash, sel, ttlSec, secret, now = Date.now() }) => {
  if (!INFO_HASH_RE.test(hash)) throw new Error('invalid info hash');
  if (!SELECTION_RE.test(sel)) throw new Error('invalid file selection');
  const exp = Math.floor(now / 1000) + Math.max(60, Number(ttlSec) || 0);
  return `${exp}.${digest(secret, hash, sel, exp)}`;
};

/**
 * @param {{ token: string, hash: string, sel: string, secret: string, now?: number }} p
 * @returns {boolean}
 */
export const verifyStreamToken = ({ token, hash, sel, secret, now = Date.now() }) => {
  const match = String(token || '').match(/^(\d{1,12})\.([A-Za-z0-9_-]{43})$/);
  if (!match) return false;
  if (!INFO_HASH_RE.test(hash) || !SELECTION_RE.test(sel)) return false;
  const exp = Number(match[1]);
  if (exp * 1000 < now) return false;
  const expected = Buffer.from(digest(secret, hash, sel, exp));
  const given = Buffer.from(match[2]);
  return expected.length === given.length && timingSafeEqual(expected, given);
};
