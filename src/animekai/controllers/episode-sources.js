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

// Build a dynamic source URL to the built-in player page (/play) for this episode.
const buildPlayUrl = (c, animeEpisodeId, ep, server, category) => {
  const req = new URL(c.req.url);
  const origin = `${req.protocol}//${req.host}`;
  const params = `animeEpisodeId=${encodeURIComponent(animeEpisodeId || '')}&ep=${encodeURIComponent(ep || '')}&server=${encodeURIComponent(server || '')}&category=${encodeURIComponent(category || '')}`;
  return `${origin}/api/v2/animekai/play?${params}`;
};

const withProxiedSources = (c, data, { animeEpisodeId, ep, server, category } = {}) => {
  const origin = `${new URL(c.req.url).protocol}//${new URL(c.req.url).host}`;
  const sources = (data.sources || []).map((source) => ({
    ...source,
    proxyM3u8: buildPlayUrl(c, animeEpisodeId, ep, server, category),
    embeddedUrl: source.url
      ? `${origin}/api/v2/animekai/proxy?url=${encodeURIComponent(source.url)}&ref=${encodeURIComponent(source.referer || 'https://megavid.buzz/')}`
      : null,
  }));
  return {
    ...data,
    sources,
  };
};

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
        data: withProxiedSources(c, cachedData, { animeEpisodeId, ep, server, category }),
        extractionTimeSec,
      });
    }

    const data = await getAnimeKaiEpisodeSources({ animeEpisodeId, ep, server, category });
    setCachedSources(cacheKey, data);

    const extractionTimeSec = Number(((Date.now() - startTime) / 1000).toFixed(3));
    return c.json({
      success: true,
      data: withProxiedSources(c, data, { animeEpisodeId, ep, server, category }),
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
