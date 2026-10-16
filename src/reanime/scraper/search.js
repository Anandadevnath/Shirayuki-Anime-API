import { REANIME_BASE_URL, apiGet, mapAnimeCard } from '../_shared.js';

// Filter params the reanime search API actually honors. Verified against the
// live API: `format`, `season`, `status` and `year` change the result set;
// `sort`, `type` and a bare `genre` (without a keyword) are ignored upstream.
const FILTER_KEYS = ['format', 'season', 'status', 'year', 'genre'];

const pickFilters = (source = {}) => {
  const out = {};
  for (const key of FILTER_KEYS) {
    const value = source[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      out[key] = String(value).trim();
    }
  }
  return out;
};

// Shared search engine. `q` empty => upstream matches the whole catalog (q="*").
// Filters are passed through; only the honored keys are forwarded.
export const searchReanime = async ({ q, page, perPage = 20, filters = {} } = {}) => {
  const keyword = String(q || '').trim();
  const normalizedPage = Math.max(1, Number(page) || 1);
  const limit = Math.min(50, Math.max(1, Number(perPage) || 20));
  const offset = (normalizedPage - 1) * limit;

  const params = {
    q: keyword,
    limit,
    offset,
    ...pickFilters(filters),
  };

  const data = await apiGet('/search', params);

  const results = (data?.results || []).map(mapAnimeCard);
  const apiOffset = data?.offset ?? offset;
  const total = data?.total ?? results.length;

  return {
    source: `${REANIME_BASE_URL}/api/v1/search`,
    query: data?.query || keyword || '*',
    filters: params,
    pagination: {
      currentPage: normalizedPage,
      perPage: limit,
      offset: apiOffset,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      hasNextPage: apiOffset + results.length < total,
      hasPreviousPage: normalizedPage > 1,
    },
    results,
  };
};

// Keyword search. `q` is optional: with no keyword the API matches the whole
// catalog (its own q="*"), so this also powers the catalog/browse endpoint.
export const getReanimeSearch = (options = {}) => searchReanime(options);

// Autocomplete-style suggestion (small limit).
export const getReanimeSearchSuggestion = async ({ q } = {}) => {
  const keyword = String(q || '').trim();
  if (!keyword) {
    const err = new Error('q query parameter is required');
    err.status = 400;
    throw err;
  }

  const data = await apiGet('/search', { q: keyword, limit: 10, offset: 0 });

  return {
    query: keyword,
    suggestions: (data?.results || []).map((item) => {
      const card = mapAnimeCard(item);
      return {
        id: card.id,
        anilistId: card.anilistId,
        title: card.title,
        jname: card.jname,
        poster: card.poster,
        url: card.url,
        type: card.type,
        episodes: card.episodes,
      };
    }),
  };
};

// Full-catalog browse with optional filters (mirrors the site's /search page,
// which is the only browse surface — there is no separate /genre or /browse
// page upstream).
export const getReanimeCatalog = async ({ page, perPage, ...filters } = {}) =>
  searchReanime({ q: '', page, perPage, filters });

// Genre listing. Upstream only applies `genre` when a real keyword is present,
// so a genre browse defaults to a broad keyword ("*") match on the catalog plus
// the genre filter. Callers may pass `q` to narrow further.
export const getReanimeGenre = async ({ genre, page, perPage } = {}) => {
  const name = String(genre || '').trim();
  if (!name) {
    const err = new Error('genre path parameter is required');
    err.status = 400;
    throw err;
  }
  return searchReanime({ q: '', page, perPage, filters: { genre: name } });
};
