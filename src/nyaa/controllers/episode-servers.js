import { getNyaaEpisodeServers } from '../scraper/episode-servers.js';
import { wrapController } from './_cache.js';

export const nyaaEpisodeServersController = wrapController({
  cacheKey: (c) => `episode-servers:${c.req.query('torrentId') || ''}`,
  handler: (c) => getNyaaEpisodeServers({ torrentId: c.req.query('torrentId') }),
});