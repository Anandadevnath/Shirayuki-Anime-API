import { getHianimeEpisodeServers } from '../scraper/episode-servers.js';

// link-ids expire quickly — short cache only.
const episodeServersCache = new Map();
const CACHE_TTL_MS = 60 * 1000;

const getCached = (key) => {
  const item = episodeServersCache.get(key);
  if (!item) return null;
  if (Date.now() > item.expiresAt) {
    episodeServersCache.delete(key);
    return null;
  }
  return item.value;
};
const setCached = (key, value) =>
  episodeServersCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });

export const hianimeEpisodeServersController = async (c) => {
  try {
    const startTime = Date.now();
    const episodeId = c.req.query('episodeId');
    const animeEpisodeId = c.req.query('animeEpisodeId');
    const ep = c.req.query('ep');

    if (!episodeId && !animeEpisodeId) {
      return c.json(
        { success: false, error: 'episodeId (or animeEpisodeId + ep) query parameter is required' },
        400,
      );
    }

    const cacheKey = ['hianime', 'episode-servers', episodeId || '', animeEpisodeId || '', ep || ''].join(':');
    const cachedData = getCached(cacheKey);
    if (cachedData) {
      return c.json({ success: true, data: cachedData, extractionTimeSec: 0 });
    }

    const data = await getHianimeEpisodeServers({ episodeId, animeEpisodeId, ep });
    // The scraper returns `servers` for internal use (sources resolution); strip
    // it from the public response so this endpoint no longer exposes the server list.
    if (data && data.servers) delete data.servers;
    setCached(cacheKey, data);

    const extractionTimeSec = Number(((Date.now() - startTime) / 1000).toFixed(3));
    return c.json({ success: true, data, extractionTimeSec });
  } catch (error) {
    const status = error.status || 500;
    return c.json({ success: false, error: error.message }, status);
  }
};
