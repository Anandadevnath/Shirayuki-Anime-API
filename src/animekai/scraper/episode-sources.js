import {
  ANIMEKAI_BASE_URL,
  MEGAVID_BASE_URL,
  DEFAULT_SERVER,
  fetchWatchPage,
  normalizeCategory,
  normalizeServer,
  parseWatchServers,
  resolveEpisodeStream,
} from './_shared.js';

/**
 * Resolve playable sources for an episode.
 *
 * Chain: watch page -> data-link-id -> ajax/server?get= -> megavid iframe ->
 * #player-payload sourceUrl -> {iframe}/source JSON -> m3u8 (+ tracks).
 *
 * animeEpisodeId: "one-piece-ewc5jc", "one-piece-ewc5jc/ep-2" or a full watch url.
 * server: ani-hd (default) | hd | hd-1
 * category: sub (default) | dub
 */
export const getAnimeKaiEpisodeSources = async ({
  animeEpisodeId,
  ep,
  server,
  category,
} = {}) => {
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
  const normalizedCategory = normalizeCategory(category);
  const targetServer = normalizeServer(server);

  // Fresh watch page every time — link-ids expire quickly.
  const { url: watchUrl, html } = await fetchWatchPage(slug, animeId, episode);
  const { sub, dub } = parseWatchServers(html);
  const pool = normalizedCategory === 'dub' ? dub : sub;

  if (!pool.length) {
    const err = new Error(
      `No ${normalizedCategory.toUpperCase()} servers available for ${slug}-${animeId} episode ${episode}`,
    );
    err.status = 404;
    throw err;
  }

  const target =
    pool.find((s) => normalizeServer(s.name) === targetServer) || pool[0];

  let stream;
  try {
    stream = await resolveEpisodeStream({
      linkId: target.linkId,
      referer: watchUrl,
    });
  } catch (error) {
    // The requested server may be broken for this episode — fail over once.
    const fallback = pool.find((s) => s.linkId !== target.linkId);
    if (!fallback) throw error;
    stream = await resolveEpisodeStream({
      linkId: fallback.linkId,
      referer: watchUrl,
    });
  }

  const sourcePayload = stream.sourcePayload || {};
  const m3u8 = sourcePayload.source || null;

  if (!m3u8) {
    throw new Error(
      `No ${normalizedCategory.toUpperCase()} source returned from ${target.name} for this episode`,
    );
  }

  const tracks = (Array.isArray(sourcePayload.tracks) ? sourcePayload.tracks : [])
    .filter((t) => t?.file && t.kind !== 'thumbnails')
    .map((t, index) => ({
      file: t.file,
      label: t.label || 'English',
      kind: t.kind || 'captions',
      default: t.default ?? index === 0,
      forced: Boolean(t.forced),
    }));

  const usedServer = pool.find((s) => s.linkId === target.linkId)
    ? target
    : pool.find((s) => s.name !== target.name) || target;

  return {
    animeId: `${slug}-${animeId}`,
    episode,
    episodeSlug: `${slug}-${animeId}/ep-${episode}`,
    sourcePage: watchUrl,
    server: {
      name: usedServer.name,
      serverId: normalizeServer(usedServer.name),
      category: normalizedCategory,
    },
    embed: {
      iframe: stream.iframeUrl,
      referer: `${MEGAVID_BASE_URL}/`,
    },
    sources: [
      {
        url: m3u8,
        type: sourcePayload.type === 'hls' || /\.m3u8(\?|$)/i.test(m3u8) ? 'm3u8' : 'mp4',
        quality: 'auto',
        referer: `${MEGAVID_BASE_URL}/`,
        server: normalizeServer(usedServer.name),
        category: normalizedCategory,
      },
    ],
    tracks,
    providers: Array.isArray(sourcePayload.providers) ? sourcePayload.providers : [],
  };
};
