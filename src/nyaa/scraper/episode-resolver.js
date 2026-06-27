// Resolve an episode number to the nyaa torrent that actually contains it.
//
// The /episode/sources endpoint can be called several ways:
//   1. ?torrentId=...&ep=...                       — caller picked a torrent
//   2. ?animeEpisodeId=one-piece/ep-5&ep=5         — slug-based lookup
//   3. ?torrentId=2120082&ep=20                    — fallback flow: the
//      supplied torrent doesn't contain ep 20, so search nyaa for the anime
//      (using the supplied torrent's title as the seed) and find a torrent
//      that DOES contain ep 20.
//
// All flows funnel through the same `lookupTorrentForEpisode` so caching and
// ranking logic stay in one place.
import { getNyaaSearch } from './search.js';
import { getNyaaEpisodes } from './episodes.js';
import { extractEpisodeFromName, parseNumber } from './_shared.js';
import { torrentClient } from '../stream/torrent-client.js';
import { cleanTorrentTitle } from './_enrich.js';
import { fetchViewPage, walkFileTree, VIDEO_EXTENSIONS } from './_shared.js';

const TTL_MS = 60 * 1000;
const slugLookupCache = new Map(); // slug -> { expiresAt, byNumber }
const nameLookupCache = new Map(); // name|ep -> { expiresAt, value }

const trimCache = (cache, max = 100) => {
  if (cache.size <= max) return;
  const oldest = cache.keys().next().value;
  if (oldest) cache.delete(oldest);
};

export const parseAnimeEpisodeId = (raw) => {
  if (!raw) return { slug: null, embeddedEp: null };
  const s = String(raw).trim();
  const slash = s.match(/^(.+?)\/(?:ep-(\d+))$/i);
  if (slash) return { slug: slash[1].toLowerCase(), embeddedEp: parseNumber(slash[2]) };
  const dollar = s.match(/^(.+?)\$ep=(\d+)$/i);
  if (dollar) return { slug: dollar[1].toLowerCase(), embeddedEp: parseNumber(dollar[2]) };
  const colon = s.match(/^(.+?):(\d+)$/);
  if (colon) return { slug: colon[1].toLowerCase(), embeddedEp: parseNumber(colon[2]) };
  return { slug: s.toLowerCase(), embeddedEp: null };
};

const isBatchPack = (row) => {
  const t = String(row?.title || '').toLowerCase();
  return /\bbatch\b|\bcomplete\b|\b\d{2,3}\s*[-~]\s*\d{2,3}\b|\bseason\b/i.test(t);
};

const rankTorrent = (row) => {
  const TRUST_RANK = { true: 0, false: 1 };
  const trustedRank = TRUST_RANK[String(row?.isTrusted) === 'true' ? 'true' : 'false'] ?? 1;
  const batchRank = isBatchPack(row) ? 1 : 0;
  return [batchRank, trustedRank, -(row?.seeders || 0), -(row?.timestamp || 0)];
};

const compareRank = (a, b) => {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
};

// Slug-based: rebuild the same episode lookup /anime/:id/episodes uses, but
// keep it cached briefly so repeated calls during a session don't re-hit
// upstream.
const getSlugLookup = async (slug) => {
  if (!slug) return new Map();
  const cached = slugLookupCache.get(slug);
  if (cached && Date.now() < cached.expiresAt) return cached.byNumber;

  const data = await getNyaaEpisodes({ animeId: slug });
  const byNumber = new Map();
  for (const ep of data.episodes || []) {
    if (ep?.number == null || !ep.torrentId) continue;
    byNumber.set(Number(ep.number), {
      torrentId: ep.torrentId,
      episodeId: ep.episodeId,
      href: ep.href,
    });
  }
  slugLookupCache.set(slug, { expiresAt: Date.now() + TTL_MS, byNumber });
  trimCache(slugLookupCache);
  return byNumber;
};

