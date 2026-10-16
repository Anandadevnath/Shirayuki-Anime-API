import { REANIME_BASE_URL, flixGet, normalizeCategory } from '../_shared.js';
import { fetchReanimeAnime } from './anime.js';

// Server list for one episode via reanime's flix resolver:
//   GET /api/flix/{anilistId}/{ep}?mal={malId}
// -> { success, servers: [{ serverName, dataLink, dataType, softsub, ... }] }
//
// NOTE: `dataLink` points at a flixcloud embed page, not a direct m3u8. The real
// HLS URL is minted by that player for the *requesting browser's IP* (a signed
// token), so it cannot be proxied server-side like the other providers — this
// endpoint returns the server list + embed links only.
export const getReanimeEpisodeServers = async ({ animeId, ep } = {}) => {
  const { details, anilistId, malId } = await fetchReanimeAnime(animeId);

  if (!anilistId) {
    const err = new Error('anilist id is required to resolve servers for this anime');
    err.status = 422;
    throw err;
  }

  const episodeNumber = Number(ep) > 0 ? Number(ep) : 1;
  const data = await flixGet(anilistId, episodeNumber, malId);

  if (!data?.success || !data?.servers?.length) {
    const err = new Error(data?.error || `No servers found for episode ${episodeNumber}`);
    err.status = 404;
    throw err;
  }

  const servers = (data?.servers || []).map((s) => ({
    id: s.$id || null,
    name: s.serverName || null,
    category: normalizeCategory(s.dataType),
    embedUrl: s.dataLink || null,
    softsub: Boolean(s.softsub),
    continue: Boolean(s.continue),
  }));

  const sub = servers.filter((s) => s.category === 'sub');
  const dub = servers.filter((s) => s.category === 'dub');

  return {
    source: `${REANIME_BASE_URL}/api/flix/${anilistId}/${episodeNumber}${malId ? `?mal=${malId}` : ''}`,
    animeId: details.animeId,
    anilistId,
    malId,
    episode: episodeNumber,
    servers: {
      sub,
      dub,
      all: servers,
    },
  };
};
