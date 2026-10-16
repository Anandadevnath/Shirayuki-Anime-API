import { getReanimeEpisodeSources } from '../scraper/episode-sources.js';
import { getRequestOrigin } from '../../utils/request-origin.js';

// Sources resolve a real server-side m3u8 per (server, ep); a short cache avoids
// repeated upstream flixcloud hits for the same request.
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

export const reanimeEpisodeSourcesController = async (c) => {
  try {
    const startTime = Date.now();
    const animeId = c.req.query('animeId') || c.req.query('animeEpisodeId');
    const ep = c.req.query('ep');
    const server = c.req.query('server');
    const category = c.req.query('category');

    if (!animeId) {
      return c.json(
        { success: false, error: 'animeId query parameter is required (e.g. naruto-bjfend)' },
        400,
      );
    }

    const cacheKey = ['reanime', 'episode-sources', animeId, ep || '', server || '', category || ''].join(':');
    const cached = getCached(cacheKey);
    if (cached) {
      return c.json({ success: true, data: cached, extractionTimeSec: 0 });
    }

    const data = await getReanimeEpisodeSources({
      animeId,
      ep,
      server,
      category,
      origin: getRequestOrigin(c),
    });
    setCached(cacheKey, data);

    const extractionTimeSec = Number(((Date.now() - startTime) / 1000).toFixed(3));
    return c.json({ success: true, data, extractionTimeSec });
  } catch (error) {
    const status = error.status || (error.response ? 502 : 500);
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ success: false, error: message }, status);
  }
};
