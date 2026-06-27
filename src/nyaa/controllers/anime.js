import { getNyaaAnimeDetails } from '../scraper/anime.js';
import { wrapController } from './_cache.js';

export const nyaaAnimeController = wrapController({
  cacheKey: (c) => `anime:${c.req.param('id') || ''}`,
  handler: (c) => getNyaaAnimeDetails({ torrentId: c.req.param('id') }),
});