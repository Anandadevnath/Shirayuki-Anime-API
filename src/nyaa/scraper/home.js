// /api/v2/nyaa/home — HiAnime-shaped browse feed sourced from nyaa.si.
//
// Each torrent row on nyaa is a unique release (one anime title, one episode,
// one batch). To make this feed work the same way a HiAnime browse feed does,
// we:
//   1. scrape category 1_2 (Anime - English-translated) and 1_0 (Anime)
//   2. parse each row into a torrent envelope
//   3. enrich every distinct anime title via AniList (poster, score, episode
//      count, status, genres, banner, etc.)
//   4. map everything to the same field names HiAnime uses
//      (id / title / jname / ename / poster / episodes / type / quality / ...)
//      so a single frontend can render both providers identically.
//
// Each row keeps `torrentId` so consumers can pivot straight to
// /api/v2/nyaa/episode/sources?torrentId=... for playback later.

import { fetchPage, extractTorrentRows, NYAA_BASE_URL, CATEGORIES } from './_shared.js';
import { enrichFromAniList } from './_enrich.js';

const HOME_LIMIT = 30;

// Categories we aggregate to build the feed. Order matters: the first
// category drives the spotlight/quickList; the second adds raw + ongoing.
const FEED_CATEGORIES = ['1_2', '1_0'];

// Pull quality tokens like 1080p / 720p / 480p out of a torrent title.
const QUALITY_RE = /\b(2160p|1440p|1080p|720p|480p|360p)\b/i;
// Pull episode / batch markers to derive a per-row `episode` int (kept for
// later use; HiAnime consumers sometimes want this).
const EPISODE_RE = /[-–—]\s*(\d{1,4})(?:\s*v\d+)?(?:\s*[\[(]|\s*$)/;
// Pull type tokens like TV / OVA / Movie / WEB / BD / DVD.
const TYPE_TOKENS = ['TV', 'MOVIE', 'OVA', 'ONA', 'SPECIAL', 'MUSIC', 'BD', 'WEB', 'DVD', 'BDREMUX', 'REMUX', 'BATCH'];
// Strip release-group / resolution / codec tags from a torrent title to
// recover the canonical anime name (used for AniList search and as `title`).
const STRIP_RE = /\[[^\]]*\]|\([^)]*\)|\b(?:Hi10|H10|x264|x265|h\.?264|h\.?265|HEVC|AVC|AV1|FLAC|AC3|AAC|DDP2\.0|DDP5\.1|DTS|MA\.?5\.1|TRUEHD|Atmos|MULTi(?:[-_ ]Audio)?|Multi[-_ ]Audio|Dual[-_ ]Audio|Japanese|English|SubsPlease|Erai-?raw|HorribleSubs|VARYG|EMBER|CR|ANIME-KAWAII|METSUBA|Judas|ASW|trl|pk)\b/gi;

const pickQuality = (title) => {
  if (!title) return null;
  const m = String(title).match(QUALITY_RE);
  return m ? m[1].toLowerCase() : null;
};

