import { getHianimeAnimeDetails } from '../scraper/anime.js';
import { wrapController } from './_cache.js';

export const hianimeAnimeController = wrapController({
  cacheKey: (c) => `anime:${c.req.param('animeId') || ''}`,
  handler: (c) => getHianimeAnimeDetails({ animeId: c.req.param('animeId') }),
});
