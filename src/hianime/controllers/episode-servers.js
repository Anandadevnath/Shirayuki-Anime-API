import { getHianimeEpisodeServers } from '../scraper/episode-servers.js';
import { wrapController } from './_cache.js';

export const hianimeEpisodeServersController = wrapController({
  cacheKey: (c) =>
    `episode-servers:${c.req.query('animeEpisodeId') || ''}:${c.req.query('ep') || ''}`,
  handler: (c) =>
    getHianimeEpisodeServers({
      animeEpisodeId: c.req.query('animeEpisodeId'),
      ep: c.req.query('ep'),
    }),
});