const pickEpisode = (title) => {
  if (!title) return null;
  const m = String(title).match(EPISODE_RE);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const pickType = (title) => {
  if (!title) return null;
  const upper = String(title).toUpperCase();
  const hit = TYPE_TOKENS.find((t) => upper.includes(` ${t} `) || upper.includes(`(${t})`) || upper.includes(`[${t}]`));
  if (hit) return hit.toUpperCase();
  return null;
};

// Drop release noise to recover a human title. Falls back to the original
// title if cleaning leaves nothing useful.
const cleanTitle = (raw) => {
  if (!raw) return '';
  let t = String(raw);

  // Strip bracketed groups/tags first (e.g. "[SubsPlease]", "[1080p]").
  t = t.replace(/\[[^\]]*\]/g, ' ');
  // Strip parenthesized tags (year, codec, audio).
  t = t.replace(/\([^)]*\)/g, ' ');
  // Drop release-group / codec / audio tags verbatim.
  t = t.replace(STRIP_RE, ' ');

  // Drop everything from the first " - " episode marker onward, including
  // standalone dash separators when followed by an episode number.
  let dashIdx = t.search(/\s+-\s+\d+\s*[\[(]?/);
  if (dashIdx === -1) dashIdx = t.search(/\s+-\s+\d+\s*$/);
  if (dashIdx === -1) dashIdx = t.search(/\s-\s/);
  // SxxExx marker (e.g. "S01E10") — drop from the marker onward since the
  // anime name ends just before the season/episode token.
  const sIdx = t.search(/\bS\d{1,2}E\d{1,4}\b/i);
  if (sIdx > 0 && (dashIdx === -1 || sIdx < dashIdx)) dashIdx = sIdx;
  if (dashIdx > 0) t = t.slice(0, dashIdx);

  // Collapse whitespace and trim.
  t = t.replace(/\s+/g, ' ').trim();

  if (!t) return String(raw).trim();
  return t;
};

// Convert one torrent row into a HiAnime-style card. AniList enrichment is
// layered on afterwards by `applyEnrichment`.
const mapRow = (row) => {
  const cleaned = cleanTitle(row.title);
  const quality = pickQuality(row.title);
  const episode = pickEpisode(row.title);
  const type = pickType(row.title);
  return {
    id: row.id,
    torrentId: row.id,
    title: cleaned || row.title,
    jname: null,
    ename: row.title,
    description: null,
    href: `/torrent/${row.id}`,
    url: row.url,
    poster: null,
    cover: null,
    banner: null,
    color: null,
    score: null,
    popularity: null,
    favourites: null,
    season: null,
    year: null,
    isAdult: false,
    genres: [],
    duration: null,
    status: null,
    anilistId: null,
    malId: null,
    episodes: { sub: null, dub: null },
    type,
    quality,
    episodeNumber: episode,
    rank: null,
  };
};

// Merge an AniList media payload into a card. Only fields we want to mirror
// from HiAnime are copied over; nothing else is touched.
const applyEnrichment = (card, media) => {
  if (!media) return card;
  card.anilistId = media.id ?? null;
  card.malId = media.idMal ?? null;
  card.title = media.title || card.title;
  card.jname = media.jname || null;
  card.ename = media.ename || null;
  card.poster = media.poster || null;
  card.cover = media.poster || null;
  card.banner = media.banner || null;
  card.color = media.color || null;
  card.score = media.score ?? null;
  card.popularity = media.popularity ?? null;
  card.favourites = media.favourites ?? null;
  card.season = media.season || null;
  card.year = media.year ?? null;
  card.isAdult = Boolean(media.isAdult);
  card.genres = Array.isArray(media.genres) ? media.genres : [];
  card.duration = media.duration ?? null;
  card.status = media.status || null;
  card.episodes = media.episodes || card.episodes;
  // HiAnime exposes episodes as { sub, dub }. AniList only gives a total;
  // surface it on both for symmetry, then keep `dub` null so consumers can
  // still tell there's no dub metadata.
  if (media.episodes && typeof media.episodes === 'object') {
    card.episodes = {
      sub: media.episodes.sub ?? null,
      dub: media.episodes.dub ?? null,
    };
  }
  return card;
};

// Enrich cards by AniList search, deduping by cleaned title. Up to 4
// concurrent lookups to stay polite to AniList's public endpoint.
const enrichCards = async (cards) => {
  const byTitle = new Map();
  const titles = [];
  cards.forEach((c) => {
    const key = c.title.toLowerCase().trim();
    if (!key) return;
    if (!byTitle.has(key)) {
      byTitle.set(key, []);
      titles.push(key);
    }
    byTitle.get(key).push(c);
  });

  const CONCURRENCY = 4;
  let cursor = 0;
  const lookup = async () => {
    while (cursor < titles.length) {
      const idx = cursor++;
      const key = titles[idx];
      const { media } = await enrichFromAniList(key).catch(() => ({ media: null }));
      if (media) {
        for (const card of byTitle.get(key)) applyEnrichment(card, media);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, titles.length) }, lookup));
  return cards;
};

