import { getNyaaEpisodeSources } from '../scraper/episode-sources.js';
import { createRateLimiter } from './_rate-limit.js';
import { buildProxyUrl } from '../scraper/proxy.js';
import { getRequestOrigin } from '../../utils/request-origin.js';

const SOURCES_PER_MINUTE = 20;
const checkRate = createRateLimiter(SOURCES_PER_MINUTE);

// Not cached: every response carries a freshly signed stream token and a
// worker prewarm call. Torrent lookup itself is cached in the scraper.
export const nyaaEpisodeSourcesController = async (c) => {
  const rate = checkRate(c);
  if (!rate.allowed) {
    c.header('Retry-After', String(rate.retryAfterSec));
    return c.json({ success: false, error: 'Too many stream requests, slow down' }, 429);
  }
  try {
    const startTime = Date.now();
    const { episodeId, animeEpisodeId, animeId, ep, server, category } = c.req.query();
    const params = { episodeId, animeEpisodeId: animeEpisodeId || animeId, ep, server, category };
    const data = await getNyaaEpisodeSources(params);
    const apiOrigin = getRequestOrigin(c);
    const sources = data.sources.map((s) => ({ ...s, proxyM3u8: buildProxyUrl(apiOrigin, s.url) }));
    const extractionTimeSec = Number(((Date.now() - startTime) / 1000).toFixed(3));
    return c.json({ success: true, data: { ...data, sources }, extractionTimeSec });
  } catch (error) {
    const status = error.status || 500;
    return c.json({ success: false, error: error.message }, status);
  }
};
