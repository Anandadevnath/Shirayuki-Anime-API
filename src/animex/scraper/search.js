import {
  ANIMEX_BASE_URL,
  graphqlPost,
} from '../_shared.js';
import { getAnimexCatalog } from './home.js';

// Keyword search over the site's own catalogAnime GraphQL (the same call the
// client-side FastSearch widget issues with filter.query).
export const getAnimexSearch = async ({ q, page } = {}) => {
  const keyword = String(q || '').trim();
  if (!keyword) {
    const err = new Error('q query parameter is required');
    err.status = 400;
    throw err;
  }

  const normalizedPage = Math.max(1, Number(page) || 1);
  return getAnimexCatalog({
    sort: 'popular',
    page: normalizedPage,
    perPage: 24,
    filter: { query: keyword },
  });
};

// No dedicated autocomplete endpoint — reuse catalogAnime with a small limit.
export const getAnimexSearchSuggestion = async ({ q } = {}) => {
  const keyword = String(q || '').trim();
  if (!keyword) {
    const err = new Error('q query parameter is required');
    err.status = 400;
    throw err;
  }

  const catalog = await getAnimexCatalog({
    sort: 'popular',
    perPage: 10,
    filter: { query: keyword },
  });

  return {
    query: keyword,
    suggestions: catalog.results.map((it) => ({
      id: it.id,
      anilistId: it.anilistId,
      title: it.title,
      jname: it.jname,
      poster: it.poster,
      url: it.url,
      type: it.type,
      episodes: it.episodes,
    })),
  };
};
