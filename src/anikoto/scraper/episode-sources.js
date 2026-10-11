import {
  ANIKOTO_BASE_URL,
  MEGAPLAY_BASE_URL,
  normalizeCategory,
} from '../_shared.js';
import { getAnikotoEpisodeServers } from './episode-servers.js';
import { resolveEpisodeLink } from './megaplay.js';

// Servers resolve through megaplay getSources. link-ids expire quickly, so the
// whole chain runs fresh per request.
export const getAnikotoEpisodeSources = async ({
  animeId,
  episodeId,
  ep,
  server,
  category,
} = {}) => {
  const normalizedCategory = normalizeCategory(category);

  const serverData = await getAnikotoEpisodeServers({ animeId, episodeId, ep });
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

  // Order servers: requested one first, then the rest in list order, so a dead
  // server won't block playback.
  const isMatch = (s) => {
    const target = String(server || '').trim().toLowerCase();
    if (!target) return false;
    const name = String(s.name || '').toLowerCase().replace(/\s+/g, '');
    return name === target.replace(/\s+/g, '') || name.includes(target) || target.includes(name);
  };
  const ordered = [...pool.filter(isMatch), ...pool.filter((s) => !isMatch(s))];

  const base = {
    source: serverData.source,
    animeId: serverData.animeId,
    episode: serverData.episode,
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
    referer: `${MEGAPLAY_BASE_URL}/`,
  };

  if (!ordered.length) {
    return { ...base, reason: 'resolution-failed', note: 'No usable server selected' };
  }

  let lastError = null;
  for (const candidate of ordered) {
    try {
      const resolved = await resolveEpisodeLink({ linkId: candidate.linkId, referer: serverData.source });
      return {
        ...base,
        server: candidate.name,
        embed: resolved.embed || candidate.embed || null,
        streamResolved: true,
        link: resolved.link,
        tracks: resolved.tracks || [],
        intro: resolved.intro,
        outro: resolved.outro,
        referer: `${MEGAPLAY_BASE_URL}/`,
      };
    } catch (error) {
      lastError = error;
    }
  }

  return {
    ...base,
    server: ordered[0]?.name || null,
    reason: 'resolution-failed',
    note: lastError?.message || 'all servers failed to resolve',
  };
};