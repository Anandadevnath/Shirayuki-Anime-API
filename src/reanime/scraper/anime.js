import {
  REANIME_BASE_URL,
  apiGet,
  normalizeAnimeId,
  buildAnimeUrl,
} from '../_shared.js';

// Map the /api/v1/anime/{id} payload to the shared detail shape.
const mapAnimeDetail = (info) => {
  const cover = info?.cover_image || {};
  const title = info?.title || {};
  const start = info?.start_date || {};
  const end = info?.end_date || {};
  const fmtDate = (d) =>
    d?.year ? `${d.year}-${String(d.month || 1).padStart(2, '0')}-${String(d.day || 1).padStart(2, '0')}` : null;

  return {
    id: info?.anime_id || null,
    animeId: info?.anime_id || null,
    anilistId: info?.anilist_id ?? null,
    malId: info?.mal_id ?? null,
    externalIds: {
      anidb: info?.anidb_id ?? null,
      anisearch: info?.anisearch_id ?? null,
      imdb: info?.imdb_id || null,
      kitsu: info?.kitsu_id ?? null,
      livechart: info?.livechart_id ?? null,
      simkl: info?.simkl_id ?? null,
      themoviedb: info?.themoviedb_id ?? null,
      tvdb: info?.tvdb_id ?? null,
    },
    title: title.english || title.user_preferred || title.romaji || title.native || null,
    jname: title.romaji || null,
    native: title.native || null,
    userPreferred: title.user_preferred || null,
    aliases: Array.isArray(info?.synonyms) ? info.synonyms : [],
    poster: cover.extra_large || cover.large || cover.medium || null,
    banner: info?.banner_image || null,
    clearLogo: null,
    color: cover.color || null,
    description: info?.description || null,
    type: info?.format || null,
    status: info?.status || null,
    source_material: info?.source || null,
    countryOfOrigin: info?.country_of_origin || null,
    genres: Array.isArray(info?.genres) ? info.genres : [],
    synonyms: Array.isArray(info?.synonyms) ? info.synonyms : [],
    tags: Array.isArray(info?.tags)
      ? info.tags.map((t) => ({ name: t.name, category: t.category, rank: t.rank ?? null }))
      : [],
    season: info?.season || null,
    seasonYear: info?.season_year ?? null,
    startDate: fmtDate(start),
    endDate: fmtDate(end),
    score: info?.average_score ?? null,
    meanScore: info?.mean_score ?? null,
    malScore: info?.mal_score ?? null,
    popularity: info?.popularity ?? null,
    favourites: info?.favourites ?? null,
    rating: info?.rating || null,
    isAdult: Boolean(info?.is_adult),
    isLicensed: Boolean(info?.is_licensed),
    duration: info?.duration ?? null,
    trailer: info?.trailer?.id
      ? { id: info.trailer.id, site: info.trailer.site, thumbnail: info.trailer.thumbnail || null }
      : null,
    totalEpisodes: info?.episodes_total ?? null,
    lastEpisode: info?.last_episode ?? null,
    subbed: info?.subbed ?? null,
    dubbed: info?.dubbed ?? null,
    url: buildAnimeUrl(info?.anime_id),
    updatedAt: info?.updated_at || null,
  };
};

// Fetch full anime details + the fields needed by the flix server resolver
// (anilist id + mal id are both required to build the flix request).
export const fetchReanimeAnime = async (animeId) => {
  const clean = normalizeAnimeId(animeId);
  if (!clean) {
    const err = new Error('animeId path parameter is required (e.g. naruto-bjfend)');
    err.status = 400;
    throw err;
  }

  let raw;
  try {
    raw = await apiGet(`/anime/${encodeURIComponent(clean)}`);
  } catch (error) {
    if (error.response) {
      const upstreamStatus = error.response.status;
      const upstreamMsg = String(error.response.data?.error || '');
      // reanime signals an unknown id with HTTP 400 ("could not extract anime
      // ID from identifier"), so treat that (and 404) as not-found; other
      // upstream statuses are surfaced as 502.
      const notFound = upstreamStatus === 404 || upstreamStatus === 400;
      const err = new Error(
        notFound
          ? `Anime not found (${clean})`
          : `Upstream error for ${clean} (HTTP ${upstreamStatus}${
              upstreamMsg ? `: ${upstreamMsg}` : ''
            })`,
      );
      err.status = notFound ? 404 : 502;
      throw err;
    }
    throw error;
  }

  if (!raw?.anime_id) {
    const err = new Error(`Anime not found (${clean})`);
    err.status = 404;
    throw err;
  }

  const details = mapAnimeDetail(raw);
  return {
    details,
    raw,
    anilistId: details.anilistId,
    malId: details.malId,
  };
};

export const getReanimeAnimeDetails = async ({ animeId } = {}) => {
  const { details } = await fetchReanimeAnime(animeId);
  return {
    source: `${REANIME_BASE_URL}/api/v1/anime/${details.animeId}`,
    ...details,
  };
};

