import { axios } from '../../utils/scrapper-deps.js';
import {
  ANILIST_GRAPHQL_URL,
  ANILIST_SITE_URL,
  httpError,
  slugify,
  parseAnimeId,
  toPositiveInt,
} from '../_shared.js';

const REQUEST_TIMEOUT_MS = 15000;
const PER_PAGE = 24;
const MAX_QUERY_LENGTH = 100;

const CARD_FIELDS = `
  id idMal format status episodes duration averageScore isAdult
  title { romaji english native }
  synonyms
  coverImage { extraLarge large color }
  bannerImage
  nextAiringEpisode { episode airingAt }
`;

/**
 * POST a GraphQL query to AniList and return `data`.
 * @param {string} query
 * @param {Record<string, unknown>} variables
 */
export const gqlRequest = async (query, variables = {}) => {
  try {
    const res = await axios.post(
      ANILIST_GRAPHQL_URL,
      { query, variables },
      {
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        timeout: REQUEST_TIMEOUT_MS,
        proxy: false,
      },
    );
    if (res.data?.errors?.length) throw httpError(`AniList: ${res.data.errors[0].message}`, 502);
    return res.data.data;
  } catch (error) {
    // Our own httpErrors pass through; axios errors also carry .status, so map those below.
    if (error.status && !error.response) throw error;
    const status = error.response?.status;
    if (status === 429) throw httpError('AniList rate limit hit, retry in a minute', 503);
    if (status === 404) throw httpError('Anime not found on AniList', 404);
    throw httpError(`AniList request failed: ${status || error.code || error.message}`, 502);
  }
};

const pickTitle = (t = {}) => t.english || t.romaji || t.native || null;

// Episodes that have actually aired (for currently airing shows) or the total.
export const availableEpisodes = (media) => {
  if (media?.nextAiringEpisode?.episode) return Math.max(0, media.nextAiringEpisode.episode - 1);
  return media?.episodes ?? null;
};

export const buildAnimeId = (media) => {
  const slug = slugify(media?.title?.romaji || media?.title?.english || '');
  return slug ? `${slug}-${media.id}` : String(media.id);
};

const formatType = (format) =>
  ({ TV: 'TV', TV_SHORT: 'TV Short', MOVIE: 'Movie', SPECIAL: 'Special', OVA: 'OVA', ONA: 'ONA', MUSIC: 'Music' })[
    format
  ] || format || null;

/** Map AniList media to the hianime card shape (+ a few AniList extras). */
export const toCard = (media) => ({
  id: buildAnimeId(media),
  anilistId: media.id,
  malId: media.idMal ?? null,
  title: pickTitle(media.title),
  jname: media.title?.romaji || null,
  poster: media.coverImage?.extraLarge || media.coverImage?.large || null,
  banner: media.bannerImage || null,
  type: formatType(media.format),
  duration: media.duration ? `${media.duration}m` : null,
  rating: media.averageScore != null ? media.averageScore / 10 : null,
  status: media.status || null,
  episodes: {
    sub: availableEpisodes(media),
    dub: null,
    total: media.episodes ?? null,
  },
  url: `${ANILIST_SITE_URL}/anime/${media.id}`,
});

const stripHtml = (html) =>
  String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim() || null;

const currentSeason = (date = new Date()) => {
  const m = date.getUTCMonth();
  const season = m < 3 ? 'WINTER' : m < 6 ? 'SPRING' : m < 9 ? 'SUMMER' : 'FALL';
  return { season, seasonYear: date.getUTCFullYear() };
};

const pageInfo = (p = {}) => ({
  currentPage: p.currentPage ?? 1,
  hasNextPage: Boolean(p.hasNextPage),
  totalPages: p.lastPage ?? null,
});

// ---------- home ----------

