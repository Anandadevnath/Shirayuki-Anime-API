import { getNyaaEpisodeServers } from '../scraper/episode-servers.js';

// The scraper caches ranked results for 5 minutes per anime/episode.
export const nyaaEpisodeServersController = async (c) => {
  try {
    const startTime = Date.now();
    const { episodeId, animeEpisodeId, animeId, ep } = c.req.query();
    const data = await getNyaaEpisodeServers({ episodeId, animeEpisodeId: animeEpisodeId || animeId, ep });
    const extractionTimeSec = Number(((Date.now() - startTime) / 1000).toFixed(3));
    return c.json({ success: true, data, extractionTimeSec });
  } catch (error) {
    const status = error.status || 500;
    return c.json({ success: false, error: error.message }, status);
  }
};
