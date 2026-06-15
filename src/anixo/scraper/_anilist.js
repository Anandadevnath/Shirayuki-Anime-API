import { axios } from '../../utils/scrapper-deps.js';
import { ANIXO_BASE_URL, DEFAULT_UA } from './_shared.js';

export const ANILIST_GRAPHQL_URL = 'https://graphql.anilist.co';
export const JIKAN_BASE_URL = 'https://api.jikan.moe/v4';

// POST a GraphQL query to AniList and return the `data` object.
export const anilistQuery = async (query, variables = {}) => {
  const response = await axios.post(
    ANILIST_GRAPHQL_URL,
    { query, variables },
    {
      proxy: false,
      timeout: 20000,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': DEFAULT_UA,
      },
    },
  );

  const payload = response?.data;
  if (payload?.errors?.length) {
    throw new Error(payload.errors[0]?.message || 'AniList query failed');
  }

  return payload?.data || null;
};

// GET from the Jikan REST API (used for episode lists keyed by MAL id).
export const jikanGet = async (path, params = {}) => {
  const response = await axios.get(`${JIKAN_BASE_URL}${path}`, {
    proxy: false,
    timeout: 20000,
    params,
    headers: {
      Accept: 'application/json',
      'User-Agent': DEFAULT_UA,
    },
  });

  return response?.data ?? null;
};

// Title sub-selection reused across queries.
export const MEDIA_FRAGMENT = `
  id
  idMal
  title { romaji english native userPreferred }
  coverImage { extraLarge large medium color }
  bannerImage
  format
  type
  status
  episodes
  duration
  averageScore
  meanScore
  popularity
  favourites
  genres
  season
  seasonYear
  startDate { year month day }
  isAdult
  nextAiringEpisode { episode airingAt timeUntilAiring }
`;

const pickTitle = (title = {}) =>
  title.english || title.romaji || title.userPreferred || title.native || null;

const formatType = (media) => {
  if (media?.format) return media.format; // TV, MOVIE, OVA, ONA, SPECIAL, MUSIC
  return media?.type || null;
};

// AniList exposes total episode count; dub availability isn't in the base schema,
// so we surface the known sub count and leave dub null. For currently-airing shows
// without a final count, fall back to the last aired episode.
const episodeCounts = (media) => {
  const aired = media?.nextAiringEpisode?.episode
    ? media.nextAiringEpisode.episode - 1
    : null;
  const total = media?.episodes ?? aired ?? null;
  return { sub: total, dub: null };
};

// Normalize an AniList Media node into the shape used across anixo listings.
// `id` is the AniList numeric id and plugs directly into /episode/sources.
export const mapMedia = (media) => {
  if (!media) return null;

  return {
    id: media.id,
    idMal: media.idMal ?? null,
    title: pickTitle(media.title),
    jname: media.title?.native || media.title?.romaji || null,
    ename: media.title?.english || null,
    romaji: media.title?.romaji || null,
    poster:
      media.coverImage?.extraLarge ||
      media.coverImage?.large ||
      media.coverImage?.medium ||
      null,
    banner: media.bannerImage || null,
    color: media.coverImage?.color || null,
    type: formatType(media),
    status: media.status || null,
    episodes: episodeCounts(media),
    duration: media.duration ?? null,
    score: media.averageScore ?? media.meanScore ?? null,
    popularity: media.popularity ?? null,
    favourites: media.favourites ?? null,
    genres: Array.isArray(media.genres) ? media.genres : [],
    season: media.season || null,
    year: media.seasonYear ?? media.startDate?.year ?? null,
    isAdult: Boolean(media.isAdult),
    href: `/watch/${media.id}`,
    url: `${ANIXO_BASE_URL}/watch/${media.id}`,
  };
};

export const mapMediaList = (list = []) =>
  (Array.isArray(list) ? list : []).map(mapMedia).filter(Boolean);

// AniList PageInfo -> consistent pagination object.
export const mapPageInfo = (pageInfo = {}) => ({
  currentPage: pageInfo.currentPage ?? 1,
  hasNextPage: Boolean(pageInfo.hasNextPage),
  totalPages: pageInfo.lastPage ?? null,
  total: pageInfo.total ?? null,
  perPage: pageInfo.perPage ?? null,
});

export const normalizePage = (page) => (Number(page) > 0 ? Number(page) : 1);
