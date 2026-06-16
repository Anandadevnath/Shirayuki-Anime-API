import {
  ANIMEX_BASE_URL,
  fetchAnimexServers,
  parseAnimeEpisodeRef,
  providerLabel,
  resolveSlugFromRef,
} from './_shared.js';

// pp.animex.one returns { subProviders:[{id,default,tip}], dubProviders:[...] }.
const mapProvider = (provider, category) => ({
  name: providerLabel(provider.id),
  nameId: provider.id,
  server: provider.id,
  category,
  default: Boolean(provider.default),
  tip: provider.tip || null,
});

export const getAnimexEpisodeServers = async ({ animeEpisodeId, ep } = {}) => {
  const ref = parseAnimeEpisodeRef(animeEpisodeId, ep);
  if (!ref) {
    throw new Error('animeEpisodeId query parameter is required');
  }

  const slug = await resolveSlugFromRef(ref);
  const { episode } = ref;

  const payload = await fetchAnimexServers(slug, episode);
  const sub = (payload?.subProviders || []).map((p) => mapProvider(p, 'sub'));
  const dub = (payload?.dubProviders || []).map((p) => mapProvider(p, 'dub'));

  return {
    source: `${ANIMEX_BASE_URL}/watch/${slug}-episode-${episode}`,
    animeId: slug,
    anilistId: ref.anilistId ?? null,
    episode,
    servers: { sub, dub },
    providers: [...sub, ...dub],
  };
};
