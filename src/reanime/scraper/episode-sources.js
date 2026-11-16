import { flixGet, normalizeCategory } from '../_shared.js';
import { fetchReanimeAnime, getReanimeEpisodes } from './anime.js';
import { resolveFlixcloud } from './flixcloud.js';
import { getSkipTimes } from '../../utils/aniskip.js';

// Shape the sources response exactly like the hianime provider
// (episodeId/server/category/streamResolved/reason/note/tracks/intro/outro/
// sources[]) so clients consume reanime with the same code. `link`/`embed`/
// `referer` are intentionally omitted: the IP-bound m3u8 is already carried by
// `sources[].url` and the playable URLs are `proxyM3u8` + `embeddedUrl`.//
// Unlike the raw flixcloud embed (browser-only), we replay the player's own
// resolution server-side — WASM key-mix + AES-CBC for the URL blob, then the
// patched-hls.js XOR key for the playlist body — which yields a real .m3u8 that
// our /proxy can serve. So reanime now has the same proxied-HLS shape as hianime.
export const getReanimeEpisodeSources = async ({ animeId, ep, server, category, origin } = {}) => {
  const { details, anilistId, malId } = await fetchReanimeAnime(animeId);

  if (!anilistId) {
    const err = new Error('anilist id is required to resolve sources for this anime');
    err.status = 422;
    throw err;
  }

  const episodeNumber = Number(ep) > 0 ? Number(ep) : 1;
  const wantCategory = normalizeCategory(category);
  const [data, skip, episodes] = await Promise.all([
    flixGet(anilistId, episodeNumber, malId),
    getSkipTimes(malId, episodeNumber),
    getReanimeEpisodes({ animeId: details.animeId }).catch(() => null),
  ]);

  // Match hianime's shape: episodeId is the catalogue episode id, not internal $id.
  const catalogEpisode = (episodes?.episodes || []).find((e) => e.episode === episodeNumber) || null;
  const episodeId = catalogEpisode?.episodeId || `ep-${episodeNumber}`;

  if (!data?.success || !data?.servers?.length) {
    const err = new Error(data?.error || `No servers found for episode ${episodeNumber}`);
    err.status = 404;
    throw err;
  }

  const all = (data.servers || []).map((s) => ({
    id: s.$id || null,
    name: s.serverName || null,
    category: normalizeCategory(s.dataType),
    embedUrl: s.dataLink || null,
    softsub: Boolean(s.softsub),
    continue: Boolean(s.continue),
  }));

  const matches = all.filter((s) => s.category === wantCategory);
  const pool = matches.length ? matches : all;

  const wanted = String(server || '').trim().toLowerCase();
  const isMatch = (s) => String(s.name).toLowerCase().replace(/-/g, '') === wanted.replace(/-/g, '');
  const ordered = wanted ? [...pool.filter(isMatch), ...pool.filter((s) => !isMatch(s))] : pool;

  const base = {
    episodeId,
    category: wantCategory,
    server: null,
    streamResolved: false,
    reason: null,
    note: null,
    tracks: [],
    intro: skip.intro,
    outro: skip.outro,
    sources: [],
  };

  if (!ordered.length) {
    return { ...base, reason: 'resolution-failed', note: 'No usable server selected' };
  }

  const proxyBase = origin ? `${origin}/api/v2/reanime/proxy` : '/api/v2/reanime/proxy';
  let lastError = null;

  // Try servers in order (requested first) so one dead server doesn't block playback.
  for (const candidate of ordered) {
    const embedUrl = candidate.embedUrl;
    if (!embedUrl) {
      lastError = new Error('server has no embed url');
      continue;
    }
    try {
      const { url: link, playlistKey, tracks } = await resolveFlixcloud(embedUrl);
      const referer = 'https://flixcloud.cc/';
      const keyB64 = playlistKey.toString('base64');

      // Sub and dub share one stream; dub is the English audio rendition.
      const audioParam = candidate.category === 'dub' ? '&audio=eng' : '';
      const proxiedPlaylist = `${proxyBase}?url=${encodeURIComponent(link)}&ref=${encodeURIComponent(referer)}&key=${encodeURIComponent(keyB64)}${audioParam}`;
      // Match hianime: proxyM3u8 is the /play page (re-resolves a fresh token on
      // every open), embeddedUrl is the raw proxied playlist for HLS clients.
      const playParams = new URLSearchParams({ animeId: details.animeId, ep: String(episodeNumber) });
      if (candidate.name) playParams.set('server', candidate.name);
      if (candidate.category) playParams.set('category', candidate.category);
      const proxyM3u8 = origin ? `${origin}/api/v2/reanime/play?${playParams.toString()}` : proxiedPlaylist;

      return {
        ...base,
        server: candidate.name,
        category: candidate.category || wantCategory,
        streamResolved: true,
        tracks,
        intro: skip.intro,
        outro: skip.outro,
        sources: [
          {
            url: link,
            type: 'm3u8',
            quality: 'auto',
            proxyM3u8,
            embeddedUrl: proxiedPlaylist,
          },
        ],
      };
    } catch (error) {
      lastError = error;
      // keep trying the next server
    }
  }

  // Every server failed to resolve — degrade to the embed so the client still has
  // something playable (browser-only), mirroring hianime's degrade behaviour.
  const fallback = ordered[0];
  const fallbackEmbed = fallback?.embedUrl || null;
  const fallbackParams = new URLSearchParams({ animeId: details.animeId, ep: String(episodeNumber) });
  if (fallback?.name) fallbackParams.set('server', fallback.name);
  if (fallback?.category) fallbackParams.set('category', fallback.category);
  const fallbackPlay = origin ? `${origin}/api/v2/reanime/play?${fallbackParams.toString()}` : null;

  return {
    ...base,
    server: fallback?.name || null,
    category: fallback?.category || wantCategory,
    reason: 'resolution-failed',
    note: lastError?.message || 'all servers failed to resolve',
    sources: fallbackEmbed
      ? [
          {
            url: fallbackEmbed,
            type: 'embed',
            quality: 'auto',
            browserOnly: true,
            proxyM3u8: fallbackPlay,
            embeddedUrl: fallbackEmbed,
          },
        ]
      : [],
  };
};