// Episode list from /api/v1/anime/{id}/episodes (source: jikan), paginated.
export const getReanimeEpisodes = async ({ animeId, page } = {}) => {
  const clean = normalizeAnimeId(animeId);
  if (!clean) {
    const err = new Error('animeId path parameter is required (e.g. naruto-bjfend)');
    err.status = 400;
    throw err;
  }

  const normalizedPage = Math.max(1, Number(page) || 1);
  const data = await apiGet(`/anime/${encodeURIComponent(clean)}/episodes`, {
    page: normalizedPage,
  });

  const episodes = (data?.data || []).map((ep) => ({
    episode: ep.episode_number ?? null,
    episodeId: ep.episodeId || (ep.episode_number != null ? `ep-${ep.episode_number}` : null),
    title: ep.title || null,
    titleJapanese: ep.title_japanese || null,
    titleRomaji: ep.title_romanji || null,
    thumbnail: ep.thumbnail || null,
    description: ep.description || null,
    aired: ep.aired || null,
    duration: ep.duration || null,
    isFiller: Boolean(ep.is_filler),
    isRecap: Boolean(ep.is_recap),
    subbed: Boolean(ep.subbed),
    dubbed: Boolean(ep.dubbed),
    playable: Boolean(ep.playable),
    site: ep.site || null,
    url: ep.url || null,
  }));

  return {
    source: `${REANIME_BASE_URL}/api/v1/anime/${encodeURIComponent(clean)}/episodes`,
    animeId: clean,
    pagination: {
      currentPage: normalizedPage,
      total: data?.total ?? episodes.length,
      totalPages: data?.totalPages ?? 1,
      hasNextPage: normalizedPage < (data?.totalPages ?? 1),
      hasPreviousPage: normalizedPage > 1,
    },
    episodes,
  };
};

// --- Sub-resources -------------------------------------------------------
// The /api/v1/anime/{id} payload already embeds characters, staff, studios,
// relations and artworks, so these endpoints are slices of the same detail call
// rather than extra upstream requests.

const mapCharacter = (c) => ({
  id: c?.id ?? null,
  name: c?.name || null,
  role: c?.role || null,
});

const mapStaff = (s) => ({
  id: s?.id ?? null,
  name: s?.name || null,
  role: s?.role || null,
});

const mapRelation = (r) => ({
  animeId: r?.anime_id || null,
  anilistId: r?.anilist_id ?? null,
  malId: r?.mal_id ?? null,
  title: r?.title?.english || r?.title?.romaji || r?.title?.native || null,
  jname: r?.title?.romaji || r?.title?.native || null,
  poster: r?.cover_image?.extra_large || r?.cover_image?.large || r?.cover_image?.medium || null,
  format: r?.format || null,
  season: r?.season || null,
  seasonYear: r?.season_year ?? null,
  type: r?.relation_type || r?.relationType || null,
  url: r?.anime_id ? buildAnimeUrl(r.anime_id) : null,
});

const mapArtwork = (a) => ({
  type: a?.image_type || null,
  source: a?.source || null,
  url: a?.url || null,
  width: a?.width ?? null,
  height: a?.height ?? null,
});

export const getReanimeCharacters = async ({ animeId } = {}) => {
  const { details, raw } = await fetchReanimeAnime(animeId);
  const characters = Array.isArray(raw?.characters) ? raw.characters.map(mapCharacter) : [];
  return {
    source: `${REANIME_BASE_URL}/api/v1/anime/${details.animeId}`,
    animeId: details.animeId,
    anilistId: details.anilistId,
    results: characters,
    voiceActors: [],
  };
};

export const getReanimeArtists = async ({ animeId } = {}) => {
  const { details, raw } = await fetchReanimeAnime(animeId);
  const staff = Array.isArray(raw?.staff) ? raw.staff.map(mapStaff) : [];
  return {
    source: `${REANIME_BASE_URL}/api/v1/anime/${details.animeId}`,
    animeId: details.animeId,
    anilistId: details.anilistId,
    results: staff,
  };
};

// Art bundle: title art (poster/banner/clear logo colour) + artworks + studios.
export const getReanimeArt = async ({ animeId } = {}) => {
  const { details, raw } = await fetchReanimeAnime(animeId);
  return {
    source: `${REANIME_BASE_URL}/api/v1/anime/${details.animeId}`,
    animeId: details.animeId,
    anilistId: details.anilistId,
    title: {
      text: details.title,
      jname: details.jname,
      native: details.native,
    },
    poster: details.poster,
    banner: details.banner,
    color: details.color,
    logos: [],
    studios: Array.isArray(raw?.studios)
      ? raw.studios.map((s) => ({ id: s?.id ?? null, name: s?.name || null, isMain: Boolean(s?.is_main) }))
      : [],
    artworks: Array.isArray(raw?.artworks) ? raw.artworks.map(mapArtwork) : [],
  };
};

// Franchise seasons / relations. reanime exposes `relations` on the detail
// payload (and `external_seasons` counts) but no dedicated seasons endpoint.
export const getReanimeSeasons = async ({ animeId } = {}) => {
  const { details, raw } = await fetchReanimeAnime(animeId);
  return {
    source: `${REANIME_BASE_URL}/api/v1/anime/${details.animeId}`,
    animeId: details.animeId,
    anilistId: details.anilistId,
    externalSeasons: raw?.external_seasons || null,
    results: Array.isArray(raw?.relations) ? raw.relations.map(mapRelation) : [],
  };
};

export const getReanimeRelations = async ({ animeId } = {}) => {
  const { details, raw } = await fetchReanimeAnime(animeId);
  return {
    source: `${REANIME_BASE_URL}/api/v1/anime/${details.animeId}`,
    animeId: details.animeId,
    anilistId: details.anilistId,
    results: Array.isArray(raw?.relations) ? raw.relations.map(mapRelation) : [],
  };
};
