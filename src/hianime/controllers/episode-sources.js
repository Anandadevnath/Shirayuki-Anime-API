import { getHianimeEpisodeSources } from '../scraper/episode-sources.js';

// megaplay tokens expire — short cache only.
const sourcesCache = new Map();
const CACHE_TTL_MS = 60 * 1000;

const getCached = (key) => {
  const item = sourcesCache.get(key);
  if (!item) return null;
  if (Date.now() > item.expiresAt) {
    sourcesCache.delete(key);
    return null;
  }
  return item.value;
};
const setCached = (key, value) =>
  sourcesCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });

// Build a dynamic source URL to the built-in player page (/play) for this episode.
const buildPlayUrl = (c, params) => {
  const req = new URL(c.req.url);
  const origin = `${req.protocol}//${req.host}`;
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v) q.set(k, v);
  });
  return `${origin}/api/v2/hianime/play?${q.toString()}`;
};

const withProxiedSources = (c, data, params) => {
  const origin = `${new URL(c.req.url).protocol}//${new URL(c.req.url).host}`;
  const sources = (data.link
    ? [
        {
          url: data.link,
          type: /\.m3u8(\?|$)/i.test(data.link) ? 'm3u8' : 'mp4',
          quality: 'auto',
          proxyM3u8: buildPlayUrl(c, params),
          embeddedUrl: data.link
            ? `${origin}/api/v2/hianime/proxy?url=${encodeURIComponent(data.link)}&ref=${encodeURIComponent('https://megaplay.buzz/')}`
            : null,
        },
      ]
    : []);

  return {
    ...data,
    sources,
  };
};

export const hianimeEpisodeSourcesController = async (c) => {
  try {
    const startTime = Date.now();
    const { episodeId, animeEpisodeId, ep, server, category } = c.req.query();

    if (!episodeId && !animeEpisodeId) {
      return c.json(
        { success: false, error: 'episodeId (or animeEpisodeId + ep) query parameter is required' },
        400,
      );
    }

    const params = { episodeId, animeEpisodeId, ep, server, category };
    const cacheKey = [
      'hianime',
      'episode-sources',
      episodeId || '',
      animeEpisodeId || '',
      ep || '',
      server || '',
      category || '',
    ].join(':');

    const cachedData = getCached(cacheKey);
    if (cachedData) {
      return c.json({ success: true, data: withProxiedSources(c, cachedData, params), extractionTimeSec: 0 });
    }

    const data = await getHianimeEpisodeSources({
      episodeId,
      animeEpisodeId,
      ep,
      server,
      category,
    });
    setCached(cacheKey, data);

    const extractionTimeSec = Number(((Date.now() - startTime) / 1000).toFixed(3));
    return c.json({ success: true, data: withProxiedSources(c, data, params), extractionTimeSec });
  } catch (error) {
    const status = error.status || 500;
    return c.json({ success: false, error: error.message }, status);
  }
};
