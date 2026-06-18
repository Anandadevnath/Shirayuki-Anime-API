import { getHianimeSeasons } from '../scraper/seasons.js';
import { wrapController } from './_cache.js';

export const hianimeSeasonsController = wrapController({
  cacheKey: (c) =>
    `seasons:${c.req.query('title') || c.req.param('animeId') || ''}:${c.req.query('page') || ''}`,
  handler: (c) =>
    getHianimeSeasons({
      title: c.req.query('title'),
      animeId: c.req.param('animeId') || c.req.query('animeId'),
      maxPages: c.req.query('maxPages'),
    }),
});
