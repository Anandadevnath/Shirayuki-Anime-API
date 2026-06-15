import { getAnimexEpisodeSources } from '../scraper/episode-sources.js';

const episodeSourcesCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

// Build an absolute, ready-to-play proxy URL for an m3u8 that needs a referer.
const buildProxyUrl = (c, m3u8, referer) => {
  const url = new URL(c.req.url);
  const origin = `${url.protocol}//${url.host}`;
  return `${origin}/api/v2/animex/proxy?url=${encodeURIComponent(m3u8)}&ref=${encodeURIComponent(referer)}`;
};

const withProxiedSources = (c, data) => ({
  ...data,
  sources: (data.sources || []).map((source) => ({
    ...source,
    proxyM3u8: source.m3u8 ? buildProxyUrl(c, source.m3u8, source.referer) : null,
  })),
});

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

export const animexEpisodeSourcesController = async (c) => {
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
      'animex',
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
        data: withProxiedSources(c, cachedData),
        extractionTimeSec,
      });
    }

    const data = await getAnimexEpisodeSources({ animeEpisodeId, ep, server, category });
    setCachedEpisodeSources(cacheKey, data);

    const extractionTimeSec = Number(((Date.now() - startTime) / 1000).toFixed(3));
    return c.json({
      success: true,
      data: withProxiedSources(c, data),
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
