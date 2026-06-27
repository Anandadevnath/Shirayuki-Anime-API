import { getNyaaCategory, getNyaaCategories } from '../scraper/category.js';
import { wrapController } from './_cache.js';

export const nyaaCategoryController = wrapController({
  cacheKey: (c) =>
    `category:${c.req.query('category') || '1_2'}:${c.req.query('page') || '1'}:${c.req.query('filter') || '0'}:${c.req.query('query') || ''}`,
  handler: (c) =>
    getNyaaCategory({
      category: c.req.query('category'),
      page: c.req.query('page'),
      filter: c.req.query('filter'),
      query: c.req.query('query'),
    }),
});

export const nyaaCategoriesController = wrapController({
  cacheKey: () => 'categories-list',
  handler: () => getNyaaCategories(),
});