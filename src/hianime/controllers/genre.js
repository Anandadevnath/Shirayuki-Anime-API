import { getHianimeGenre } from '../scraper/genre.js';
import { wrapController } from './_cache.js';

export const hianimeGenreController = wrapController({
  cacheKey: (c) => `genre:${c.req.param('genre') || ''}:${c.req.query('page') || '1'}`,
  handler: (c) => getHianimeGenre({ genre: c.req.param('genre'), page: c.req.query('page') }),
});
