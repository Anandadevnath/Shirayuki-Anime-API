import { getHianimeEpisodes } from '../scraper/episodes.js';
import { wrapController } from './_cache.js';

export const hianimeEpisodesController = wrapController({
  cacheKey: (c) => `episodes:${c.req.param('animeId') || ''}`,
  handler: (c) => getHianimeEpisodes({ animeId: c.req.param('animeId') }),
});
