// A session nobody has requested for this long, while another session is newer,
// was abandoned (the viewer switched episode). hls.js reloads the EVENT playlist
// every ~2s while playing, so a watched session never goes quiet this long.
export const ABANDONED_AFTER_MS = 15 * 1000;

/**
 * Sessions to close early so they stop splitting bandwidth with the one in use (pure).
 * Finished transcodes are kept: they cost no download, and the viewer may come back.
 * Sessions with a playlist request in flight (`waiters`) are starting up, not abandoned.
 * @param {Array<{ lastAccess: number, waiters?: number, hls?: { state: string } | null }>} sessions
 * @param {number} now
 * @param {number} [abandonedAfterMs]
 */
export const findAbandoned = (sessions, now, abandonedAfterMs = ABANDONED_AFTER_MS) => {
  if (sessions.length < 2) return [];
  const newest = Math.max(...sessions.map((s) => s.lastAccess));
  return sessions.filter(
    (s) => !s.waiters && s.lastAccess < newest && now - s.lastAccess > abandonedAfterMs && s.hls?.state !== 'complete',
  );
};
