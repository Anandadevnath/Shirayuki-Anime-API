import {
  ANIMEX_BASE_URL,
  ANIMEX_PP_BASE_URL,
  CDN_REFERER,
  DEFAULT_UA,
} from '../_shared.js';
import { fetchAnimeInfo } from './anime.js';
import { axios } from '../../utils/scrapper-deps.js';

// Map the /rest/api/servers response to the shared { sub, dub } pools.
const mapProviders = (providers = []) =>
  providers.map((p) => ({
    id: p.id || null,
    name: p.id ? p.id.charAt(0).toUpperCase() + p.id.slice(1) : null,
    tip: p.tip || null,
    default: Boolean(p.default),
  }));

// Server list for one episode. Resolves the internal catalog id from the
// public anime id first (pp.animex.one only understands internal ids).
export const getAnimexEpisodeServers = async ({ animeId, ep } = {}) => {
  const clean = String(animeId || '').trim();
  if (!clean) {
    const err = new Error('animeId query parameter is required (e.g. naruto-20)');
    err.status = 400;
    throw err;
  }

  const { details } = await fetchAnimeInfo(clean);
  const episodeNumber = Number(ep) > 0 ? Number(ep) : 1;

  const { data } = await axios.get(`${ANIMEX_PP_BASE_URL}/rest/api/servers`, {
    proxy: false,
    timeout: 20000,
    params: { id: details.animeId, epNum: episodeNumber },
    headers: {
      'User-Agent': DEFAULT_UA,
      Accept: 'application/json, */*',
      Origin: ANIMEX_BASE_URL,
      Referer: CDN_REFERER,
    },
  });

  if (data?.error) {
    const err = new Error(data.error);
    err.status = 404;
    throw err;
  }

  return {
    source: `${ANIMEX_PP_BASE_URL}/rest/api/servers?id=${details.animeId}&epNum=${episodeNumber}`,
    animeId: details.publicId,
    internalId: details.animeId,
    episode: episodeNumber,
    servers: {
      sub: (data.subProviders || []).map((p) => ({ ...p, category: 'sub' })),
      dub: (data.dubProviders || []).map((p) => ({ ...p, category: 'dub' })),
    },
  };
};
