import { verifyStreamToken, INFO_HASH_RE, SELECTION_RE } from '../src/nyaa/scraper/stream-token.js';

// Pure request helpers for the worker (no torrent client import, so testable).

export const SEGMENT_RE = /^seg_\d{5}\.ts$/;

export const fail = (c, status, error) => c.json({ success: false, error }, status);

/**
 * Validate :hash/:sel and the signed `t` token.
 * @returns {Response|null} null when OK, otherwise the error response
 */
export const guard = (c, secret) => {
  const hash = String(c.req.param('hash') || '').toLowerCase();
  const sel = String(c.req.param('sel') || '');
  if (!INFO_HASH_RE.test(hash)) return fail(c, 400, 'invalid info hash');
  if (!SELECTION_RE.test(sel)) return fail(c, 400, 'invalid file selection');
  if (!verifyStreamToken({ token: c.req.query('t'), hash, sel, secret })) {
    return fail(c, 403, 'missing, invalid or expired stream token');
  }
  return null;
};

// An EVENT playlist without ENDLIST looks "live", and players jump to the live
// edge. EXT-X-START pins playback to the beginning like a normal episode.
const START_TAG = '#EXT-X-START:TIME-OFFSET=0,PRECISE=YES';

// Relative segment URIs don't inherit the playlist's query string, so append the token.
export const rewritePlaylist = (text, token) =>
  text
    .split('\n')
    .flatMap((line) => {
      if (line.trim() === '#EXTM3U') return [line, START_TAG];
      if (SEGMENT_RE.test(line.trim())) return [`${line.trim()}?t=${encodeURIComponent(token)}`];
      return [line];
    })
    .join('\n');

/**
 * Parse a single HTTP byte range.
 * @returns {{ start: number, end: number } | 'unsatisfiable' | null} null = no/ignored range
 */
export const parseRange = (header, size) => {
  const m = String(header || '').match(/^bytes=(\d*)-(\d*)$/);
  if (!m || (!m[1] && !m[2])) return null;
  const start = Math.max(0, m[1] ? Number(m[1]) : size - Number(m[2]));
  const end = Math.min(m[1] && m[2] ? Number(m[2]) : size - 1, size - 1);
  return start <= end ? { start, end } : 'unsatisfiable';
};
