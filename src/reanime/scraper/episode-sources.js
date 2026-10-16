import { REANIME_BASE_URL, flixGet, normalizeCategory } from '../_shared.js';
import { fetchReanimeAnime } from './anime.js';
import { resolveFlixcloud } from './flixcloud.js';

// Shape the sources response exactly like the hianime provider
// (source/episodeId/server/category/embed/streamResolved/reason/note/link/tracks/
// intro/outro/referer/sources[]) so clients consume reanime with the same code.
//
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
  const data = await flixGet(anilistId, episodeNumber, malId);

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
    source: `${REANIME_BASE_URL}/api/flix/${anilistId}/${episodeNumber}${malId ? `?mal=${malId}` : ''}`,
    episodeId: null,
    animeId: details.animeId,
    anilistId,
    malId,
    episode: episodeNumber,
    server: null,
    category: wantCategory,
    embed: null,
    streamResolved: false,
    reason: null,
    note: null,
    link: null,
    tracks: [],
    intro: null,
    outro: null,
    referer: null,
    servers: all,
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
      const { url: link, playlistKey } = await resolveFlixcloud(embedUrl);
      const referer = 'https://flixcloud.cc/';
      const keyB64 = playlistKey.toString('base64');

      const proxyM3u8 = `${proxyBase}?url=${encodeURIComponent(link)}&ref=${encodeURIComponent(referer)}&key=${encodeURIComponent(keyB64)}`;

      return {
        ...base,
        episodeId: candidate.id,
        server: candidate.name,
        category: candidate.category || wantCategory,
        embed: embedUrl,
        streamResolved: true,
        link,
        tracks: [],
        referer,
        sources: [
          {
            url: link,
            type: 'm3u8',
            quality: 'auto',
            server: candidate.name,
            category: candidate.category || wantCategory,
            proxyM3u8,
            embeddedUrl: proxyM3u8,
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
    episodeId: fallback?.id || null,
    server: fallback?.name || null,
    category: fallback?.category || wantCategory,
    embed: fallbackEmbed,
    reason: 'resolution-failed',
    note: lastError?.message || 'all servers failed to resolve',
    referer: fallbackEmbed ? `${new URL(fallbackEmbed).origin}/` : null,
    sources: fallbackEmbed
      ? [
          {
            url: fallbackEmbed,
            type: 'embed',
            quality: 'auto',
            server: fallback.name,
            category: fallback.category || wantCategory,
            browserOnly: true,
            proxyM3u8: fallbackPlay,
            embeddedUrl: fallbackEmbed,
          },
        ]
      : [],
  };
};
