import { getHianimeEpisodes } from '../../hianime/scraper/episodes.js';
import { getNyaaSearch } from './search.js';
import { extractEpisodeFromName, NYAA_BASE_URL } from './_shared.js';
import { cleanTorrentTitle } from './_enrich.js';

// Slug -> human query string for nyaa search.
// "naruto-shippuden"  -> "Naruto Shippuden"
// "the_rising_of_the_shield_hero" -> "The Rising of the Shield Hero"
const slugToQuery = (slug) => {
  if (!slug) return '';
  // Replace any non-letter/digit run with a space, then title-case each word.
  return String(slug)
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((w) => (w.length <= 2 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(' ');
};

// A row "matches" the anime if the cleaned nyaa title (which strips release
// group, episode markers, codec tags) shares the same leading words as the
// query. This avoids picking up e.g. "Naruto Shippuden" rows when the user
// asked for "Boruto Naruto Next Generations".
const titleMatchesQuery = (rowTitle, query) => {
  const cleanedRow = cleanTorrentTitle(rowTitle).toLowerCase();
  const cleanedQ = cleanTorrentTitle(query).toLowerCase();
  if (!cleanedRow || !cleanedQ) return false;
  return cleanedRow.startsWith(cleanedQ) || cleanedRow.includes(cleanedQ);
};

// Rank two candidate torrents for the same episode number.
// Prefer single-episode releases over batch packs, then trusted, then seeders,
// then most recent.
const isBatchPack = (row) => {
  const t = String(row?.title || '').toLowerCase();
  // Common batch markers used by nyaa release groups.
  return /\bbatch\b|\bcomplete\b|\b\d{2,3}\s*[-~]\s*\d{2,3}\b|\bseason\b/i.test(t);
};

const rankTorrent = (row) => {
  const TRUST_RANK = { true: 0, false: 1 };
  const trustedRank = TRUST_RANK[String(row?.isTrusted) === 'true' ? 'true' : 'false'] ?? 1;
  const batchRank = isBatchPack(row) ? 1 : 0; // 0 = single ep (preferred)
  return [batchRank, trustedRank, -(row?.seeders || 0), -(row?.timestamp || 0)];
};

const compareRank = (a, b) => {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
};

// Collect every nyaa torrent across multiple pages that matches the anime and
// has a parseable episode number. Returns Map<number, row>.
export const collectNyaaTorrentsByEpisode = async ({ query, maxPages = 3 }) => {
  const pages = Math.max(1, Math.min(Number(maxPages) || 3, 10));
  const byNumber = new Map();

  for (let page = 1; page <= pages; page += 1) {
    const result = await getNyaaSearch({ q: query, page });
    const rows = Array.isArray(result?.results) ? result.results : [];
    for (const row of rows) {
      if (!row?.title) continue;
      if (!titleMatchesQuery(row.title, query)) continue;
      const number = extractEpisodeFromName(row.title);
      if (!Number.isFinite(number)) continue;
      const prev = byNumber.get(number);
      if (!prev || compareRank(rankTorrent(row), rankTorrent(prev)) < 0) {
        byNumber.set(number, row);
      }
    }
    const hasNext = result?.pagination?.hasNextPage;
    if (!hasNext) break;
  }

  return byNumber;
};

const attachTorrent = (ep, row) => {
  if (!ep || !row) return ep;
  return {
    ...ep,
    torrentId: row.id,
    torrent: {
      id: row.id,
      title: row.title,
      url: row.url,
      size: row.size,
      sizeBytes: row.sizeBytes,
      seeders: row.seeders,
      leechers: row.leechers,
      completed: row.completed,
      category: row.category,
      categoryLabel: row.categoryLabel,
      isTrusted: row.isTrusted,
      date: row.date,
      timestamp: row.timestamp,
    },
  };
};

// Source the full episode list from hianime (so every episode is listed, even
// when no nyaa torrent exists yet) and overlay the best matching nyaa torrent
// per episode number on top.
export const getNyaaEpisodes = async ({ animeId, maxPages = 3 } = {}) => {
  const slug = String(animeId || '').trim();
  if (!slug) {
    const err = new Error('animeId path parameter is required');
    err.statusCode = 400;
    throw err;
  }

  // Step 1: get the canonical episode list from hianime.
  const hianimeResult = await getHianimeEpisodes({ animeId: slug });
  const hianimeEpisodes = Array.isArray(hianimeResult?.episodes)
    ? hianimeResult.episodes
    : [];

  if (hianimeEpisodes.length === 0) {
    const err = new Error(`No episodes found for "${slug}"`);
    err.statusCode = 404;
    throw err;
  }

  // Step 2: collect matching nyaa torrents across pages.
  const query = slugToQuery(slug);
  const byNumber = await collectNyaaTorrentsByEpisode({ query, maxPages });

  // Step 3: build merged list. Every hianime episode is preserved; torrents
  // are attached when a match exists, otherwise left null.
  const episodes = hianimeEpisodes.map((ep) => {
    const row = ep.number != null ? byNumber.get(ep.number) : null;
    return attachTorrent(ep, row);
  });

  // Recompute ranges from the full hianime list so clients see the canonical
  // ranges (001-100, 101-200, ...), independent of how many torrents were
  // matched.
  const STEP = 100;
  const numbers = episodes.map((e) => e.number).filter((n) => Number.isFinite(n));
  const rangeSet = new Set();
  for (const n of numbers) {
    const start = Math.floor((n - 1) / STEP) * STEP + 1;
    const end = start + STEP - 1;
    const fmt = (v) => String(v).padStart(3, '0');
    rangeSet.add(`${fmt(start)}-${fmt(end)}`);
  }
  const ranges = Array.from(rangeSet).sort();

  return {
    source: `${NYAA_BASE_URL}/?q=${encodeURIComponent(query)}&c=1_2&f=0`,
    hianimeSource: hianimeResult?.source || null,
    query,
    animeId: slug,
    totalEpisodes: episodes.length,
    matchedTorrents: byNumber.size,
    ranges,
    episodes,
  };
};