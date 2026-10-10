import { getHianimeEpisodeServers } from './episode-servers.js';
import { resolveMegaplay } from './megaplay.js';
import { normalizeCategory, normalizeServerName } from './_shared.js';

export const getHianimeEpisodeSources = async ({ episodeId, animeEpisodeId, ep, server, category } = {}) => {
  const normalizedCategory = normalizeCategory(category);
  const targetServer = normalizeServerName(server);

  const serverData = await getHianimeEpisodeServers({ episodeId, animeEpisodeId, ep });
  const pools = serverData.servers;

  // Pick the requested category; fall back to whichever has servers.
  let cat = normalizedCategory;
  let pool = pools[cat] || [];
  if (!pool.length && cat === 'sub' && pools.dub.length) {
    cat = 'dub';
    pool = pools.dub;
  } else if (!pool.length && cat === 'dub' && pools.sub.length) {
    cat = 'sub';
    pool = pools.sub;
  }

  const selected =
    pool.find((s) => s.serverId === targetServer || s.serverId === targetServer.replace(/-/g, '')) ||
    pool[0];

  const base = {
    source: serverData.source,
    episodeId: serverData.episodeId,
    category: cat,
    server: selected?.name || null,
    embed: selected?.embed || null,
    streamResolved: false,
    reason: null,
    note: null,
    link: null,
    tracks: [],
    intro: null,
    outro: null,
    servers: serverData.servers,
  };

  if (!selected?.hash) {
    return { ...base, reason: 'resolution-failed', note: 'No usable server selected' };
  }

  try {
    const resolved = await resolveMegaplay(selected.hash);
    return {
      ...base,
      streamResolved: true,
      link: resolved.link,
      tracks: resolved.tracks || [],
      intro: resolved.intro,
      outro: resolved.outro,
    };
  } catch (error) {
    // The server list is still useful — degrade instead of failing outright.
    return {
      ...base,
      reason: 'resolution-failed',
      note: error.message,
    };
  }
};
