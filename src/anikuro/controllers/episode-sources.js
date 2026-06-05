import { getAnikuroEpisodeSources } from '../scraper/episode-sources.js';

const episodeSourcesCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

const getCachedEpisodeSources = (key) => {
  const item = episodeSourcesCache.get(key);
  if (!item) return null;

  if (Date.now() > item.expiresAt) {
    episodeSourcesCache.delete(key);
    return null;
  }

  return item.value;
};

const setCachedEpisodeSources = (key, value) => {
  episodeSourcesCache.set(key, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
};

export const anikuroEpisodeSourcesController = async (c) => {
  try {
    const startTime = Date.now();
    const animeEpisodeId = c.req.query('animeEpisodeId');
    const ep = c.req.query('ep');
    const server = c.req.query('server');
    const category = c.req.query('category');

    if (!animeEpisodeId) {
      return c.json(
        {
          success: false,
          error: 'animeEpisodeId query parameter is required',
        },
        400,
      );
    }

    const cacheKey = [
      'anikuro',
      'episode-sources',
      animeEpisodeId,
      ep || '',
      server || '',
      category || '',
    ].join(':');

    const cachedData = getCachedEpisodeSources(cacheKey);
    if (cachedData) {
      const extractionTimeSec = Number(((Date.now() - startTime) / 1000).toFixed(3));
      return c.json({
        success: true,
        data: cachedData,
        extractionTimeSec,
      });
    }

    const data = await getAnikuroEpisodeSources({ animeEpisodeId, ep, server, category });
    setCachedEpisodeSources(cacheKey, data);

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
