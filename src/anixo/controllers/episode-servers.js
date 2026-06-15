import { getAnixoEpisodeServers } from '../scraper/episode-servers.js';

const episodeServersCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

const getCachedEpisodeServers = (key) => {
  const item = episodeServersCache.get(key);
  if (!item) return null;

  if (Date.now() > item.expiresAt) {
    episodeServersCache.delete(key);
    return null;
  }

  return item.value;
};

const setCachedEpisodeServers = (key, value) => {
  episodeServersCache.set(key, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
};

export const anixoEpisodeServersController = async (c) => {
  try {
    const startTime = Date.now();
    const animeEpisodeId = c.req.query('animeEpisodeId');
    const ep = c.req.query('ep');

    if (!animeEpisodeId) {
      return c.json(
        {
          success: false,
          error: 'animeEpisodeId query parameter is required',
        },
        400,
      );
    }

    const cacheKey = ['anixo', 'episode-servers', animeEpisodeId, ep || ''].join(':');
    const cachedData = getCachedEpisodeServers(cacheKey);
    if (cachedData) {
      const extractionTimeSec = Number(((Date.now() - startTime) / 1000).toFixed(3));
      return c.json({
        success: true,
        data: cachedData,
        extractionTimeSec,
      });
    }

    const data = await getAnixoEpisodeServers({ animeEpisodeId, ep });
    setCachedEpisodeServers(cacheKey, data);

    const extractionTimeSec = Number(((Date.now() - startTime) / 1000).toFixed(3));
    return c.json({
      success: true,
      data,
      extractionTimeSec,
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: error.message,
      },
      500,
    );
  }
};
