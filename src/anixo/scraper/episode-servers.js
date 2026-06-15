import {
  ANIXO_BASE_URL,
  WATCH_SERVERS,
  buildEmbedUrl,
  fetchEmbedDataId,
  parseAnimeEpisodeRef,
} from './_shared.js';

const checkServerAvailability = async (server, animeId, episode, category) => {
  try {
    const embedUrl = buildEmbedUrl(server.route, animeId, episode, category);
    const dataId = await fetchEmbedDataId(embedUrl, `${ANIXO_BASE_URL}/`);
    return Boolean(dataId);
  } catch {
    return false;
  }
};

const getServerAvailability = async (server, animeId, episode) => {
  const [sub, dub] = await Promise.all([
    checkServerAvailability(server, animeId, episode, 'sub'),
    checkServerAvailability(server, animeId, episode, 'dub'),
  ]);

  return {
    name: server.label,
    nameId: server.nameId,
    server: server.id,
    available: { sub, dub },
  };
};

export const getAnixoEpisodeServers = async ({ animeEpisodeId, ep } = {}) => {
  const ref = parseAnimeEpisodeRef(animeEpisodeId, ep);
  if (!ref?.animeId) {
    throw new Error('animeEpisodeId query parameter is required');
  }

  const { animeId, episode } = ref;

  const servers = await Promise.all(
    WATCH_SERVERS.map((server) => getServerAvailability(server, animeId, episode)),
  );

  return {
    source: `${ANIXO_BASE_URL}/watch/${animeId}`,
    animeId: String(animeId),
    episode,
    servers: {
      sub: servers.filter((server) => server.available.sub),
      dub: servers.filter((server) => server.available.dub),
    },
    providers: servers,
  };
};
