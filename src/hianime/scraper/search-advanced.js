import { fetchPage, extractFlwItems, extractPagination } from './_shared.js';

const TYPE_MAP = {
  movie: 2,
  music: 6,
  ona: 4,
  ova: 3,
  special: 5,
  tv: 1,
  tv_short: 7,
  tvshort: 7,
};

const STATUS_MAP = {
  airing: 1,
  finished: 2,
  upcoming: 3,
  paused: 4,
  cancelled: 5,
  unknown: 6,
};

const SEASON_MAP = {
  spring: 1,
  summer: 2,
  fall: 3,
  winter: 4,
};

const LANGUAGE_MAP = {
  sub: 1,
  dub: 2,
  sub_dub: 3,
};

const SORT_MAP = {
  default: 'default',
  recently_updated: 'recently_updated',
  recently_added: 'recently_added',
  release_date: 'release_date',
  score: 'score',
  name_az: 'name_az',
  popularity: 'popularity',
  most_watched: 'most_watched',
};

const splitCsv = (val) =>
  String(val || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

const mapSlugs = (slugs, dictionary) =>
  slugs
    .map((slug) => dictionary[slug])
    .filter((v) => v !== undefined && v !== null);

export const getHianimeAdvancedSearch = async (filters = {}) => {
  const {
    q,
    page,
    type,
    status,
    season,
    language,
    sort,
    year,
    genres,
    score,
  } = filters;

  const normalizedPage = Number(page) > 0 ? Number(page) : 1;
  const params = { page: normalizedPage };

  if (q && String(q).trim()) params.keyword = String(q).trim();

  const types = mapSlugs(splitCsv(type), TYPE_MAP);
  if (types.length) params['type[]'] = types;

  const statuses = mapSlugs(splitCsv(status), STATUS_MAP);
  if (statuses.length) params['status[]'] = statuses;

  const seasons = mapSlugs(splitCsv(season), SEASON_MAP);
  if (seasons.length) params['season[]'] = seasons;

  const languages = mapSlugs(splitCsv(language), LANGUAGE_MAP);
  if (languages.length) params['language[]'] = languages;

  const genreList = splitCsv(genres);
  if (genreList.length) params['genre[]'] = genreList;

  const yearList = splitCsv(year).filter((y) => /^\d{4}$/.test(y));
  if (yearList.length) params['year[]'] = yearList;

  if (score && Number(score) > 0) params.score = Number(score);
  if (sort && SORT_MAP[String(sort).toLowerCase()]) {
    params.sort = SORT_MAP[String(sort).toLowerCase()];
  }

  const { url, $ } = await fetchPage('/filter', {
    searchParams: params,
    referer: 'https://hianime.ad/',
  });

  return {
    source: url,
    filters: {
      q: params.keyword || null,
      type: splitCsv(type),
      status: splitCsv(status),
      season: splitCsv(season),
      language: splitCsv(language),
      sort: sort || null,
      genres: genreList,
      year: yearList,
      score: score ? Number(score) : null,
    },
    pagination: extractPagination($),
    results: extractFlwItems($),
  };
};
