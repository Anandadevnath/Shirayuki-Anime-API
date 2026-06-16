import {
  ANIMEX_BASE_URL,
  DUB_PROVIDERS,
  SUB_PROVIDERS,
  fetchAnimexSources,
  normalizeCategory,
  normalizeServer,
  parseAnimeEpisodeRef,
  providerLabel,
  resolveSlugFromRef,
} from './_shared.js';

const extractM3u8 = (payload) => {
  const sources = payload?.sources;
  if (!sources) return null;

  if (typeof sources === 'string') return sources;
  if (Array.isArray(sources)) return sources.find((s) => s?.url)?.url || null;
  return sources.url || null;
};

// pp.animex.one tracks: { id, url, lang, label, kind, default }.
const normalizeTracks = (tracks = []) =>
  (Array.isArray(tracks) ? tracks : [])
    .filter((track) => track?.url && track.kind !== 'thumbnails')
    .map((track, index) => ({
      file: track.url,
      label: track.label || 'English',
      kind: track.kind || 'captions',
      default: track.default ?? index === 0,
      forced: Boolean(track.forced),
    }));

export const getAnimexEpisodeSources = async ({ animeEpisodeId, ep, server, category }) => {
  const ref = parseAnimeEpisodeRef(animeEpisodeId, ep);
  if (!ref) {
    throw new Error('animeEpisodeId query parameter is required');
  }

  const slug = await resolveSlugFromRef(ref);
  const { episode } = ref;
  const normalizedCategory = normalizeCategory(category);
  const providerId = normalizeServer(server);

  const allowed = normalizedCategory === 'dub' ? DUB_PROVIDERS : SUB_PROVIDERS;
  if (!allowed.includes(providerId)) {
    throw new Error(
      `Server "${providerId}" is not available for ${normalizedCategory}. Try: ${allowed.join(', ')}`,
    );
  }

  const payload = await fetchAnimexSources(slug, episode, normalizedCategory, providerId);

  const m3u8 = extractM3u8(payload);
  if (!m3u8) {
    throw new Error(
      `No ${normalizedCategory.toUpperCase()} sources from ${providerLabel(providerId)} for this episode`,
    );
  }

  const tracks = normalizeTracks(payload?.tracks);
  const typeLabel = /\.m3u8(\?|$)/i.test(m3u8) ? 'm3u8' : 'mp4';
  // animex sometimes pins a referer (e.g. megaplay.buzz) the CDN requires; pass it through.
  const referer = payload?.headers?.Referer || payload?.headers?.referer || `${ANIMEX_BASE_URL}/`;

  return {
    animeId: slug,
    anilistId: ref.anilistId ?? null,
    episode,
    episodeSlug: `${slug}:${episode}`,
    sourcePage: `${ANIMEX_BASE_URL}/watch/${slug}-episode-${episode}`,
    sources: [
      {
        m3u8,
        type: typeLabel,
        quality: 'auto',
        referer,
        server: providerId,
        category: normalizedCategory,
      },
    ],
    tracks,
    intro: null,
    outro: null,
  };
};
