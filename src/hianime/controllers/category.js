import { getHianimeCategory } from '../scraper/category.js';
import { wrapController } from './_cache.js';

export const hianimeCategoryController = wrapController({
  cacheKey: (c) => `category:${c.req.param('category') || ''}:${c.req.query('page') || '1'}`,
  handler: (c) =>
    getHianimeCategory({ category: c.req.param('category'), page: c.req.query('page') }),
});
