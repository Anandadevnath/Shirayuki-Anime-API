import { getNyaaEpisodeServers } from '../scraper/episode-servers.js';
import { pickServer } from '../scraper/episode-sources.js';
import { INFO_HASH_RE } from '../scraper/stream-token.js';
import { WEBTOR_BASE_URL } from '../_shared.js';

// Redirect to the best (or the requested `server` hash-prefix) release on webtor.io.
export const nyaaPlayController = async (c) => {
  try {
    const { episodeId, animeEpisodeId, animeId, ep, server, category } = c.req.query();
    const data = await getNyaaEpisodeServers({ episodeId, animeEpisodeId: animeEpisodeId || animeId, ep });
    const chosen = pickServer(data.servers, { server, category: category === 'dub' ? 'dub' : 'sub' });
    // The hash comes from Nyaa's feed; only a plain hex hash may become a redirect path.
    if (!INFO_HASH_RE.test(chosen.infoHash)) {
      return c.json({ success: false, error: 'Invalid torrent hash from Nyaa' }, 502);
    }
    return c.redirect(`${WEBTOR_BASE_URL}/${chosen.infoHash}`, 302);
  } catch (error) {
    return c.json({ success: false, error: error.message }, error.status || 500);
  }
};
