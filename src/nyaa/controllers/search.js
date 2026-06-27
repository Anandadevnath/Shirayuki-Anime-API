import { getNyaaSearch } from '../scraper/search.js';
import { wrapController } from './_cache.js';

export const nyaaSearchController = wrapController({
  cacheKey: (c) =>
    `search:${c.req.query('q') || ''}:${c.req.query('page') || '1'}:${c.req.query('category') || '1_2'}:${c.req.query('filter') || '0'}:${c.req.query('sort') || ''}:${c.req.query('order') || ''}`,
  handler: (c) =>
    getNyaaSearch({
      q: c.req.query('q'),
      page: c.req.query('page'),
      category: c.req.query('category'),
      filter: c.req.query('filter'),
      sort: c.req.query('sort'),
      order: c.req.query('order'),
    }),
});