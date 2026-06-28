// Given a single Nyaa torrent id, return the full list of episodes for the
// series it belongs to, each with a working `streamUrl`.
//
// Why this exists: a Nyaa release often covers a range (e.g. S01E01-E03) or
// even a whole season. The `episode/sources` endpoint therefore returns one
// episode at a time. To render a series list with streamable links, the
// client had to know the franchise mapping itself. This endpoint figures it
// out from the torrent title alone:
//
//   1. Fetch the torrent view page → title + file list
//   2. `cleanTorrentTitle` → canonical name (e.g. "Cursed One-Piece 1992")
//   3. Slugify → hianime-compatible id (e.g. "cursed-one-piece-1992")
//   4. `getNyaaEpisodes` → merged hianime + nyaa episode list (best path:
//      uses hianime's canonical episode count + per-ep nyaa torrents).
//   5. If hianime doesn't know the series, fall back to a nyaa-native
//      scrape: parse ep number / range from the seed file's filename, then
//      for each ep search nyaa via `findTorrentByAnimeName` and attach the
//      best torrent.
//   6. For each episode with a torrentId, build a deterministic `streamUrl`
//      pointing at the existing `episode/sources` endpoint so the client
//      doesn't have to know which torrentId holds which episode.
//
// No WebTorrent work happens here — torrent loading is deferred to the
// first `episode/sources` hit, which keeps this endpoint fast and the
// heavy lifting (probe + load) on the path that actually plays the file.

import { getNyaaAnimeDetails } from './anime.js';
import { getNyaaEpisodes } from './episodes.js';
import { getNyaaSearch } from './search.js';
import { cleanTorrentTitle, enrichFromAniList } from './_enrich.js';
import {
  extractEpisodeFromName,
  extractEpisodeRange,
  fetchViewPage,
  walkFileTree,
  VIDEO_EXTENSIONS,
  NYAA_BASE_URL,
} from './_shared.js';

// Nyaa titles often carry alt names as `|` separated trailing aliases
// (release groups add Japanese / romanized variants). Prefer the leading
// chunk for slug derivation so hianime lookup targets the canonical series.
// "Cursed One-Piece 1992 Season 1 | Uchida Shungiku no Noroi no One-piece | ..."
//   -> "Cursed One-Piece 1992 Season 1"
const pickLeadingName = (cleaned) => {
  if (!cleaned) return '';
  const head = String(cleaned).split('|')[0].trim();
  return head || String(cleaned).trim();
};

// Recover a `(YYYY)` year if the raw title carried one — useful when the
// leading segment has no year and we need to disambiguate similarly named
// series. Only used to append to the slug; never replaces the leading name.
const extractYear = (rawTitle) => {
  if (!rawTitle) return null;
  const m = String(rawTitle).match(/\((19|20)\d{2}\)/);
  return m ? m[0].slice(1, -1) : null;
};

// Build a hianime-compatible slug from a cleaned anime name.
// "Cursed One-Piece 1992" -> "cursed-one-piece-1992"
// "Spy x Family"          -> "spy-x-family"
const queryToSlug = (rawQuery) => {
  if (!rawQuery) return '';
  return String(rawQuery)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
};

