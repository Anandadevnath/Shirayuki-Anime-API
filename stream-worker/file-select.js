import { parseRelease, isVideoFileName } from '../src/nyaa/scraper/release-parser.js';

/**
 * Pick the file to stream from a torrent's file list (pure).
 *   "auto" -> largest video file
 *   "e<N>" -> video whose name parses to episode N (batch / season pack)
 *   "<N>"  -> file index N (must be a video)
 * @param {Array<{ name: string, path?: string, length: number }>} files
 * @param {string} sel
 * @returns {number} index into `files`
 */
export const selectFileIndex = (files, sel) => {
  const videos = files
    .map((f, index) => ({ f, index }))
    .filter(({ f }) => isVideoFileName(f.name));
  if (!videos.length) throw new Error('Torrent contains no playable video file');

  if (sel === 'auto') {
    return videos.reduce((best, cur) => (cur.f.length > best.f.length ? cur : best)).index;
  }

  const episodeMatch = sel.match(/^e(\d{1,4})$/);
  if (episodeMatch) {
    const ep = Number(episodeMatch[1]);
    // Ignore NCOP/NCED/preview extras that also carry numbers.
    const candidates = videos.filter(({ f }) => !/\b(NCOP|NCED|OP|ED|PV|CM|Preview|Menu)\d*\b/i.test(f.name));
    const hit = candidates.filter(({ f }) => parseRelease(f.name).episode === ep);
    if (hit.length) return hit.reduce((best, cur) => (cur.f.length > best.f.length ? cur : best)).index;
    // Fallback: natural order of episode files.
    const sorted = [...candidates].sort((a, b) =>
      (a.f.path || a.f.name).localeCompare(b.f.path || b.f.name, undefined, { numeric: true }),
    );
    if (sorted[ep - 1]) return sorted[ep - 1].index;
    throw new Error(`Episode ${ep} not found in this batch`);
  }

  const idx = Number(sel);
  if (!Number.isInteger(idx) || !files[idx] || !isVideoFileName(files[idx].name)) {
    throw new Error('File index is not a video in this torrent');
  }
  return idx;
};

export const mimeForFile = (name) => {
  const ext = String(name || '').split('.').pop().toLowerCase();
  return (
    { mkv: 'video/x-matroska', mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', avi: 'video/x-msvideo', ts: 'video/mp2t' }[
      ext
    ] || 'application/octet-stream'
  );
};
