import { REANIME_BASE_URL, flixGet, normalizeCategory } from '../_shared.js';
import { fetchReanimeAnime } from './anime.js';

// Shape the sources response like the hianime provider (link/tracks/intro/outro/
// sources[]) so clients can consume reanime with the same code. IMPORTANT: unlike
// hianime, reanime's streams CANNOT be proxied or fetched server-side — the flix
// resolver returns flixcloud embed pages whose real HLS URL is minted with a JWT
// bound to the requesting browser's IP (a plain server fetch returns 403) and the
// playlist bodies are decrypted client-side. So `link`/`sources[].url` are the
// embed page (browser-only), `proxyM3u8` points at our iframe player page (which
// frames that embed), and `streamResolved` reflects that no direct m3u8 exists.
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
  const chosen = wanted ? pool.find((s) => String(s.name).toLowerCase() === wanted) || pool[0] : pool[0];

  const embedUrl = chosen?.embedUrl || null;
  const referer = embedUrl ? `${new URL(embedUrl).origin}/` : null;

  // Our iframe player page (frames the embed) — the closest analogue to hianime's
  // proxied play page, since the raw playlist cannot be proxied here.
  const base = origin || '';
  const playParams = new URLSearchParams({ animeId: details.animeId, ep: String(episodeNumber) });
  if (chosen?.name) playParams.set('server', chosen.name);
  if (chosen?.category) playParams.set('category', chosen.category);
  const proxyM3u8 = base ? `${base}/api/v2/reanime/play?${playParams.toString()}` : null;

  const sources = embedUrl
    ? [
        {
          // No direct m3u8 exists; the embed page is the playable resource.
          url: embedUrl,
          type: 'embed',
          quality: 'auto',
          server: chosen.name,
          category: chosen.category,
          browserOnly: true,
          proxyM3u8,
          embeddedUrl: embedUrl,
        },
      ]
    : [];

  return {
    source: `${REANIME_BASE_URL}/api/flix/${anilistId}/${episodeNumber}${malId ? `?mal=${malId}` : ''}`,
    episodeId: chosen?.id || null,
    animeId: details.animeId,
    anilistId,
    malId,
    episode: episodeNumber,
    server: chosen?.name || null,
    category: chosen?.category || wantCategory,
    embed: embedUrl,
    streamResolved: Boolean(embedUrl),
    reason: embedUrl
      ? null
      : 'No server embed resolved for this episode',
    note: 'reanime streams are token+IP locked and decrypted client-side; play the embed URL in a browser. Not proxyable server-side.',
    link: embedUrl,
    tracks: [],
    intro: null,
    outro: null,
    referer,
    servers: all,
    sources,
  };
};
