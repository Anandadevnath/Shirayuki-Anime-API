import { ANIXO_BASE_URL } from './_shared.js';
import { normalizePage, mapMediaList } from './_anilist.js';
import { queryMediaPage } from './_list-query.js';
import { anilistQuery, MEDIA_FRAGMENT } from './_anilist.js';

const requireQuery = (q) => {
  const keyword = String(q || '').trim();
  if (!keyword) {
    const err = new Error('q query parameter is required');
    err.status = 400;
    throw err;
  }
  return keyword;
};

export const getAnixoSearch = async ({ q, page } = {}) => {
  const keyword = requireQuery(q);
  const normalizedPage = normalizePage(page);

  const { pagination, results } = await queryMediaPage({
    filter: 'search: $search, sort: SEARCH_MATCH, type: ANIME, isAdult: false',
    varDefs: '$search: String',
    variables: { page: normalizedPage, search: keyword },
  });

  return {
    source: `${ANIXO_BASE_URL}/search?keyword=${encodeURIComponent(keyword)}`,
    query: keyword,
    pagination,
    results,
  };
};

const FORMAT_MAP = {
  tv: 'TV',
  movie: 'MOVIE',
  ova: 'OVA',
  ona: 'ONA',
  special: 'SPECIAL',
  music: 'MUSIC',
  tv_short: 'TV_SHORT',
};

const SEASON_MAP = { winter: 'WINTER', spring: 'SPRING', summer: 'SUMMER', fall: 'FALL' };

export const getAnixoSearchAdvanced = async ({ q, type, genres, season, year, status, sort, page } = {}) => {
  const keyword = String(q || '').trim();
  const normalizedPage = normalizePage(page);

  const filters = ['type: ANIME', 'isAdult: false'];
  const varDefs = [];
  const variables = { page: normalizedPage };

  if (keyword) {
    filters.push('search: $search');
    varDefs.push('$search: String');
    variables.search = keyword;
  }

  const format = FORMAT_MAP[String(type || '').toLowerCase()];
  if (format) {
    filters.push('format: $format');
    varDefs.push('$format: MediaFormat');
    variables.format = format;
  }

  const genreList = String(genres || '')
    .split(',')
    .map((g) => g.trim())
    .filter(Boolean)
    .map((g) => g.replace(/\b\w/g, (ch) => ch.toUpperCase()));
  if (genreList.length) {
    filters.push('genre_in: $genres');
    varDefs.push('$genres: [String]');
    variables.genres = genreList;
  }

  const seasonVal = SEASON_MAP[String(season || '').toLowerCase()];
  if (seasonVal) {
    filters.push('season: $season');
    varDefs.push('$season: MediaSeason');
    variables.season = seasonVal;
  }

  if (Number(year) > 0) {
    filters.push('seasonYear: $year');
    varDefs.push('$year: Int');
    variables.year = Number(year);
  }

  // Default sort: keyword search -> relevance, otherwise popularity.
  const sortVal = keyword ? 'SEARCH_MATCH' : 'POPULARITY_DESC';
  filters.push(`sort: ${sortVal}`);

  const { pagination, results } = await queryMediaPage({
    filter: filters.join(', '),
    varDefs: varDefs.join(', '),
    variables,
  });

  return {
    source: `${ANIXO_BASE_URL}/search`,
    query: keyword || null,
    filters: {
      type: format || null,
      genres: genreList,
      season: seasonVal || null,
      year: Number(year) > 0 ? Number(year) : null,
    },
    pagination,
    results,
  };
};

const SUGGESTION_QUERY = `
  query AnixoSuggestion($search: String) {
    Page(page: 1, perPage: 8) {
      media(search: $search, sort: SEARCH_MATCH, type: ANIME, isAdult: false) { ...media }
    }
  }
  fragment media on Media { ${MEDIA_FRAGMENT} }
`;

export const getAnixoSearchSuggestion = async ({ q } = {}) => {
  const keyword = requireQuery(q);
  const data = await anilistQuery(SUGGESTION_QUERY, { search: keyword });

  return {
    query: keyword,
    suggestions: mapMediaList(data?.Page?.media),
  };
};
