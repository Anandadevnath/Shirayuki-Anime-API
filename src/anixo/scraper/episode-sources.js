import {
  MEGAPLAY_BASE_URL,
  normalizeCategory,
  normalizeServer,
  parseAnimeEpisodeRef,
  pickServer,
  resolveMegaplaySources,
} from './_shared.js';

const extractM3u8 = (payload) => {
  const sources = payload?.sources;
  if (!sources) return null;

  if (typeof sources === 'string') return sources;
  if (Array.isArray(sources)) return sources.find((s) => s?.file)?.file || null;
  return sources.file || null;
};

const normalizeTracks = (tracks = []) =>
  (Array.isArray(tracks) ? tracks : [])
    .filter((track) => track?.file && track.kind !== 'thumbnails')
    .map((track, index) => ({
      file: track.file,
      label: track.label || 'English',
      kind: track.kind || 'captions',
      default: track.default ?? index === 0,
      forced: Boolean(track.forced),
    }));

export const getAnixoEpisodeSources = async ({ animeEpisodeId, ep, server, category }) => {
  const ref = parseAnimeEpisodeRef(animeEpisodeId, ep);
  if (!ref?.animeId) {
    throw new Error('animeEpisodeId query parameter is required');
  }

  const { animeId, episode } = ref;
  const normalizedCategory = normalizeCategory(category);
  const normalizedServer = normalizeServer(server);
  const target = pickServer(normalizedServer);

  if (!target) {
    throw new Error('Requested Anixo server is unavailable');
  }

  const { embedUrl, dataId, payload } = await resolveMegaplaySources({
    route: target.route,
    animeId,
    episode,
    category: normalizedCategory,
  });

  if (!dataId) {
    throw new Error(`No stream id found for ${target.label} on this episode`);
  }

  const m3u8 = extractM3u8(payload);
  if (!m3u8) {
    throw new Error(
      `No ${normalizedCategory.toUpperCase()} sources available from ${target.label} for this episode`,
    );
  }

  const tracks = normalizeTracks(payload?.tracks);
  const typeLabel = /\.m3u8(\?|$)/i.test(m3u8) ? 'm3u8' : 'mp4';
  const referer = `${MEGAPLAY_BASE_URL}/`;

  const intro =
    payload?.intro && (payload.intro.start || payload.intro.end)
      ? { start: payload.intro.start ?? 0, end: payload.intro.end ?? 0 }
      : null;
  const outro =
    payload?.outro && (payload.outro.start || payload.outro.end)
      ? { start: payload.outro.start ?? 0, end: payload.outro.end ?? 0 }
      : null;

  return {
    animeId: String(animeId),
    episode,
    episodeSlug: `${animeId}:${episode}`,
    sourcePage: embedUrl,
    sources: [
      {
        m3u8,
        type: typeLabel,
        quality: 'auto',
        referer,
        server: target.nameId,
        category: normalizedCategory,
        embed: embedUrl,
      },
    ],
    tracks,
    intro,
    outro,
  };
};