const HOME_QUERY = `
query ($season: MediaSeason, $seasonYear: Int) {
  trending: Page(perPage: 20) { media(type: ANIME, sort: TRENDING_DESC, isAdult: false) { ${CARD_FIELDS} description(asHtml: false) genres } }
  popularSeason: Page(perPage: 20) { media(type: ANIME, season: $season, seasonYear: $seasonYear, sort: POPULARITY_DESC, isAdult: false) { ${CARD_FIELDS} } }
  upcoming: Page(perPage: 20) { media(type: ANIME, status: NOT_YET_RELEASED, sort: POPULARITY_DESC, isAdult: false) { ${CARD_FIELDS} } }
  topRated: Page(perPage: 20) { media(type: ANIME, sort: SCORE_DESC, isAdult: false) { ${CARD_FIELDS} } }
  topAiring: Page(perPage: 20) { media(type: ANIME, status: RELEASING, sort: POPULARITY_DESC, isAdult: false) { ${CARD_FIELDS} } }
}`;

export const getAnilistHome = async () => {
  const data = await gqlRequest(HOME_QUERY, currentSeason());
  const spotlight = (data.trending?.media || []).slice(0, 10).map((m, i) => ({
    ...toCard(m),
    rank: i + 1,
    description: stripHtml(m.description),
    genres: m.genres || [],
  }));
  return {
    spotlight,
    trending: (data.trending?.media || []).map(toCard),
    popularThisSeason: (data.popularSeason?.media || []).map(toCard),
    topAiring: (data.topAiring?.media || []).map(toCard),
    upcoming: (data.upcoming?.media || []).map(toCard),
    topRated: (data.topRated?.media || []).map(toCard),
  };
};

// ---------- search / browse / genre ----------

const PAGE_QUERY = `
query ($page: Int, $perPage: Int, $search: String, $sort: [MediaSort], $status: MediaStatus,
       $format: MediaFormat, $genre: String) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { currentPage hasNextPage lastPage }
    media(type: ANIME, isAdult: false, search: $search, sort: $sort, status: $status,
          format: $format, genre: $genre) { ${CARD_FIELDS} }
  }
}`;

const runPageQuery = async (variables) => {
  const data = await gqlRequest(PAGE_QUERY, { perPage: PER_PAGE, ...variables });
  return { ...pageInfo(data.Page?.pageInfo), animes: (data.Page?.media || []).map(toCard) };
};

const requireQuery = (q) => {
  const keyword = String(q || '').trim();
  if (!keyword) throw httpError('q query parameter is required', 400);
  if (keyword.length > MAX_QUERY_LENGTH) throw httpError(`q must be at most ${MAX_QUERY_LENGTH} characters`, 400);
  return keyword;
};

export const searchAnilist = async ({ q, page } = {}) => {
  const keyword = requireQuery(q);
  const result = await runPageQuery({ search: keyword, page: toPositiveInt(page, 1), sort: ['SEARCH_MATCH'] });
  return { query: keyword, ...result };
};

export const suggestAnilist = async ({ q } = {}) => {
  const keyword = requireQuery(q);
  const result = await runPageQuery({ search: keyword, page: 1, perPage: 10, sort: ['SEARCH_MATCH'] });
  const suggestions = result.animes.map(({ id, anilistId, title, jname, poster, type, url }) => ({
    id,
    anilistId,
    title,
    jname,
    poster,
    type,
    url,
  }));
  return { query: keyword, suggestions };
};

export const BROWSE_CATEGORIES = Object.freeze({
  trending: { sort: ['TRENDING_DESC'] },
  'most-popular': { sort: ['POPULARITY_DESC'] },
  'most-favorite': { sort: ['FAVOURITES_DESC'] },
  'top-rated': { sort: ['SCORE_DESC'] },
  'top-airing': { sort: ['POPULARITY_DESC'], status: 'RELEASING' },
  upcoming: { sort: ['POPULARITY_DESC'], status: 'NOT_YET_RELEASED' },
  completed: { sort: ['POPULARITY_DESC'], status: 'FINISHED' },
  'recently-updated': { sort: ['UPDATED_AT_DESC'], status: 'RELEASING' },
  tv: { sort: ['POPULARITY_DESC'], format: 'TV' },
  movie: { sort: ['POPULARITY_DESC'], format: 'MOVIE' },
  ova: { sort: ['POPULARITY_DESC'], format: 'OVA' },
  ona: { sort: ['POPULARITY_DESC'], format: 'ONA' },
  special: { sort: ['POPULARITY_DESC'], format: 'SPECIAL' },
});

