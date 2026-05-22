import { getHianimeAdvancedSearch } from '../scraper/search-advanced.js';
import { wrapController } from './_cache.js';

export const hianimeSearchAdvancedController = wrapController({
  cacheKey: (c) => {
    const url = new URL(c.req.url);
    return `search-advanced:${url.searchParams.toString()}`;
  },
  handler: (c) => {
    const filters = {
      q: c.req.query('q'),
      page: c.req.query('page'),
      type: c.req.query('type'),
      status: c.req.query('status'),
      season: c.req.query('season'),
      language: c.req.query('language'),
      sort: c.req.query('sort'),
      year: c.req.query('year'),
      genres: c.req.query('genres'),
      score: c.req.query('score'),
    };
    return getHianimeAdvancedSearch(filters);
  },
});
