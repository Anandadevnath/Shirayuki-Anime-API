import { getHianimeSearch } from '../scraper/search.js';
import { wrapController } from './_cache.js';

export const hianimeSearchController = wrapController({
  cacheKey: (c) => `search:${c.req.query('q') || ''}:${c.req.query('page') || '1'}`,
  handler: (c) => getHianimeSearch({ q: c.req.query('q'), page: c.req.query('page') }),
});
