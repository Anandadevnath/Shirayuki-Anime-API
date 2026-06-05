import {
  ANIKURO_BASE_URL,
  WATCH_SOURCE_PROVIDERS,
  fetchJson,
  normalizeCategory,
  normalizeServer,
  parseAnimeEpisodeRef,
  toAbsoluteUrl,
} from './_shared.js';

const normalizeProviderSourcePayload = (provider, payload) => {
  const root = payload && payload.ok === true && payload.data ? payload.data : payload;
  const raw = root?.raw || root;
  const providerResult = raw?.providerResult || root?.providerResult || raw || root;
  const providerVariants = Array.isArray(providerResult?.variants) ? providerResult.variants : [];

  const normalizedVariants = Array.isArray(root?.normalized)
    ? root.normalized
        .filter((item) => item && item.variant && Array.isArray(item.sources))
        .map((item) => ({
          variant: item.variant,
          sources: item.sources,
          subtitles: item.subtitles || [],
          headers: item.headers || {},
          intro: item.intro || null,
          outro: item.outro || null,
        }))
    : [];

  const legacyVariants = [];
  if (raw?.sub?.sources?.length || raw?.sub?.default) {
    legacyVariants.push({
      variant: 'sub',
      sources: raw.sub.sources?.length
        ? raw.sub.sources
        : [{ url: raw.sub.default, quality: raw.sub.quality || 'default', type: 'hls', isM3U8: true }],
      subtitles: raw.sub.subtitles || [],
      headers: raw.sub.headers || {},
      intro: raw.sub.intro || null,
      outro: raw.sub.outro || null,
    });
  }
  if (raw?.dub?.sources?.length || raw?.dub?.default) {
    legacyVariants.push({
      variant: 'dub',
      sources: raw.dub.sources?.length
        ? raw.dub.sources
        : [{ url: raw.dub.default, quality: raw.dub.quality || 'default', type: 'hls', isM3U8: true }],
      subtitles: raw.dub.subtitles || [],
      headers: raw.dub.headers || {},
      intro: raw.dub.intro || null,
      outro: raw.dub.outro || null,
    });
  }

  const variants = normalizedVariants.length
    ? normalizedVariants
    : providerVariants.length
      ? providerVariants
      : legacyVariants;

  const hasPlayableSource = variants.some(
    (variant) =>
      Array.isArray(variant.sources) && variant.sources.some((source) => source?.url),
  );

  return {
    provider: provider.key,
    label: provider.label,
    ok: Boolean(root && !root.error && hasPlayableSource),
    variants,
    error: root?.error || raw?.error || providerResult?.error || (hasPlayableSource ? null : 'source_not_found'),
  };
};

const pickProvider = (requestedServer) => {
  const target = normalizeServer(requestedServer);
  return WATCH_SOURCE_PROVIDERS.find((provider) => provider.key === target) || null;
};

const pickVariant = (normalized, category) =>
  normalized.variants.find((variant) => variant.variant === category) || null;

const pickSource = (variant) => {
  if (!variant?.sources?.length) return null;

  return (
    variant.sources.find((source) => source?.url && (source.isM3U8 || /\.m3u8(\?|$)/i.test(source.url))) ||
    variant.sources.find((source) => source?.url) ||
    null
  );
};

const normalizeTracks = (subtitles = []) =>
  subtitles
    .filter((track) => track?.url)
    .map((track, index) => ({
      file: toAbsoluteUrl(track.url),
      label: track.label || 'English',
      kind: 'captions',
      default: track.default ?? index === 0,
      forced: false,
    }));

const fetchProviderSources = async (provider, anilistId, episode, watchUrl) => {
  const { payload } = await fetchJson(`/api/v1/sources/${provider.key}/${anilistId}:${episode}`, {
    referer: watchUrl,
  });

  return normalizeProviderSourcePayload(provider, payload);
};

const fetchAnimeTitle = async (anilistId, watchUrl) => {
  try {
    const { payload } = await fetchJson(`/api/v1/anime/${anilistId}`, { referer: watchUrl });
    const title = payload?.data?.title;
    return title?.english || title?.romaji || title?.native || title?.userPreferred || null;
  } catch {
    return null;
  }
};

export const getAnikuroEpisodeSources = async ({ animeEpisodeId, ep, server, category }) => {
  const ref = parseAnimeEpisodeRef(animeEpisodeId, ep);
  if (!ref?.anilistId) {
    throw new Error('animeEpisodeId query parameter is required');
  }

  const { anilistId, episode } = ref;
  const normalizedCategory = normalizeCategory(category);
  const normalizedServer = normalizeServer(server);
  const provider = pickProvider(normalizedServer);

  if (!provider) {
    throw new Error('Requested Anikuro server is unavailable');
  }

  const watchUrl = `${ANIKURO_BASE_URL}/watch/${anilistId}:${episode}`;
  const [normalized, title] = await Promise.all([
    fetchProviderSources(provider, anilistId, episode, watchUrl),
    fetchAnimeTitle(anilistId, watchUrl),
  ]);

  if (!normalized.ok) {
    throw new Error(
      `No ${normalizedCategory.toUpperCase()} sources available from ${provider.label} for this episode`,
    );
  }

  const variant = pickVariant(normalized, normalizedCategory);
  if (!variant) {
    throw new Error(`No ${normalizedCategory.toUpperCase()} sources available for this episode`);
  }

  const pickedSource = pickSource(variant);
  if (!pickedSource?.url) {
    throw new Error(`Requested Anikuro server does not have a playable ${normalizedCategory} source`);
  }

  const m3u8 = toAbsoluteUrl(pickedSource.url);
  const referer =
    pickedSource.headers?.Referer ||
    pickedSource.headers?.referer ||
    pickedSource.upstreamReferer ||
    variant.headers?.Referer ||
    variant.headers?.referer ||
    ANIKURO_BASE_URL;

  const tracks = normalizeTracks(variant.subtitles);
  const typeLabel = /\.m3u8(\?|$)/i.test(m3u8) || pickedSource.type === 'hls' ? 'm3u8' : 'mp4';

  return {
    animeId: String(anilistId),
    title,
    episode,
    episodeSlug: `${anilistId}:${episode}`,
    sourcePage: watchUrl,
    malId: null,
    sources: [
      {
        m3u8,
        type: typeLabel,
        quality: pickedSource.quality || null,
        referer,
        server: provider.nameId,
        category: normalizedCategory,
        embed: m3u8,
      },
    ],
    tracks,
    intro: variant.intro || null,
    outro: variant.outro || null,
  };
};
