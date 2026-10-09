import {
  ANIMEKAI_BASE_URL,
  fetchWatchPage,
  parseWatchServers,
} from './_shared.js';

const slugServerId = (name) => {
  const norm = String(name || '').toLowerCase().replace(/\s+/g, '');
  if (norm === 'ani-hd' || norm === 'anihd') return 'ani-hd';
  if (norm === 'hd-1' || norm === 'hd1') return 'hd-1';
  return 'hd';
};

const mapServers = (list, category) =>
  list.map((s) => ({
    name: s.name,
    serverId: slugServerId(s.name),
    category,
    episodeId: s.episodeId,
    linkId: s.linkId,
  }));

/**
 * Resolve servers for an episode.
 * animeEpisodeId accepts:
 *   - "one-piece-ewc5jc"            (ep via `ep` query, default 1)
 *   - "one-piece-ewc5jc/ep-2"
 *   - full watch url                (https://animekai.ro/watch/one-piece-ewc5jc/ep-2)
 */
export const getAnimeKaiEpisodeServers = async ({ animeEpisodeId, ep } = {}) => {
  const raw = String(animeEpisodeId || '').trim();
  if (!raw) {
    const err = new Error('animeEpisodeId query parameter is required (e.g. one-piece-ewc5jc)');
    err.status = 400;
    throw err;
  }

  const stripped = raw.replace(/^https?:\/\/[^/]+\//, '').replace(/\/$/, '');
  const epMatch = stripped.match(/\/ep-(\d+)$/);
  const animePart = stripped.replace(/\/ep-\d+$/, '');
  const episode = Number(epMatch?.[1]) || (Number(ep) > 0 ? Number(ep) : 1);

  const slugMatch = animePart.match(/^(.*?)-([a-z0-9]{6})$/i);
  if (!slugMatch) {
    const err = new Error(
      'Invalid animeEpisodeId — expected the anime slug (e.g. one-piece-ewc5jc or one-piece-ewc5jc/ep-2)',
    );
    err.status = 400;
    throw err;
  }

  const slug = slugMatch[1];
  const animeId = slugMatch[2];

  // link-ids expire, so always fetch the watch page fresh.
  const { url: watchUrl, html } = await fetchWatchPage(slug, animeId, episode);
  const { sub, dub } = parseWatchServers(html);

  return {
    source: watchUrl,
    animeId: `${slug}-${animeId}`,
    episode,
    servers: {
      sub: mapServers(sub, 'sub'),
      dub: mapServers(dub, 'dub'),
    },
  };
};
