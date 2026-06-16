import { axios } from '../../utils/scrapper-deps.js';

// animex.one is a SvelteKit SPA. Its player does NOT use MegaPlay directly;
// it talks to the site's own REST backend at pp.animex.one:
//   GET /rest/api/episodes?id=<slug>
//   GET /rest/api/servers?id=<slug>&epNum=<n>
//   GET /rest/api/sources?id=<slug>&epNum=<n>&type=<sub|dub>&providerId=<mimi|yuki|neko|mochi|miku>
// `slug` is animex's own anime slug (e.g. "to-be-hero-x-rbjzm"), NOT the AniList id.
// The AniList id -> slug mapping lives only in the SSR payload at
//   GET /watch/<anilistId>/__data.json  (SvelteKit devalue format) -> anime.slug
export const ANIMEX_BASE_URL = 'https://animex.one';
export const PP_API_BASE = 'https://pp.animex.one/rest/api';
export const DEFAULT_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Streaming providers animex exposes. `sub` and `dub` differ slightly.
export const SUB_PROVIDERS = ['mimi', 'yuki', 'miku', 'neko', 'mochi'];
export const DUB_PROVIDERS = ['mimi', 'yuki', 'miku', 'mochi'];
export const DEFAULT_SERVER = 'mimi';

// Friendly labels for the provider ids.
const PROVIDER_LABELS = {
  mimi: 'Mimi',
  yuki: 'Yuki',
  miku: 'Miku',
  neko: 'Neko',
  mochi: 'Mochi',
};

export const providerLabel = (id) =>
  PROVIDER_LABELS[id] || (id ? id[0].toUpperCase() + id.slice(1) : id);

export const apiHeaders = () => ({
  'User-Agent': DEFAULT_UA,
  Accept: 'application/json, text/plain, */*',
  Referer: `${ANIMEX_BASE_URL}/`,
  Origin: ANIMEX_BASE_URL,
});

// Accept "156092", "156092:1", "to-be-hero-x-156092-episode-1" (AniList id forms),
// or a direct animex slug like "to-be-hero-x-rbjzm". Resolves to
// { anilistId, ppSlug, episode } — exactly one of anilistId/ppSlug is set.
export const parseAnimeEpisodeRef = (animeEpisodeId, epQuery) => {
  if (!animeEpisodeId) return null;

  const raw = String(animeEpisodeId)
    .split('#')[0]
    .split('?')[0]
    .replace(/^\/watch\//, '')
    .replace(/\/$/, '')
    .trim();

  if (!raw) return null;

  const epFromQuery = epQuery && Number(epQuery) > 0 ? Number(epQuery) : null;

  // "156092:1" -> AniList id 156092, episode 1
  const colon = raw.match(/^(\d+):(\d+)$/);
  if (colon) {
    return { anilistId: Number(colon[1]), ppSlug: null, episode: Number(colon[2]) };
  }

  // "...-<anilistId>-episode-<n>" watch slug (e.g. to-be-hero-x-156092-episode-1)
  const watch = raw.match(/(\d+)-episode-(\d+)/i);
  if (watch) {
    return { anilistId: Number(watch[1]), ppSlug: null, episode: epFromQuery || Number(watch[2]) };
  }

  // Plain numeric AniList id
  if (/^\d+$/.test(raw)) {
    return { anilistId: Number(raw), ppSlug: null, episode: epFromQuery || 1 };
  }

  // Otherwise treat it as an animex slug already (skip the __data.json lookup)
  return { anilistId: null, ppSlug: raw, episode: epFromQuery || 1 };
};

export const normalizeCategory = (category) => {
  const value = String(category || 'sub').toLowerCase().trim();
  return value === 'dub' || value === 'd' ? 'dub' : 'sub';
};

export const normalizeServer = (server) => {
  const raw = String(server || DEFAULT_SERVER).toLowerCase().replace(/\s+/g, '-').trim();
  // Map a few legacy/aliased names onto real provider ids.
  if (!raw || raw === 'hd-1' || raw === 'default' || raw === 'megaplay') return 'mimi';
  if (raw === 'hd-2') return 'neko';
  return raw;
};

// --- AniList id -> animex slug resolution via the SSR __data.json payload ---

// Minimal devalue (SvelteKit __data.json) unflatten: the payload is a flat array
// where object/array slots hold integer references to other indices.
const unflattenDevalue = (arr) => {
  if (!Array.isArray(arr)) return arr;
  const seen = new Array(arr.length);
  const NEG = [undefined, null, NaN, Infinity, -Infinity];
  const hydrate = (i) => {
    if (i < 0) return NEG[-i - 1];
    if (seen[i] !== undefined) return seen[i];
    const value = arr[i];
    if (Array.isArray(value)) {
      const out = [];
      seen[i] = out;
      for (const ref of value) out.push(hydrate(ref));
      return out;
    }
    if (value && typeof value === 'object') {
      const out = {};
      seen[i] = out;
      for (const key in value) out[key] = hydrate(value[key]);
      return out;
    }
    seen[i] = value;
    return value;
  };
  return hydrate(0);
};

const slugCache = new Map();
const SLUG_TTL_MS = 30 * 60 * 1000;

export const resolveAnimexSlug = async (anilistId) => {
  const key = String(anilistId);
  const cached = slugCache.get(key);
  if (cached && Date.now() < cached.expiresAt) return cached.slug;

  const { data } = await axios.get(
    `${ANIMEX_BASE_URL}/watch/${encodeURIComponent(key)}/__data.json`,
    {
      proxy: false,
      timeout: 20000,
      headers: apiHeaders(),
    },
  );

  const node = (data?.nodes || []).filter(Boolean).find((n) => n && n.data);
  if (!node) {
    throw new Error(`Could not load animex data for AniList id ${anilistId}`);
  }

  const hydrated = unflattenDevalue(node.data);
  const slug = hydrated?.anime?.slug || null;
  if (!slug) {
    throw new Error(`No animex slug found for AniList id ${anilistId}`);
  }

  slugCache.set(key, { slug, expiresAt: Date.now() + SLUG_TTL_MS });
  return slug;
};

// Resolve a parsed ref down to a concrete animex slug.
export const resolveSlugFromRef = async (ref) => {
  if (ref?.ppSlug) return ref.ppSlug;
  if (ref?.anilistId) return resolveAnimexSlug(ref.anilistId);
  throw new Error('animeEpisodeId query parameter is required');
};

// --- pp.animex.one API calls ---

export const fetchAnimexServers = async (slug, episode) => {
  const { data } = await axios.get(`${PP_API_BASE}/servers`, {
    proxy: false,
    timeout: 20000,
    params: { id: slug, epNum: episode },
    headers: apiHeaders(),
  });
  return data || null;
};

export const fetchAnimexSources = async (slug, episode, category, providerId) => {
  const { data } = await axios.get(`${PP_API_BASE}/sources`, {
    proxy: false,
    timeout: 20000,
    params: { id: slug, epNum: episode, type: category, providerId },
    headers: apiHeaders(),
  });
  return data || null;
};
