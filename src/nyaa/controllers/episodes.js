import { getNyaaEpisodes } from '../scraper/episodes.js';
import { wrapController } from './_cache.js';

export const nyaaEpisodesController = wrapController({
  cacheKey: (c) => {
    const animeId = c.req.param('animeId') || '';
    const pages = c.req.query('pages') || '3';
    return `nyaa-episodes:${animeId}:${pages}`;
  },
  handler: (c) =>
    getNyaaEpisodes({
      animeId: c.req.param('animeId'),
      maxPages: c.req.query('pages'),
    }),
});
