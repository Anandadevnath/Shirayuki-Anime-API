import {
  ANIMEX_BASE_URL,
  ANIMEX_PP_BASE_URL,
  CDN_REFERER,
  DEFAULT_UA,
  decodeSvelteKitData,
  buildWatchUrl,
  kebabize,
  normalizeAnimeId,
} from '../_shared.js';
import { axios } from '../../utils/scrapper-deps.js';

// Character edge -> shared shape.
const mapCharacter = (edge) => ({
  id: edge?.node?.id ?? null,
  role: edge?.role || null,
  name: edge?.node?.name?.userPreferred || edge?.node?.name?.full || null,
  image: edge?.node?.image?.large || null,
  voiceActors: (edge?.voiceActorRoles || []).map((va) => ({
    name: va?.voiceActor?.name?.full || null,
    image: va?.voiceActor?.image?.large || null,
  })),
});

// Relation edge -> shared shape.
const mapRelation = (edge) => ({
  id: edge?.node?.id ?? null,
  anilistId: edge?.node?.anilistId ?? null,
  title: edge?.node?.title?.romaji || edge?.node?.title?.english || null,
  relationType: edge?.relationType || null,
  poster: edge?.node?.coverImage?.large || null,
});

// Normalize the animeInfo blob from the SvelteKit page payload into the shared
// details shape. `publicId` is the URL-facing id, `animeId` the internal
// catalog id needed by the pp.animex.one player endpoints.
const mapAnimeInfo = (info) => {
  if (!info) return null;
  const toArray = (v) => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : v ? [v] : []);
  const characters = toArray(info.characters?.edges || info.characters).map(mapCharacter);
  const relations = toArray(info.relations?.edges || info.relations).map(mapRelation);
  const recommendations = toArray(info.recommendations).map((r) => ({
    id: r.id,
    title: r.title?.english || r.title?.romaji || null,
    jname: r.romajiTitle || null,
    poster: r.coverImage?.large || r.coverImage?.extraLarge || null,
    episodes: r.episodes ?? null,
  }));
  const kebab = String(info.titleRomaji || info.titleEnglish || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return {
    id: info.id ?? null,
    anilistId: info.anilistId ?? null,
    malId: info.malId ?? info.idMal ?? null,
    animeId: info.slug || null,
    publicId: `${kebab}-${info.anilistId ?? ''}`,
    title: info.titleEnglish || info.titleRomaji || null,
    jname: info.titleRomaji || null,
    native: info.nativeTitle || null,
    aliases: Object.values(info.titles || {}).filter(Boolean),
    poster: info.coverImage?.extraLarge || info.coverImage?.large || null,
    banner: info.bannerImage || info.bannerUrl || null,
    clearLogo: info.clearLogoUrl || null,
    backdrop: info.backdropUrl || null,
    description: info.description || info.synopsis || null,
    type: info.format || info.type || null,
    status: info.status || null,
    genres: toArray(info.genres),
    studios: toArray(info.studios).map((s) => (typeof s === 'object' ? s?.name || null : s)).filter(Boolean),
    seasonYear: info.seasonYear ?? info.year ?? null,
    season: info.season || null,
    score: info.averageScore ?? null,
    popularity: info.popularity ?? null,
    color: info.color || null,
    trailerId: info.trailerId || null,
    logos: toArray(info.logos).map((l) => l.src || l).filter(Boolean),
    totalEpisodes: info.totalEpisodes || info.episodeCount || null,
    nextAiringAt: info.nextAiringAt ?? null,
    nextAiringEpisode: info.nextAiringEpisode ?? null,
    characters,
    recommendations,
    relations,
  };
};

