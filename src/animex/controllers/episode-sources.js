import { getAnimexEpisodeSources } from '../scraper/episode-sources.js';
import { getRequestOrigin } from '../../utils/request-origin.js';

// Provider streams expire quickly — short cache only.
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

const buildPlayUrl = (c, params) => {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v) q.set(k, v);
  });
  return `${getRequestOrigin(c)}/api/v2/animex/play?${q.toString()}`;
};

const withProxiedSources = (c, data, params) => {
  const requestOrigin = getRequestOrigin(c);
  const sources = data.link
    ? [
        {
          url: data.link,
          type: data.type || (/\.m3u8(\?|$)/i.test(data.link) ? 'm3u8' : 'mp4'),
          quality: data.quality || 'auto',
          referer: data.referer || 'https://animex.one/',
          origin: data.origin || null,
          proxyM3u8: buildPlayUrl(c, params),
          embeddedUrl: data.link
            ? `${requestOrigin}/api/v2/animex/proxy?url=${encodeURIComponent(data.link)}&ref=${encodeURIComponent(
                data.referer || 'https://animex.one/',
              )}${data.origin ? `&orig=${encodeURIComponent(data.origin)}` : ''}`
            : null,
        },
      ]
    : [];

  return {
    ...data,
    sources,
  };
};

export const animexEpisodeSourcesController = async (c) => {
  try {
    const startTime = Date.now();
    // Accept both the animex-native `animeId` and the shared/play-page alias
    // `animeEpisodeId` so proxyM3u8 (/api/v2/animex/play) works out of the box.
    const animeId = c.req.query('animeId') || c.req.query('animeEpisodeId');
    const ep = c.req.query('ep');
    const server = c.req.query('server');
    const category = c.req.query('category');

    if (!animeId) {
      return c.json(
        { success: false, error: 'animeId query parameter is required (e.g. naruto-20)' },
        400,
      );
    }

    const params = { animeId, ep, server, category };
    const cacheKey = [
      'animex',
      'episode-sources',
      animeId || '',
      ep || '',
      server || '',
      category || '',
    ].join(':');

    const cached = getCached(cacheKey);
    if (cached) {
      return c.json({ success: true, data: withProxiedSources(c, cached, params), extractionTimeSec: 0 });
    }

    const data = await getAnimexEpisodeSources({ animeId, ep, server, category });
    setCached(cacheKey, data);

    const extractionTimeSec = Number(((Date.now() - startTime) / 1000).toFixed(3));
    return c.json({ success: true, data: withProxiedSources(c, data, params), extractionTimeSec });
  } catch (error) {
    const status = error.status || 500;
    return c.json({ success: false, error: error.message }, status);
  }
};
