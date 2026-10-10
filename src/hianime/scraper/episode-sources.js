import { getHianimeEpisodeServers } from './episode-servers.js';
import { resolveMegaplay, decodeServerHash as decodeMegaplayHash } from './megaplay.js';
import { resolveVidplay, decodeServerHash as decodeVidplayHash } from './vidplay.js';
import { normalizeCategory, normalizeServerName } from './_shared.js';

// Hosts that resolve through the megaplay (getSources) flow.
const MEGAPLAY_EMBED_RE = /(?:bibiemb|vivibebe|megaplay|megacloud|vidcloud|ncdn|mcloud)/i;
// Anything else (otakuhg, otakuvid, playmogo, ...) goes through the vidplay flow.
const isMegaplayEmbed = (embed) => /^https?:\/\//i.test(embed || '') && MEGAPLAY_EMBED_RE.test(embed);

const tryResolve = async (server) => {
  if (!server?.hash) throw new Error('server has no hash to resolve');
  const embed = decodeMegaplayHash(server.hash) || decodeVidplayHash(server.hash);
  if (isMegaplayEmbed(embed)) return resolveMegaplay(server.hash);
  return resolveVidplay(server.hash);
};

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

  // Order the servers: requested one first, then the rest in list order, so a
  // dead server doesn't block playback.
  const isMatch = (s) => s.serverId === targetServer || s.serverId === targetServer.replace(/-/g, '');
  const ordered = [...pool.filter(isMatch), ...pool.filter((s) => !isMatch(s))];

  const base = {
    source: serverData.source,
    episodeId: serverData.episodeId,
    category: cat,
    server: null,
    embed: null,
    streamResolved: false,
    reason: null,
    note: null,
    link: null,
    tracks: [],
    intro: null,
    outro: null,
    servers: serverData.servers,
  };

  if (!ordered.length) {
    return { ...base, reason: 'resolution-failed', note: 'No usable server selected' };
  }

  let lastError = null;
  for (const candidate of ordered) {
    try {
      const resolved = await tryResolve(candidate);
      return {
        ...base,
        server: candidate.name,
        embed: candidate.embed || resolved.embed || null,
        streamResolved: true,
        link: resolved.link,
        tracks: resolved.tracks || [],
        intro: resolved.intro,
        outro: resolved.outro,
      };
    } catch (error) {
      lastError = error;
      // keep trying the next server
    }
  }

  // Every server in the category failed — degrade instead of dying.
  return {
    ...base,
    server: ordered[0]?.name || null,
    embed: ordered[0]?.embed || null,
    reason: 'resolution-failed',
    note: lastError?.message || 'all servers failed to resolve',
  };
};