// Fetch + decode the anime's SvelteKit payload via the public detail id
// (e.g. "naruto-20") and resolve both the mapped details and the internal
// catalog id (e.g. naruto-oe7a3) required by the pp.animex.one endpoints.
export const fetchAnimeInfo = async (animeId) => {
  const clean = normalizeAnimeId(animeId);
  if (!clean) {
    const err = new Error('animeId path parameter is required (e.g. naruto-20)');
    err.status = 400;
    throw err;
  }

  const url = `${ANIMEX_BASE_URL}/anime/${encodeURIComponent(clean)}/__data.json`;
  let raw;
  try {
    const resp = await axios.get(url, {
      proxy: false,
      timeout: 25000,
      maxRedirects: 5,
      headers: {
        'User-Agent': DEFAULT_UA,
        Accept: 'application/json, */*',
        Referer: CDN_REFERER,
      },
    });
    raw = resp?.data;
  } catch (error) {
    if (error.response) {
      const err = new Error(`Anime not found (${clean})`);
      err.status = 404;
      throw err;
    }
    throw error;
  }

  if (raw?.nodes?.[1]?.type === 'error') {
    const err = new Error(raw.nodes[1].error?.message || `Anime not found (${clean})`);
    err.status = 404;
    throw err;
  }

  const pageData = decodeSvelteKitData(raw?.nodes?.[1]);
  const details = mapAnimeInfo(pageData?.animeInfo);
  if (!details?.animeId) {
    const err = new Error(`Anime not found or its internal id could not be determined (${clean})`);
    err.status = 404;
    throw err;
  }

  return { details, internalId: details.animeId };
};

// Episode list from the player REST api (accepts only the internal id).
export const fetchEpisodes = async (internalId) => {
  if (!internalId) {
    const err = new Error('internal catalog id is required to fetch episodes');
    err.status = 400;
    throw err;
  }

  const { data } = await axios.get(`${ANIMEX_PP_BASE_URL}/rest/api/episodes`, {
    proxy: false,
    timeout: 20000,
    params: { id: internalId },
    headers: {
      'User-Agent': DEFAULT_UA,
      Accept: 'application/json, */*',
      Origin: ANIMEX_BASE_URL,
      Referer: CDN_REFERER,
    },
  });

  if (!Array.isArray(data)) {
    if (data?.error) {
      const err = new Error(data.error);
      err.status = 404;
      throw err;
    }
    return [];
  }

  return data.map((ep) => ({
    episode: ep.number ?? null,
    episodeId: ep.number != null ? String(ep.number) : null,
    title: ep.titles?.en || ep.titles?.['x-jat'] || ep.titles?.ja || null,
    img: ep.img || null,
    isFiller: Boolean(ep.isFiller),
    description: ep.description || null,
    url: buildWatchUrl(ep.number, null),
  }));
};

// Full anime details: SvelteKit payload + pp episode list.
export const getAnimexAnimeDetails = async ({ animeId } = {}) => {
  const clean = normalizeAnimeId(animeId);
  if (!clean) {
    const err = new Error('animeId path parameter is required (e.g. naruto-20)');
    err.status = 400;
    throw err;
  }

  const { details } = await fetchAnimeInfo(clean);

  let episodes = [];
  try {
    episodes = await fetchEpisodes(details.animeId);
  } catch {
    episodes = [];
  }

  return {
    ...details,
    url: `${ANIMEX_BASE_URL}/anime/${details.publicId}`,
    totalEpisodes: details.totalEpisodes || episodes.length,
    episodesList: episodes.map((e) => ({
      ...e,
      url: `/watch/${details.publicId}-episode-${e.episode}`,
    })),
    episodes: { total: episodes.length || details.totalEpisodes },
  };
};

// Episode list only (lighter payload, mirrors the anikoto /episodes shape).
export const getAnimexEpisodes = async ({ animeId } = {}) => {
  const clean = normalizeAnimeId(animeId);
  if (!clean) {
    const err = new Error('animeId path parameter is required (e.g. naruto-20)');
    err.status = 400;
    throw err;
  }

  const { details } = await fetchAnimeInfo(clean);
  const episodes = await fetchEpisodes(details.animeId);

  return {
    source: `${ANIMEX_PP_BASE_URL}/rest/api/episodes?id=${details.animeId}`,
    id: details.animeId,
    slug: details.publicId,
    title: details.title,
    totalEpisodes: episodes.length,
    ranges: [],
    episodes,
  };
};