export const browseAnilist = async ({ category, page } = {}) => {
  const key = String(category || '').trim().toLowerCase();
  const preset = BROWSE_CATEGORIES[key];
  if (!preset) {
    throw httpError(`Unknown category. Use one of: ${Object.keys(BROWSE_CATEGORIES).join(', ')}`, 400);
  }
  return { category: key, ...(await runPageQuery({ ...preset, page: toPositiveInt(page, 1) })) };
};

// AniList genre names are Title Case ("Slice of Life", "Sci-Fi").
const normalizeGenre = (genre) =>
  String(genre || '')
    .trim()
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
    .replace(/^Sci Fi$/i, 'Sci-Fi')
    .replace(/ Of /g, ' of ');

export const genreAnilist = async ({ genre, page } = {}) => {
  const name = normalizeGenre(genre);
  if (!name || name.length > 40) throw httpError('genre path parameter is required', 400);
  return { genre: name, ...(await runPageQuery({ genre: name, sort: ['POPULARITY_DESC'], page: toPositiveInt(page, 1) })) };
};

// ---------- details / episodes ----------

const DETAILS_QUERY = `
query ($id: Int) {
  Media(id: $id, type: ANIME) {
    ${CARD_FIELDS}
    description(asHtml: false) genres season seasonYear source countryOfOrigin
    startDate { year month day } endDate { year month day }
    studios { edges { isMain node { name } } }
    trailer { id site }
    streamingEpisodes { title thumbnail }
    relations { edges { relationType node { ${CARD_FIELDS} type } } }
    recommendations(perPage: 12, sort: RATING_DESC) { nodes { mediaRecommendation { ${CARD_FIELDS} } } }
  }
}`;

const fmtDate = (d) =>
  d?.year ? [d.year, d.month, d.day].filter(Boolean).map((n) => String(n).padStart(2, '0')).join('-') : null;

// AniList allows ~30 req/min; switching episodes of one show must not re-fetch it.
const MEDIA_TTL_MS = 5 * 60 * 1000;
const MAX_MEDIA_ENTRIES = 200;
const mediaCache = new Map();

export const fetchAnilistMedia = async (animeId) => {
  const id = parseAnimeId(animeId);
  const hit = mediaCache.get(id);
  if (hit && hit.expiresAt > Date.now()) return hit.pending;
  const pending = gqlRequest(DETAILS_QUERY, { id }).then((data) => {
    if (!data?.Media) throw httpError('Anime not found on AniList', 404);
    return data.Media;
  });
  mediaCache.set(id, { pending, expiresAt: Date.now() + MEDIA_TTL_MS });
  while (mediaCache.size > MAX_MEDIA_ENTRIES) mediaCache.delete(mediaCache.keys().next().value);
  // Failures (rate limit, network) must not stick for the whole TTL.
  pending.catch(() => {
    if (mediaCache.get(id)?.pending === pending) mediaCache.delete(id);
  });
  return pending;
};

