import { axios } from '../utils/scrapper-deps.js';

export const REANIME_BASE_URL = 'https://reanime.to';
export const REANIME_API = `${REANIME_BASE_URL}/api/v1`;
// The flix server list lives outside /api/v1 and is keyed by anilist id + episode.
export const REANIME_FLIX_URL = `${REANIME_BASE_URL}/api/flix`;

export const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export const CDN_REFERER = `${REANIME_BASE_URL}/`;

// The reanime API is a plain public JSON API: no auth, no Origin/CSRF checks.
// `proxy: false` avoids env-proxy interference (same as the other providers).
export const apiGet = async (path, params) => {
  const { data } = await axios.get(`${REANIME_API}${path}`, {
    proxy: false,
    timeout: 25000,
    maxRedirects: 5,
    params,
    headers: {
      'User-Agent': DEFAULT_UA,
      Accept: 'application/json, */*',
      Referer: CDN_REFERER,
    },
  });
  return data;
};

// Fetch the flixcloud server list for one episode.
export const flixGet = async (anilistId, episode, malId) => {
  const { data } = await axios.get(`${REANIME_FLIX_URL}/${anilistId}/${episode}`, {
    proxy: false,
    timeout: 25000,
    params: malId ? { mal: malId } : undefined,
    headers: {
      'User-Agent': DEFAULT_UA,
      Accept: 'application/json, */*',
      Referer: CDN_REFERER,
    },
  });
  return data;
};

// Public anime id used in reanime URLs, e.g. "naruto-bjfend".
export const normalizeAnimeId = (raw) => {
  const clean = String(raw || '')
    .split('#')[0]
    .split('?')[0]
    .replace(/^https?:\/\/[^/]+\//, '')
    .replace(/^\/+|\/+$/g, '')
    .replace(/^(anime|watch)\//, '');
  return clean || null;
};

export const buildAnimeUrl = (animeId) => `${REANIME_BASE_URL}/anime/${encodeURIComponent(animeId)}`;

// Map a reanime anime card (home/search/listing share this shape) to the shared
// card shape used across providers. `episodes` is the total episode count, with
// sub/dub counts when the payload carries them.
export const mapAnimeCard = (item) => {
  const animeId = item?.anime_id || null;
  const cover = item?.cover_image || {};
  const title = item?.title || {};
  const subbed = item?.subbed ?? null;
  const dubbed = item?.dubbed ?? null;

  return {
    id: animeId,
    animeId,
    anilistId: item?.anilist_id ?? null,
    malId: item?.mal_id ?? null,
    title: title.english || title.user_preferred || title.romaji || title.native || null,
    jname: title.romaji || title.native || null,
    native: title.native || null,
    aliases: [...new Set(Object.values(title).filter(Boolean))],
    poster: cover.extra_large || cover.large || cover.medium || null,
    banner: item?.banner_image || null,
    clearLogo: item?.clearart || null,
    color: cover.color || null,
    description: item?.description || null,
    type: item?.format || null,
    status: item?.status || null,
    genres: Array.isArray(item?.genres) ? item.genres : item?.genres ? [item.genres] : [],
    season: item?.season || null,
    year: item?.season_year ?? null,
    score: item?.average_score ?? null,
    popularity: item?.popularity ?? null,
    rating: item?.rating || null,
    episodes: {
      total: item?.episodes ?? null,
      sub: subbed,
      dub: dubbed,
    },
    duration: item?.duration ?? null,
    url: buildAnimeUrl(animeId),
    publicId: animeId,
  };
};
