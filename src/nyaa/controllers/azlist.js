import { getNyaaCategory } from '../scraper/category.js';
import { enrichFromAniList, cleanTorrentTitle } from '../scraper/_enrich.js';
import { wrapController } from './_cache.js';

// Map a single letter to a Nyaa category code. hianime's /azlist/A means
// "titles starting with A" — nyaa has no alphabetical view, so we treat each
// letter as a top-level content bucket. Unknown letters fall back to "all".
const LETTER_TO_CATEGORY = {
  a: '1_0', // Anime (parent)
  b: '1_1', // Anime - AMV
  c: '1_2', // Anime - English-translated
  d: '1_3', // Anime - Non-English-translated
  e: '1_4', // Anime - Raw
  f: '2_0', // Audio (parent)
  g: '2_1', // Audio - Lossless
  h: '2_2', // Audio - Lossy
  i: '3_0', // Literature (parent)
  j: '3_1', // Literature - English-translated
  k: '3_2', // Literature - Non-English-translated
  l: '3_3', // Literature - Raw
  m: '4_0', // Live Action (parent)
  n: '4_1', // Live Action - English-translated
  o: '4_2', // Live Action - Idol/PV
  p: '4_3', // Live Action - Non-English-translated
  q: '4_4', // Live Action - Raw
  r: '5_0', // Pictures (parent)
  s: '5_1', // Pictures - Graphics
  t: '5_2', // Pictures - Photos
  u: '6_0', // Software (parent)
  v: '6_1', // Software - Apps
  w: '6_2', // Software - Games
  x: '0_0', // All categories
};

export const LETTERS = Object.keys(LETTER_TO_CATEGORY);

const resolveLetter = (raw) => {
  const letter = String(raw || 'a').trim().toLowerCase();
  return LETTER_TO_CATEGORY[letter] || LETTER_TO_CATEGORY.a;
};

// "Rent-a-Girlfriend" -> "rent-a-girlfriend". Matches hianime's href format.
const slugify = (s) => {
  if (!s) return null;
  return String(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

// Map a raw nyaa torrent row to the hianime/azlist item shape.
// We *always* keep the nyaa torrent block (id, size, seeders, leechers,
// info hash, url, etc.) under `torrent` so /episode/sources can still
// resolve this exact torrent later.
const mapToHianimeShape = (row, media) => {
  const slug = media ? slugify(media.ename || media.title || row.title) : null;
  const href = slug ? `/anime/${slug}` : null;
  const url = href ? `https://hianime.ad${href}` : row.url;

  // hianime lists `duration` as a year-like string for series; mirror that.
  const type = media?.type || null;
  const duration = media?.year ? String(media.year) : null;

  return {
    // hianime-style core fields
    id: slug || row.id,
    title: media?.title || row.title,
    jname: media?.jname || null,
    ename: media?.ename || null,
    href,
    url,
    poster: media?.poster || null,
    type,
    duration,
    episode: null,
    episodes: media?.episodes || { sub: null, dub: null },

    // nyaa linkage — keeps this row connectable to /episode/sources
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
      uploader: row.uploader || row.submitter || null,
    },

    // enrichment provenance — useful for the client to know if metadata is real
    enrichment: media
      ? { matched: true, source: 'anilist', anilistId: media.id, matchedTitle: media.title }
      : { matched: false, source: 'anilist' },
  };
};

// Per-request cache so duplicate titles in the page only hit AniList once.
const buildEnricher = () => {
  const seen = new Map(); // cleanedTitle -> Promise<enrichment>
  return (rawTitle) => {
    const key = cleanTorrentTitle(rawTitle).toLowerCase();
    if (!key) return Promise.resolve({ matched: false, error: 'empty title' });
    if (seen.has(key)) return seen.get(key);
    const p = enrichFromAniList(rawTitle).catch((err) => ({
      matched: false,
      error: err?.message || 'enrich failed',
    }));
    seen.set(key, p);
    return p;
  };
};

const enrichResults = async (results) => {
  if (!Array.isArray(results) || results.length === 0) return [];
  const enrich = buildEnricher();
  const settled = await Promise.all(
    results.map((row) => enrich(row.title).then((e) => ({ row, e }))),
  );
  return settled.map(({ row, e }) => mapToHianimeShape(row, e.matched ? e.media : null));
};

export const nyaaAzlistController = wrapController({
  cacheKey: (c) => {
    const letter = c.req.param('letter') || 'a';
    const page = c.req.query('page') || '1';
    const filter = c.req.query('filter') || '0';
    const query = c.req.query('query') || '';
    return `azlist:v2:${letter}:${page}:${filter}:${query}`;
  },
  handler: async (c) => {
    const letter = String(c.req.param('letter') || '').toLowerCase();
    if (!LETTERS.includes(letter)) {
      const err = new Error(`Unknown letter "${letter}". Use one of: ${LETTERS.join(', ')}`);
      err.statusCode = 404;
      throw err;
    }
    const category = resolveLetter(letter);
    const data = await getNyaaCategory({
      category,
      page: c.req.query('page'),
      filter: c.req.query('filter'),
      query: c.req.query('query'),
    });

    const results = await enrichResults(data.results);

    return {
      source: data.source,
      letter: String(letter || '').toLowerCase(),
      letterCategory: category,
      category: data.category,
      categoryLabel: data.categoryLabel,
      filter: data.filter,
      query: data.query,
      pagination: data.pagination,
      results,
    };
  },
});