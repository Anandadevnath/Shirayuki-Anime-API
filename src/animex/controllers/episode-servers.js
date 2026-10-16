import { getAnimexEpisodeServers } from '../scraper/episode-servers.js';

// Server lists rotate per episode — short cache only.
const cache = new Map();
const CACHE_TTL_MS = 60 * 1000;

const getCached = (key) => {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() > item.expiresAt) {
    cache.delete(key);
    return null;
  }
  return item.value;
};

const setCached = (key, value) =>
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });

export const animexEpisodeServersController = async (c) => {
  try {
    const startTime = Date.now();
    const animeId = c.req.query('animeId') || c.req.query('animeEpisodeId');
    const ep = c.req.query('ep');

    if (!animeId) {
      return c.json(
        { success: false, error: 'animeId query parameter is required (e.g. naruto-20)' },
        400,
      );
    }

    const cacheKey = ['animex', 'episode-servers', animeId, ep || ''].join(':');
    const cached = getCached(cacheKey);
    if (cached) {
      return c.json({ success: true, data: cached, extractionTimeSec: 0 });
    }

    const data = await getAnimexEpisodeServers({ animeId, ep });
    setCached(cacheKey, data);

    const extractionTimeSec = Number(((Date.now() - startTime) / 1000).toFixed(3));
    return c.json({ success: true, data, extractionTimeSec });
  } catch (error) {
    const status = error.status || 500;
    return c.json({ success: false, error: error.message }, status);
  }
};
