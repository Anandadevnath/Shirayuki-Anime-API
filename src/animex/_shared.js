import { axios } from '../utils/scrapper-deps.js';

export const ANIMEX_BASE_URL = 'https://animex.one';
export const ANIMEX_GRAPHQL_URL = 'https://graphql.animex.one';
export const ANIMEX_PP_BASE_URL = 'https://pp.animex.one';
export const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export const CDN_REFERER = `${ANIMEX_BASE_URL}/`;

const baseHeaders = (referer) => ({
  'User-Agent': DEFAULT_UA,
  Origin: ANIMEX_BASE_URL,
  Referer: referer || CDN_REFERER,
});

export const pageHeaders = (referer) => ({
  'User-Agent': DEFAULT_UA,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  Referer: referer || CDN_REFERER,
});

// The graphql.animex.one endpoints are plain JSON GETs (no CORS headers needed,
// they respond to curl), while the GraphQL POST requires Content-Type + Origin.
const gqlHeaders = () => ({
  'User-Agent': DEFAULT_UA,
  'Content-Type': 'application/json',
  Accept: 'application/json',
  Origin: ANIMEX_BASE_URL,
  Referer: CDN_REFERER,
});

export const pageGet = async (url, referer) => {
  const { data } = await axios.get(url, {
    proxy: false,
    timeout: 25000,
    maxRedirects: 5,
    headers: pageHeaders(referer),
  });
  return data;
};

// POST to the animex GraphQL endpoint. Returns parsed data or throws.
export const graphqlPost = async (query, variables = {}) => {
  const { data } = await axios.post(
    `${ANIMEX_GRAPHQL_URL}/graphql`,
    { query, variables },
    {
      proxy: false,
      timeout: 20000,
      headers: gqlHeaders(),
    },
  );
  return data;
};

// GET against the info api on graphql.animex.one (/api/recent, /api/schedule...).
export const infoApiGet = async (path) => {
  const { data } = await axios.get(`${ANIMEX_GRAPHQL_URL}${path}`, {
    proxy: false,
    timeout: 20000,
    headers: {
      'User-Agent': DEFAULT_UA,
      Accept: 'application/json, */*',
      Referer: CDN_REFERER,
    },
  });
  return data;
};

// GET against the pp.animex.one player REST api.
export const ppGet = async (path) => {
  const { data } = await axios.get(`${ANIMEX_PP_BASE_URL}${path}`, {
    proxy: false,
    timeout: 20000,
    headers: {
      'User-Agent': DEFAULT_UA,
      Accept: 'application/json, */*',
      Origin: ANIMEX_BASE_URL,
      Referer: CDN_REFERER,
    },
  });
  return data;
};

// SvelteKit encodes page payloads with devalue's "index format": a flat array
// where objects are arrays whose first element is the key list and the rest are
// indexes into the flat array. This decoder restores the object graph.
const SPECIAL_TYPES = {
  NaN: () => NaN,
  Infinity: () => Infinity,
  '-Infinity': () => -Infinity,
  '-0': () => -0,
  undefined: () => undefined,
  null: () => null,
  Date: (v) => (typeof v[1] === 'string' ? new Date(v[1]) : null),
  BigInt: (v) => (typeof v[1] === 'string' ? BigInt(v[1]) : null),
  URL: (v) => (typeof v[1] === 'string' ? v[1] : null),
  Set: (v) => new Set(v.slice(1)),
  Map: (v) => new Map(v.slice(1)),
  RegExp: (v) => (typeof v[1] === 'string' ? new RegExp(v[1], v[2]) : null),
};

const unflattenDevalue = (flat) => {
  const seen = new Map();

  const parse = (index) => {
    if (index in seen) return seen[index];
    const value = flat[index];

    if (value === null || typeof value !== 'object') return value;

    if (Array.isArray(value)) {
      // Special encodings start with a tag string ("Date", "Set", "NaN", ...).
      if (typeof value[0] === 'string' && SPECIAL_TAGS.has(value[0])) {
        return SPECIAL_TYPES[value[0]](value);
      }
      // Plain array of indexes.
      const arr = [];
      seen[index] = arr;
      value.forEach((v, i) => {
        arr[i] = parse(v);
      });
      return arr;
    }

    const obj = {};
    seen[index] = obj;
    for (const [key, valueIndex] of Object.entries(value)) {
      obj[key] = parse(valueIndex);
    }
    return obj;
  };

  return parse;
};

// Decode the `data` payload of a SvelteKit __data.json node.
// Returns the root object (e.g. { animeInfo, anilistId }) or null.
export const decodeSvelteKitData = (rawData) => {
  const flat = rawData?.data;
  if (!Array.isArray(flat) || flat.length < 2) return null;
  const parse = unflattenDevalue(flat);
  // flat[0] is the root key map ({animeInfo: 1, ...}); values start at index 1.
  const obj = {};
  for (const [key, valueIndex] of Object.entries(flat[0])) {
    obj[key] = typeof valueIndex === 'number' ? parse(valueIndex) : valueIndex;
  }
  return obj;
};

// Fetch + decode the SvelteKit payload for an animex.one page path.
// Returns { pageData, error } where pageData holds the load function output
// (e.g. { animeInfo, anilistId }).
export const fetchAnimexPageData = async (path) => {
  const url = `${ANIMEX_BASE_URL}${path}${path.includes('?') ? '&' : '?'}__data.json`;
  const { data } = await axios.get(url, {
    proxy: false,
    timeout: 25000,
    maxRedirects: 5,
    headers: pageHeaders(),
  });
  return data;
};

// Normalize the anime id: accepts full URLs, /anime/ or /watch/ paths, or the
// bare id (e.g. "naruto-20"). Returns the path segment used on animex.one.
export const normalizeAnimeId = (raw) => {
  const clean = String(raw || '')
    .split('#')[0]
    .split('?')[0]
    .replace(/^https?:\/\/[^/]+\//, '')
    .replace(/^\/+|\/+$/g, '')
    .replace(/^(anime|watch)\//, '');
  return clean || null;
};

// Category for sources: 'sub' or 'dub'.
export const normalizeCategory = (category) => {
  const value = String(category || 'sub').toLowerCase().trim();
  return value === 'dub' || value === 'd' ? 'dub' : 'sub';
};

// CatalogAnime sort presets used across home/catalog endpoints.
export const sortPresets = {
  trending: [{ field: 'TRENDING', direction: 'DESC' }],
  popular: [{ field: 'POPULARITY', direction: 'DESC' }],
  latest: [{ field: 'CREATED_AT', direction: 'DESC' }],
  score: [{ field: 'AVERAGE_SCORE', direction: 'DESC' }],
};

// Kebab-case a title the same way the site builds its public slugs
// (e.g. "NARUTO" -> "naruto", "Dr.STONE: TERRAFORMING" -> "dr-stone-terraforming").
export const kebabize = (title) =>
  String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export const buildDetailUrl = (animeId) => `${ANIMEX_BASE_URL}/anime/${encodeURIComponent(animeId)}`;

export const buildWatchUrl = (animeId, episode) =>
  `${ANIMEX_BASE_URL}/watch/${encodeURIComponent(animeId)}${episode ? `-episode-${episode}` : ''}`;
