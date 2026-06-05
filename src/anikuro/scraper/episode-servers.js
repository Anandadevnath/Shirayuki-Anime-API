import {
  ANIKURO_BASE_URL,
  WATCH_SOURCE_PROVIDERS,
  fetchJson,
  parseAnimeEpisodeRef,
} from './_shared.js';

const variantHasSources = (variant) =>
  Array.isArray(variant?.sources) && variant.sources.some((source) => source?.url);

const getProviderAvailability = async (provider, anilistId, episode, watchUrl) => {
  try {
    const { payload } = await fetchJson(`/api/v1/sources/${provider.key}/${anilistId}:${episode}`, {
      referer: watchUrl,
    });

    const root = payload?.ok === true && payload.data ? payload.data : payload;
    const variants = Array.isArray(root?.normalized) ? root.normalized : [];

    const subVariant = variants.find((variant) => variant.variant === 'sub');
    const dubVariant = variants.find((variant) => variant.variant === 'dub');

    return {
      name: provider.label,
      nameId: provider.nameId,
      provider: provider.key,
      available: {
        sub: variantHasSources(subVariant),
        dub: variantHasSources(dubVariant),
      },
    };
  } catch {
    return {
      name: provider.label,
      nameId: provider.nameId,
      provider: provider.key,
      available: {
        sub: false,
        dub: false,
      },
    };
  }
};

export const getAnikuroEpisodeServers = async ({ animeEpisodeId, ep } = {}) => {
  const ref = parseAnimeEpisodeRef(animeEpisodeId, ep);
  if (!ref?.anilistId) {
    throw new Error('animeEpisodeId query parameter is required');
  }

  const { anilistId, episode } = ref;
  const watchUrl = `${ANIKURO_BASE_URL}/watch/${anilistId}:${episode}`;

  const providers = await Promise.all(
    WATCH_SOURCE_PROVIDERS.map((provider) =>
      getProviderAvailability(provider, anilistId, episode, watchUrl),
    ),
  );

  return {
    source: watchUrl,
    animeId: String(anilistId),
    episode,
    servers: {
      sub: providers.filter((provider) => provider.available.sub),
      dub: providers.filter((provider) => provider.available.dub),
    },
    providers,
  };
};