// Name-based fallback: search nyaa directly for the anime (using a slug-derived
// Pull any "X-Y" / "X~Y" / "Ex-Ex" ranges out of a cleaned title.
// Returns [lo, hi] inclusive, or null when no range is present.
const extractEpisodeRange = (rawTitle) => {
  if (!rawTitle) return null;
  const t = String(rawTitle);
  // E001-E130 / E1-E130 / S01E01-S01E13 / Vol.1-3
  const re = /(?:^|[\s\[\(\-_])(?:ep?|e|episode|#|vol\.?)?\s*(\d{1,4})\s*[-~]\s*(\d{1,4})\b/i;
  // Multi-match to pick the largest plausible range.
  let best = null;
  const reGlobal = /(?:^|[\s\[\(\-_])(?:ep?|e|episode|#|vol\.?)?\s*(\d{1,4})\s*[-~]\s*(\d{1,4})\b/gi;
  let m;
  while ((m = reGlobal.exec(t)) !== null) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    // Skip implausibly-wide ranges (e.g. "1080p" might match if loose).
    if (hi - lo > 2000) continue;
    if (!best || hi - lo < best.hi - best.lo) best = { lo, hi };
  }
  return best;
};

// query) and find the best torrent matching a given episode number. We also
// peek into each candidate's file list so single-episode torrents beat batch
// releases when the file list confirms the episode is present.
const findTorrentByAnimeName = async ({ animeName, episodeNumber, maxPages = 6 }) => {
  const query = String(animeName || '').trim();
  if (!query || !Number.isFinite(episodeNumber)) return null;

  const cacheKey = `${query.toLowerCase()}|${episodeNumber}`;
  const cached = nameLookupCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) return cached.value;

  const pages = Math.max(1, Math.min(Number(maxPages) || 6, 20));
  const candidates = [];
  const cleanedQ = cleanTorrentTitle(query).toLowerCase();

  for (let page = 1; page <= pages; page += 1) {
    const result = await getNyaaSearch({ q: query, page });
    const rows = Array.isArray(result?.results) ? result.results : [];
    for (const row of rows) {
      if (!row?.title) continue;
      const cleanedRow = cleanTorrentTitle(row.title).toLowerCase();
      if (!cleanedRow) continue;
      if (!cleanedRow.startsWith(cleanedQ) && !cleanedRow.includes(cleanedQ)) continue;

      const titleEpisode = extractEpisodeFromName(row.title);
      const range = extractEpisodeRange(row.title);
      const inRange = range && episodeNumber >= range.lo && episodeNumber <= range.hi;

      let status = null; // 'single' | 'batch' | null
      if (Number.isFinite(titleEpisode) && titleEpisode === episodeNumber) status = 'single';
      else if (inRange) status = 'batch';

      // Only keep rows we can confirm either via title, range, or after
      // peeking the file list. Rows with no number AND no range will be
      // checked against the file list below.
      if (status) {
        candidates.push({ row, status, range });
      } else if (!Number.isFinite(titleEpisode)) {
        // Tentatively keep — we'll verify via the file list.
        candidates.push({ row, status: null, range: null });
      }
    }
    const hasNext = result?.pagination?.hasNextPage;
    if (!hasNext) break;
  }

  // Filter to rows that have a confirmed match (via title, range, or file list).
  let matching = candidates.filter((c) => c.status);

  // For tentative candidates (no number/range in title), peek the file list.
  const tentative = candidates.filter((c) => c.status == null);
  if (tentative.length > 0) {
    await Promise.all(
      tentative.map(async (c) => {
        try {
          const { $ } = await fetchViewPage(c.row.id);
          const $rootUl = $('.torrent-file-list > ul').first();
          if (!$rootUl.length) return;
          const files = walkFileTree($, $rootUl);
          const fileNumbers = files
            .filter((f) => f.type === 'file' && VIDEO_EXTENSIONS.test(f.name))
            .map((f) => extractEpisodeFromName(f.name))
            .filter((n) => Number.isFinite(n));
          if (fileNumbers.includes(episodeNumber)) {
            c.status = 'batch';
            c.range = fileNumbers.length > 0
              ? { lo: Math.min(...fileNumbers), hi: Math.max(...fileNumbers) }
              : null;
            matching.push(c);
          }
        } catch {
          // Skip — leave unmatched.
        }
      }),
    );
  }

  if (matching.length === 0) {
    nameLookupCache.set(cacheKey, { expiresAt: Date.now() + TTL_MS, value: null });
    return null;
  }

  // Rank: single-episode torrents first, then smallest batch (fewest eps
  // covered around the target), then trusted, then most seeders, then
  // most recent. Batch "size" is measured as range span; smaller is better.
  const sizeForBatch = (c) => (c.range ? c.range.hi - c.range.lo : 1000);
  matching.sort((a, b) => {
    // 1. Single-episode torrents always win over batch packs.
    if (a.status !== b.status) {
      if (a.status === 'single') return -1;
      if (b.status === 'single') return 1;
    }
    // 2. Smaller batch wins.
    const sa = sizeForBatch(a);
    const sb = sizeForBatch(b);
    if (sa !== sb) return sa - sb;
    // 3. Trusted over untrusted, more seeders, more recent.
    const ra = rankTorrent(a.row);
    const rb = rankTorrent(b.row);
    return compareRank(ra, rb);
  });

  const best = matching[0];
  const value = {
    torrentId: best.row.id,
    title: best.row.title,
    url: best.row.url,
    size: best.row.size,
    seeders: best.row.seeders,
    matchType: best.status,           // 'single' or 'batch'
    range: best.range || null,        // { lo, hi } when batch
  };
  nameLookupCache.set(cacheKey, { expiresAt: Date.now() + TTL_MS, value });
  trimCache(nameLookupCache);
  return value;
};

// Live-aware lookup: probes each candidate torrent through WebTorrent to find
// the one with the most active peers (and ideally one we can actually read
// bytes from). Use this for streaming endpoints where torrent liveness
// matters; for metadata-only endpoints the cheaper `findTorrentByAnimeName`
// is fine.
//
// Strategy:
//   1. Build the same candidate list as findTorrentByAnimeName.
//   2. Filter to the top N by static rank (we don't want to add 6s latency
//      for every random torrent in the search results).
//   3. For each candidate, ask WebTorrent to add it and report peer count
//      + first-chunk latency. Run all probes in parallel.
//   4. Rank: candidates that returned real bytes win over those that didn't.
//      Among those, more peers wins. Among ties, lower latency wins.
export const findLiveTorrentForEpisode = async ({ animeName, episodeNumber, topN = 4, maxPages = 6 } = {}) => {
  const query = String(animeName || '').trim();
  if (!query || !Number.isFinite(episodeNumber)) return null;

  // Reuse the static matcher so single/batch/range/file-list logic stays in
  // one place. We only use its top candidates.
  const cacheKey = `live:${query.toLowerCase()}|${episodeNumber}`;
  const cached = nameLookupCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) return cached.value;

  // Step 1: collect candidates via the static matcher.
  const collected = await collectMatchingCandidates({ animeName: query, episodeNumber, maxPages });
  if (collected.length === 0) {
    nameLookupCache.set(cacheKey, { expiresAt: Date.now() + TTL_MS, value: null });
    return null;
  }

  const candidates = collected.slice(0, topN);
  console.log(`[nyaa/resolver] live probe ${query} ep ${episodeNumber}: ${candidates.length} candidates`);

  // Step 2: probe each candidate in parallel via WebTorrent. We pass the
  // numeric nyaa torrent id; probeHealth downloads the .torrent buffer
  // itself so we don't need to pre-fetch every candidate's view page.
  const probes = await Promise.all(
    candidates.map(async (c) => {
      try {
        const result = await torrentClient.probeHealth({
          torrentId: c.row.id,
          episodeNumber,
          waitMs: 6000,
          probeBytes: 16384,
        });
        return { candidate: c, ...result };
      } catch (err) {
        console.warn(`[nyaa/resolver] probe failed for ${c.row.id}:`, err.message);
        return { candidate: c, ok: false, peers: 0, downloadedBytes: 0 };
      }
    }),
  );

  // Step 3: rank. Liveness signal:
  //   - bytes-arrived candidates win (proves end-to-end stream works)
  //   - otherwise, wires > 0 (connected peers, piece availability unknown but
  //     the swarm is healthy)
  //   - otherwise, fall back to the static rank order so we at least don't
  //     pick a candidate the static rank explicitly deprioritized.
  const viable = probes.filter((p) => p.ok);
  const withWires = probes.filter((p) => p.peers > 0);

  let candidateToPick;
  if (viable.length > 0) {
    candidateToPick = viable
      .slice()
      .sort((a, b) => (a.peers !== b.peers ? b.peers - a.peers : a.latencyMs - b.latencyMs))[0];
  } else if (withWires.length > 0) {
    candidateToPick = withWires
      .slice()
      .sort((a, b) => b.peers - a.peers)[0];
  } else {
    // Nothing's connected — pick the first candidate (best static rank).
    candidateToPick = candidates[0] ? { candidate: candidates[0], ok: false, peers: 0, downloadedBytes: 0 } : null;
  }

  if (!candidateToPick) {
    nameLookupCache.set(cacheKey, { expiresAt: Date.now() + TTL_MS, value: null });
    return null;
  }

  const best = candidateToPick.candidate;
  const value = {
    torrentId: best.row.id,
    title: best.row.title,
    url: best.row.url,
    size: best.row.size,
    seeders: best.row.seeders,
    matchType: best.status,
    range: best.range || null,
    health: {
      peers: candidateToPick.peers,
      bytesReceived: candidateToPick.downloadedBytes,
      latencyMs: candidateToPick.latencyMs,
      viableCandidates: viable.length,
      totalProbed: probes.length,
    },
  };
  console.log(
    `[nyaa/resolver] picked ${best.row.id} (${candidateToPick.peers} peers, ${candidateToPick.downloadedBytes}B) ` +
    `out of ${viable.length}/${probes.length} viable`,
  );
  nameLookupCache.set(cacheKey, { expiresAt: Date.now() + TTL_MS, value });
  trimCache(nameLookupCache);
  return value;
};

// Internal helper that runs the same candidate-collection logic as
// findTorrentByAnimeName but returns the ranked list instead of just the top
// one. Used by findLiveTorrentForEpisode.
const collectMatchingCandidates = async ({ animeName, episodeNumber, maxPages = 6 }) => {
  const query = String(animeName || '').trim();
  if (!query || !Number.isFinite(episodeNumber)) return [];

  const pages = Math.max(1, Math.min(Number(maxPages) || 6, 20));
  const candidates = [];
  const cleanedQ = cleanTorrentTitle(query).toLowerCase();

  for (let page = 1; page <= pages; page += 1) {
    const result = await getNyaaSearch({ q: query, page });
    const rows = Array.isArray(result?.results) ? result.results : [];
    for (const row of rows) {
      if (!row?.title) continue;
      const cleanedRow = cleanTorrentTitle(row.title).toLowerCase();
      if (!cleanedRow) continue;
      if (!cleanedRow.startsWith(cleanedQ) && !cleanedRow.includes(cleanedQ)) continue;

      const titleEpisode = extractEpisodeFromName(row.title);
      const range = extractEpisodeRange(row.title);
      const inRange = range && episodeNumber >= range.lo && episodeNumber <= range.hi;

      let status = null;
      if (Number.isFinite(titleEpisode) && titleEpisode === episodeNumber) status = 'single';
      else if (inRange) status = 'batch';

      if (status) candidates.push({ row, status, range });
      else if (!Number.isFinite(titleEpisode)) candidates.push({ row, status: null, range: null });
    }
    const hasNext = result?.pagination?.hasNextPage;
    if (!hasNext) break;
  }

  // Verify ambiguous candidates via file list.
  const tentative = candidates.filter((c) => c.status == null);
  if (tentative.length > 0) {
    await Promise.all(
      tentative.map(async (c) => {
        try {
          const { $ } = await fetchViewPage(c.row.id);
          const $rootUl = $('.torrent-file-list > ul').first();
          if (!$rootUl.length) return;
          const files = walkFileTree($, $rootUl);
          const fileNumbers = files
            .filter((f) => f.type === 'file' && VIDEO_EXTENSIONS.test(f.name))
            .map((f) => extractEpisodeFromName(f.name))
            .filter((n) => Number.isFinite(n));
          if (fileNumbers.includes(episodeNumber)) {
            c.status = 'batch';
            c.range = fileNumbers.length > 0
              ? { lo: Math.min(...fileNumbers), hi: Math.max(...fileNumbers) }
              : null;
          }
        } catch { /* skip */ }
      }),
    );
  }

  const matching = candidates.filter((c) => c.status);
  const sizeForBatch = (c) => (c.range ? c.range.hi - c.range.lo : 1000);
  matching.sort((a, b) => {
    if (a.status !== b.status) {
      if (a.status === 'single') return -1;
      if (b.status === 'single') return 1;
    }
    const sa = sizeForBatch(a);
    const sb = sizeForBatch(b);
    if (sa !== sb) return sa - sb;
    return compareRank(rankTorrent(a.row), rankTorrent(b.row));
  });
  return matching;
};

// Public entry point. Returns one of:
//   { source: 'slug',  slug, episode, torrentId, episodeId?, href? }
//   { source: 'name',  animeName, episode, torrentId, title?, url?, size?, seeders? }
//   { error, slug?, episode? }
export const lookupTorrentForEpisode = async ({ animeEpisodeId, animeName, ep } = {}) => {
  const { slug, embeddedEp } = parseAnimeEpisodeId(animeEpisodeId);
  const requestedEp = parseNumber(ep) ?? embeddedEp ?? 1;

  if (slug) {
    const byNumber = await getSlugLookup(slug);
    const match = byNumber.get(requestedEp);
    if (match) {
      return {
        source: 'slug',
        slug,
        episode: requestedEp,
        torrentId: match.torrentId,
        episodeId: match.episodeId,
        href: match.href,
      };
    }
    return { error: `No nyaa torrent found for "${slug}" episode ${requestedEp}`, slug, episode: requestedEp };
  }

  if (animeName) {
    const match = await findTorrentByAnimeName({ animeName, episodeNumber: requestedEp });
    if (match) {
      return {
        source: 'name',
        animeName,
        episode: requestedEp,
        torrentId: match.torrentId,
        title: match.title,
        url: match.url,
        size: match.size,
        seeders: match.seeders,
        matchType: match.matchType || null,   // 'single' | 'batch'
        range: match.range || null,           // { lo, hi } when batch
      };
    }
    return { error: `No nyaa torrent found for "${animeName}" episode ${requestedEp}`, animeName, episode: requestedEp };
  }

  return { error: 'animeEpisodeId or animeName is required' };
};

// Back-compat shim for callers that only know about the slug flow.
export const resolveTorrentForEpisode = ({ animeEpisodeId, ep } = {}) =>
  lookupTorrentForEpisode({ animeEpisodeId, ep });