export const getAnilistDetails = async ({ animeId } = {}) => {
  const m = await fetchAnilistMedia(animeId);
  const studios = m.studios?.edges || [];
  return {
    source: `${ANILIST_SITE_URL}/anime/${m.id}`,
    ...toCard(m),
    alias: m.synonyms?.join(', ') || null,
    titles: m.title,
    synonyms: m.synonyms || [],
    description: stripHtml(m.description),
    genres: m.genres || [],
    studios: studios.filter((e) => e.isMain).map((e) => e.node.name),
    producers: studios.filter((e) => !e.isMain).map((e) => e.node.name),
    premiered: m.season && m.seasonYear ? `${m.season[0]}${m.season.slice(1).toLowerCase()} ${m.seasonYear}` : null,
    aired: { from: fmtDate(m.startDate), to: fmtDate(m.endDate) },
    malScore: null,
    nextAiringEpisode: m.nextAiringEpisode || null,
    trailer: m.trailer?.site === 'youtube' ? `https://www.youtube.com/watch?v=${m.trailer.id}` : null,
    relations: (m.relations?.edges || [])
      .filter((e) => e.node?.type === 'ANIME')
      .map((e) => ({ relation: e.relationType, ...toCard(e.node) })),
    recommendations: (m.recommendations?.nodes || [])
      .map((n) => n.mediaRecommendation)
      .filter(Boolean)
      .map(toCard),
  };
};

export const getAnilistEpisodes = async ({ animeId } = {}) => {
  const m = await fetchAnilistMedia(animeId);
  const id = buildAnimeId(m);
  const count = availableEpisodes(m) ?? m.streamingEpisodes?.length ?? 0;
  // streamingEpisodes titles look like "Episode 3 - The Title"; index them by number.
  const titled = new Map();
  (m.streamingEpisodes || []).forEach((se) => {
    const n = Number(se.title?.match(/Episode\s+(\d+)/i)?.[1]);
    if (n) titled.set(n, se);
  });
  const episodes = Array.from({ length: count }, (_, i) => {
    const num = i + 1;
    const se = titled.get(num);
    return {
      episode: num,
      episodeId: `${m.id}-ep-${num}`,
      title: se?.title?.replace(/^Episode\s+\d+\s*-\s*/i, '') || `Episode ${num}`,
      thumbnail: se?.thumbnail || null,
      url: null,
    };
  });
  return {
    source: `${ANILIST_SITE_URL}/anime/${m.id}`,
    id,
    anilistId: m.id,
    title: pickTitle(m.title),
    totalEpisodes: episodes.length,
    nextAiringEpisode: m.nextAiringEpisode || null,
    episodes,
  };
};

// ---------- schedule ----------

const SCHEDULE_QUERY = `
query ($from: Int, $to: Int, $page: Int) {
  Page(page: $page, perPage: 50) {
    pageInfo { hasNextPage }
    airingSchedules(airingAt_greater: $from, airingAt_lesser: $to, sort: TIME) {
      episode airingAt media { ${CARD_FIELDS} }
    }
  }
}`;

const MAX_SCHEDULE_PAGES = 4;
const DAY_SEC = 24 * 60 * 60;

export const getAnilistSchedule = async ({ date } = {}) => {
  const day = date ? new Date(`${date}T00:00:00Z`) : new Date(new Date().toISOString().slice(0, 10));
  if (Number.isNaN(day.getTime())) throw httpError('date must be YYYY-MM-DD', 400);
  const from = Math.floor(day.getTime() / 1000) - 1;
  const to = from + DAY_SEC + 1;

  const rows = [];
  for (let page = 1; page <= MAX_SCHEDULE_PAGES; page += 1) {
    const data = await gqlRequest(SCHEDULE_QUERY, { from, to, page });
    rows.push(...(data.Page?.airingSchedules || []));
    if (!data.Page?.pageInfo?.hasNextPage) break;
  }
  return {
    date: day.toISOString().slice(0, 10),
    scheduledAnimes: rows
      .filter((r) => r.media && !r.media.isAdult)
      .map((r) => ({
        ...toCard(r.media),
        episode: r.episode,
        airingAt: new Date(r.airingAt * 1000).toISOString(),
        time: new Date(r.airingAt * 1000).toISOString().slice(11, 16),
      })),
  };
};