const fetchCategoryTorrents = async (category) => {
  try {
    const { url, $ } = await fetchPage('/', {
      searchParams: { c: category, p: 1 },
      referer: NYAA_BASE_URL,
    });
    const rows = extractTorrentRows($, $('table.torrent-list').first()).slice(0, HOME_LIMIT);
    return {
      category,
      categoryLabel: CATEGORIES[category] || null,
      results: rows,
      source: url,
    };
  } catch (error) {
    return {
      category,
      categoryLabel: CATEGORIES[category] || null,
      results: [],
      error: error.message,
    };
  }
};

// Pick `n` rows that look like an active airing show (heuristic: status
// RELEASING, or no enrichment yet, preferring high-seed entries).
const pickTopAiring = (cards) => {
  const releasing = cards.filter((c) => c.status === 'RELEASING');
  if (releasing.length >= 12) return releasing.slice(0, 12);
  // Fall back to "fresh uploads with high seeds" when AniList has no
  // RELEASING tag — raw uploads on the 1_0 (all-anime) category are a
  // decent proxy.
  return cards.slice(0, 12);
};

const pickMostPopular = (cards) => {
  return [...cards]
    .filter((c) => typeof c.popularity === 'number')
    .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
    .slice(0, 12);
};

const pickQuickLists = (cards) => {
  const newReleases = cards
    .filter((c) => c.status === 'RELEASING' || (!c.status && c.timestamp))
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    .slice(0, 12);

  const completed = cards
    .filter((c) => c.status === 'FINISHED' || c.status === 'CANCELLED')
    .slice(0, 12);

  // If AniList returned no completed rows (very likely for a torrent feed),
  // fall back to the lowest-popularity batch so the section isn't empty —
  // HiAnime users expect a populated quickList even on quiet feeds.
  const completedFallback = completed.length
    ? completed
    : [...cards].sort((a, b) => (a.score || 0) - (b.score || 0)).slice(0, 8);

  return { newReleases, completed: completedFallback };
};

export const getNyaaHome = async () => {
  const [english, anime] = await Promise.all(
    FEED_CATEGORIES.map((cat) => fetchCategoryTorrents(cat)),
  );

  // Build the card universe from both categories. Drop torrent-envelope
  // duplicates that share the same id (the same upload can appear in both
  // 1_2 and 1_0 listings).
  const seen = new Set();
  const allCards = [];
  for (const src of [english, anime]) {
    for (const row of src.results) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      allCards.push(mapRow(row));
    }
  }

  // Enrich with AniList in the background so partial enrichment still
  // produces a usable feed.
  await enrichCards(allCards);

  // Spotlight = top 8 most-recent English-translated uploads with metadata.
  const spotlight = english.results
    .slice(0, 12)
    .map((row) => allCards.find((c) => c.torrentId === row.id))
    .filter(Boolean)
    .slice(0, 8);

  // Trending = the rest of the most-recent English-translated uploads, with
  // rank numbers so the UI can number them like hianime does.
  const trending = english.results
    .slice(12, 30)
    .map((row) => allCards.find((c) => c.torrentId === row.id))
    .filter(Boolean)
    .map((card, i) => ({ ...card, rank: i + 1 }));

  // latestEpisodes = newest anime-1_0 uploads that resolved cleanly.
  const latestEpisodes = anime.results
    .slice(0, 12)
    .map((row) => allCards.find((c) => c.torrentId === row.id))
    .filter(Boolean);

  const topAiring = pickTopAiring(allCards);
  const mostPopular = pickMostPopular(allCards);
  const quickLists = pickQuickLists(allCards);

  return {
    source: NYAA_BASE_URL,
    spotlight,
    trending,
    topAiring,
    mostPopular,
    quickLists,
    // HiAnime exposes these on its home response; nyaa has no equivalent
    // surface so we return empty arrays (never `undefined`) to keep the
    // shape byte-compatible for shared UI components.
    latestEpisodes,
    estimatedSchedule: [],
    top10: { day: [], week: [], month: [] },
    genres: [],
    // Expose the raw source so callers can audit / debug if needed.
    feed: {
      categories: FEED_CATEGORIES,
      counts: {
        englishTranslated: english.results.length,
        anime: anime.results.length,
      },
    },
  };
};