// Pull ep numbers (1-based) from a torrent's video file list. Handles:
//   - single-episode filenames ("E01", "S01E05", " - 12 ", "001")
//   - range filenames ("S01E01-E03", "E1-E13")
//   - multiple video files (rare; each gets its own number)
//
// Range detection runs FIRST: "S01E01-E03" contains both a single (from
// SxxExx) and a range — we want the range so the full 1-3 fan-out happens.
// A range span of 1 collapses to the single-ep case automatically.
const epsFromFiles = (files) => {
  if (!Array.isArray(files)) return [];
  const out = [];
  for (const f of files) {
    if (f?.type !== 'file' || !VIDEO_EXTENSIONS.test(f.name || '')) continue;
    const r = extractEpisodeRange(f.name);
    if (r && r.lo > 0 && r.hi >= r.lo) {
      for (let k = r.lo; k <= r.hi; k += 1) out.push(k);
      continue;
    }
    const n = extractEpisodeFromName(f.name);
    if (Number.isFinite(n) && n > 0) out.push(n);
  }
  return Array.from(new Set(out)).sort((a, b) => a - b);
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

// Build a stable streamUrl that mirrors the existing `episode/sources` shape.
// We can't pre-resolve `file` or `audio` here without loading WebTorrent, so
// we point the client at the upstream endpoint which handles that lazily.
const buildEpisodeStreamUrl = ({ baseUrl, torrentId, ep, category, transcode }) => {
  if (!baseUrl || !torrentId || !Number.isFinite(ep)) return null;
  const params = new URLSearchParams({
    torrentId: String(torrentId),
    ep: String(ep),
    category: category || 'sub',
  });
  if (transcode) params.set('transcode', '1');
  return `${baseUrl}/api/v2/nyaa/episode/sources?${params.toString()}`;
};

// Nyaa-native ep list: search nyaa for the cleaned anime name across pages,
// and for every ep number in `epNumbers` pick the best matching row. Each
// candidate is probed via its file list (when title/range matching is
// inconclusive) so single-episode releases inside batch ranges still
// surface as 'single' matches. When the caller already has the seed
// torrent row + its ep file metadata, that row is folded in before any
// search — single-batch releases for small series would otherwise miss
// every ep because the search returns only the seed itself.
const buildNyaaNativeEpisodeList = async ({ query, epNumbers, maxPages = 6, seedRow = null, seedFileEp = null }) => {
  const pages = Math.max(1, Math.min(Number(maxPages) || 6, 20));
  const wanted = new Set(epNumbers);
  const byNumber = new Map();

  // Stage 0: pre-claim eps from the seed torrent when the seed file list
  // already tells us which eps are in it. This handles the common case
  // where the only nyaa result for a small series IS the seed torrent
  // itself, and the per-ep numbers only appear inside the file name.
  // Range wins over single when both fire — a range fan-out is more
  // useful than a single-ep claim when both are present.
  if (seedRow && seedFileEp && seedFileEp.range) {
    for (let n = seedFileEp.range.lo; n <= seedFileEp.range.hi; n += 1) {
      if (!wanted.has(n)) continue;
      byNumber.set(n, { row: seedRow, status: 'seed-batch', range: seedFileEp.range });
    }
  } else if (seedRow && seedFileEp && seedFileEp.ep != null && wanted.has(seedFileEp.ep)) {
    byNumber.set(seedFileEp.ep, { row: seedRow, status: 'seed-single' });
  }

  // Stage 1: collect candidate rows from the nyaa search index.
  const rows = [];
  for (let page = 1; page <= pages; page += 1) {
    const result = await getNyaaSearch({ q: query, page });
    const batch = Array.isArray(result?.results) ? result.results : [];
    for (const row of batch) {
      if (row?.title) rows.push(row);
    }
    if (!result?.pagination?.hasNextPage) break;
  }

  // Stage 2: cheap title/range check first so we don't waste a view-page
  // fetch on torrents whose title alone is enough.
  const tentative = []; // rows that need a file-list probe
  for (const row of rows) {
    if (!row?.title) continue;
    const titleEp = extractEpisodeFromName(row.title);
    const range = extractEpisodeRange(row.title);
    const inRange = range
      ? [...wanted].some((n) => n >= range.lo && n <= range.hi)
      : false;
    if (Number.isFinite(titleEp) && wanted.has(titleEp)) {
      const prev = byNumber.get(titleEp);
      if (!prev || compareRank(rankTorrent(row), rankTorrent(prev)) < 0) {
        byNumber.set(titleEp, { row, status: 'single' });
      }
    } else if (inRange && range) {
      for (let n = range.lo; n <= range.hi; n += 1) {
        if (!wanted.has(n)) continue;
        const prev = byNumber.get(n);
        if (!prev || compareRank(rankTorrent(row), rankTorrent(prev)) < 0) {
          byNumber.set(n, { row, status: 'batch', range });
        }
      }
    } else {
      tentative.push(row);
    }
  }

  // Stage 3: for rows that didn't match by title/range, peek at their file
  // list. Nyaa titles often carry the eps in the *file name* (e.g.
  // `S01E01-E03` shows up only after you open the torrent view page), and
  // many small-fandom releases don't tag the title itself.
  if (tentative.length > 0) {
    await Promise.all(
      tentative.map(async (row) => {
        try {
          const { $ } = await fetchViewPage(row.id);
          const $rootUl = $('.torrent-file-list > ul').first();
          if (!$rootUl.length) return;
          const files = walkFileTree($, $rootUl);
          const fileNumbers = files
            .filter((f) => f.type === 'file' && VIDEO_EXTENSIONS.test(f.name))
            .map((f) => extractEpisodeFromName(f.name))
            .filter((n) => Number.isFinite(n));
          // Also pull range-only files (`S01E01-E03` matches the SxxExx
          // regex on the first ep only, so re-check via extractEpisodeRange).
          const rangeNumbers = files
            .filter((f) => f.type === 'file' && VIDEO_EXTENSIONS.test(f.name))
            .map((f) => extractEpisodeRange(f.name))
            .filter(Boolean);
          for (const n of fileNumbers) {
            if (!wanted.has(n)) continue;
            const prev = byNumber.get(n);
            if (!prev || compareRank(rankTorrent(row), rankTorrent(prev)) < 0) {
              byNumber.set(n, { row, status: 'file-match' });
            }
          }
          for (const r of rangeNumbers) {
            for (let n = r.lo; n <= r.hi; n += 1) {
              if (!wanted.has(n)) continue;
              const prev = byNumber.get(n);
              if (!prev || compareRank(rankTorrent(row), rankTorrent(prev)) < 0) {
                byNumber.set(n, { row, status: 'batch', range: r });
              }
            }
          }
        } catch { /* skip — leave unmatched */ }
      }),
    );
  }

  return Array.from(wanted)
    .sort((a, b) => a - b)
    .map((n) => {
      const hit = byNumber.get(n);
      if (!hit) return { number: n, torrentId: null, torrent: null };
      return {
        number: n,
        torrentId: hit.row.id,
        torrent: {
          id: hit.row.id,
          title: hit.row.title,
          url: hit.row.url,
          size: hit.row.size,
          sizeBytes: hit.row.sizeBytes,
          seeders: hit.row.seeders,
          leechers: hit.row.leechers,
          completed: hit.row.completed,
          category: hit.row.category,
          categoryLabel: hit.row.categoryLabel,
          isTrusted: hit.row.isTrusted,
          date: hit.row.date,
          timestamp: hit.row.timestamp,
          matchType: hit.status,
          range: hit.range || null,
        },
      };
    });
};

export const getNyaaAnimeAllSources = async ({ torrentId, baseUrl, category = 'sub', transcode = true, maxPages = 3 } = {}) => {
  const id = String(torrentId || '').trim();
  if (!id || !/^\d+$/.test(id)) {
    const err = new Error('torrentId path parameter must be a numeric Nyaa torrent id');
    err.statusCode = 400;
    throw err;
  }

  // Step 1: pull the seed torrent's title + file list.
  const details = await getNyaaAnimeDetails({ torrentId: id });
  const seedTitle = details?.title || '';
  const seedFiles = Array.isArray(details?.files) ? details.files : [];

  // Step 2: derive a hianime-compatible slug from the cleaned title.
  const cleaned = cleanTorrentTitle(seedTitle);
  const leadingName = pickLeadingName(cleaned);
  const year = extractYear(seedTitle);
  const slugSource = year ? `${leadingName} ${year}` : leadingName;
  let slug = queryToSlug(slugSource);
  if (!slug) {
    const err = new Error(`Could not derive anime slug from torrent title "${seedTitle}"`);
    err.statusCode = 422;
    throw err;
  }

  // Step 3: try hianime first (gives canonical ep count + per-ep nyaa torrents).
  let merged;
  let mergedVia = 'hianime-slug';
  try {
    merged = await getNyaaEpisodes({ animeId: slug, maxPages });
  } catch {
    // Hianime doesn't catalogue this series. Try AniList enrichment to
    // pull a canonical English / romanized / native name, then retry.
    merged = null;
    const aliases = String(seedTitle)
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const alias of aliases) {
      const cleanedAlias = cleanTorrentTitle(alias);
      const queries = [alias, cleanedAlias, leadingName].filter(Boolean);
      for (const q of queries) {
        const enrichment = await enrichFromAniList(q).catch(() => ({ matched: false }));
        if (!enrichment?.matched || !enrichment.media) continue;
        const candidates = [
          enrichment.media.title,
          enrichment.media.jname,
          enrichment.media.ename,
        ].filter(Boolean);
        for (const cand of candidates) {
          const altSlug = queryToSlug(cand);
          if (!altSlug || altSlug === slug) continue;
          try {
            merged = await getNyaaEpisodes({ animeId: altSlug, maxPages });
            mergedVia = `anilist:${cand}`;
            slug = altSlug;
            break;
          } catch { /* try next candidate */ }
        }
        if (merged) break;
      }
      if (merged) break;
    }

    if (!merged) {
      // Step 4: nyaa-native fallback. Use the seed torrent's file list to
      // figure out the ep number / range, then search nyaa for each ep.
      const eps = epsFromFiles(seedFiles);
      if (eps.length === 0) {
        const err = new Error(
          `Could not derive episode numbers for "${seedTitle}" ` +
          `(hianime has no slug, seed file list is empty)`,
        );
        err.statusCode = 404;
        throw err;
      }

      // Build a compact search query: strip season markers, codecs, "S01"
      // tags from the leading chunk so nyaa results actually match. The
      // cleaned variant (`cleanTorrentTitle` of leadingName) usually keeps
      // season noise; we trim further here.
      const searchQuery = leadingName
        .replace(/\bseason\s+\d+\b/gi, '')
        .replace(/\bs\d{1,2}\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();

      // Pre-fill ep rows with the seed torrent itself. Many small-fandom
      // releases have a single torrent covering the whole series (e.g.
      // a 3-episode OVA packaged as one batch). Forcing the seed into the
      // candidate set guarantees we never return "no torrent" for eps we
      // already know exist on this very torrent.
      const seedAsRow = {
        id,
        title: seedTitle,
        url: details.source || `${NYAA_BASE_URL}/view/${id}`,
        category: '1_2',
        isTrusted: false,
        size: details.size || null,
        sizeBytes: details.sizeBytes || null,
        seeders: details.seeders || 0,
        leechers: details.leechers || 0,
        completed: details.completed || 0,
        date: details.date?.text || null,
        timestamp: details.date?.timestamp || null,
      };
      const seedFileEp = (() => {
        for (const f of seedFiles) {
          if (f?.type !== 'file' || !VIDEO_EXTENSIONS.test(f.name || '')) continue;
          const r = extractEpisodeRange(f.name);
          // Prefer range — a range covers more eps than a single and is
          // what release groups use to package batches.
          if (r) return { ep: null, range: r };
          const n = extractEpisodeFromName(f.name);
          if (Number.isFinite(n)) return { ep: n, range: null };
        }
        return null;
      })();

      const epList = await buildNyaaNativeEpisodeList({
        query: searchQuery,
        epNumbers: eps,
        maxPages,
        seedRow: seedFileEp ? seedAsRow : null,
        seedFileEp,
      });
      merged = {
        source: `${NYAA_BASE_URL}/?q=${encodeURIComponent(searchQuery)}&c=1_2&f=0`,
        hianimeSource: null,
        query: searchQuery,
        animeId: leadingName,
        totalEpisodes: epList.length,
        matchedTorrents: epList.filter((e) => e.torrentId).length,
        ranges: [],
        episodes: epList,
      };
      mergedVia = 'nyaa-native';
    }
  }

  // Step 5: project to a flatter per-episode shape with streamUrl.
  const normalizedCategory = String(category || 'sub').toLowerCase() === 'dub' ? 'dub' : 'sub';
  const episodes = (merged.episodes || []).map((ep) => {
    const number = ep?.number ?? null;
    const torrent = ep?.torrent || null;
    const torrentIdOut = ep?.torrentId || torrent?.id || null;

    return {
      number,
      title: ep?.title || null,
      episodeId: ep?.episodeId || ep?.href || null,
      href: ep?.href || null,
      url: ep?.url || null,
      torrentId: torrentIdOut,
      torrent,
      // Deterministic API URL — the client can deep-fetch this for the
      // real streamable `streamUrl` (with `audio` / `file` baked in).
      streamUrl: buildEpisodeStreamUrl({
        baseUrl,
        torrentId: torrentIdOut,
        ep: number,
        category: normalizedCategory,
        transcode,
      }),
      hasTorrent: Boolean(torrentIdOut),
    };
  });

  const matched = episodes.filter((e) => e.hasTorrent).length;

  return {
    source: details.source || `${NYAA_BASE_URL}/view/${id}`,
    nyaaSource: `${NYAA_BASE_URL}/?q=${encodeURIComponent(cleaned)}&c=1_2&f=0`,
    hianimeSource: merged.hianimeSource || null,
    resolvedVia: mergedVia,
    torrentId: id,
    title: seedTitle,
    query: cleaned,
    animeId: slug,
    category: normalizedCategory,
    transcode: Boolean(transcode),
    totalEpisodes: episodes.length,
    matchedTorrents: matched,
    ranges: merged.ranges || [],
    episodes,
  };
};
