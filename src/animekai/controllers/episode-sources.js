import { getAnimeKaiEpisodeSources } from '../scraper/episode-sources.js';

// link-ids + m3u8 tokens expire, so only cache for a very short window.
const sourcesCache = new Map();
const CACHE_TTL_MS = 60 * 1000;

const getCachedSources = (key) => {
  const item = sourcesCache.get(key);
  if (!item) return null;

  if (Date.now() > item.expiresAt) {
    sourcesCache.delete(key);
    return null;
  }

  return item.value;
};

const setCachedSources = (key, value) => {
  sourcesCache.set(key, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
};

// Build an absolute, ready-to-play proxy URL for an m3u8 that needs a referer.
const buildProxyUrl = (c, url, referer) => {
  const req = new URL(c.req.url);
  const origin = `${req.protocol}//${req.host}`;
  return `${origin}/api/v2/animekai/proxy?url=${encodeURIComponent(url)}&ref=${encodeURIComponent(referer)}`;
};

const withProxiedSources = (c, data) => ({
  ...data,
  sources: (data.sources || []).map((source) => ({
    ...source,
    proxyM3u8: source.url ? buildProxyUrl(c, source.url, source.referer) : null,
  })),
});

export const animekaiEpisodeSourcesController = async (c) => {
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
      'animekai',
      'episode-sources',
      animeEpisodeId,
      ep || '',
      server || '',
      category || '',
    ].join(':');

    const cachedData = getCachedSources(cacheKey);
    if (cachedData) {
      const extractionTimeSec = Number(((Date.now() - startTime) / 1000).toFixed(3));
      return c.json({
        success: true,
        data: withProxiedSources(c, cachedData),
        extractionTimeSec,
      });
    }

    const data = await getAnimeKaiEpisodeSources({ animeEpisodeId, ep, server, category });
    setCachedSources(cacheKey, data);

    const extractionTimeSec = Number(((Date.now() - startTime) / 1000).toFixed(3));
    return c.json({
      success: true,
      data: withProxiedSources(c, data),
      extractionTimeSec,
    });
  } catch (error) {
    const status = error.status || 500;
    return c.json(
      {
        success: false,
        error: error.message,
      },
      status,
    );
  }
};
