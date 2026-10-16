import {
  ANIMEX_BASE_URL,
  graphqlPost,
  infoApiGet,
  sortPresets,
  kebabize,
} from '../_shared.js';

// The exact query the site's own catalog client (query CatalogAnime) runs.
const CATALOG_QUERY = `
query CatalogAnime($filter: AnimeCatalogFilterInput, $sort: [AnimeSortInput!], $limit: Int, $offset: Int) {
  catalogAnime(filter: $filter, sort: $sort, limit: $limit, offset: $offset) {
    items {
      id
      anilistId
      malId
      titleRomaji
      titleEnglish
      coverImage
      bannerImage
      backdropUrl
      description
      trailerId
      status
      format
      averageScore
      popularity
      nextAiringAt
      nextAiringEpisode
      episodeCount
      seasonYear
      season
      color
      genres
      subCount
      dubCount
    }
    totalCount
    limit
    offset
    currentPage
    totalPages
    hasNextPage
    hasPreviousPage
  }
}`;

// Map a catalogAnime item to the shared card shape used by the API. The public
// detail URL uses the AniList id (e.g. /anime/naruto-20) while the pp player
// APIs need the internal catalog id (e.g. naruto-oe7a3) — catalogAnime returns
// both, so both are surfaced here.
const mapCatalogItem = (item) => {
  const kebab = String(item.titleRomaji || item.titleEnglish || item.id || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const publicId = `${kebab}-${item.anilistId ?? ''}`;

  return {
    id: item.id || null,
    anilistId: item.anilistId ?? null,
    malId: item.malId ?? null,
    title: item.titleEnglish || item.titleRomaji || null,
    jname: item.titleRomaji || null,
    poster: item.coverImage || null,
    banner: item.bannerImage || null,
    backdrop: item.backdropUrl || null,
    description: item.description || null,
    url: `/anime/${publicId}`,
    episodes: {
      sub: item.subCount ?? null,
      dub: item.dubCount ?? null,
      total: item.episodeCount ?? null,
    },
    type: item.format || null,
    status: item.status || null,
    year: item.seasonYear ?? null,
    season: item.season || null,
    genres: Array.isArray(item.genres) ? item.genres : item.genres ? [item.genres] : [],
    score: item.averageScore ?? null,
    popularity: item.popularity ?? null,
    color: item.color || null,
    nextAiringAt: item.nextAiringAt ?? null,
    nextAiringEpisode: item.nextAiringEpisode ?? null,
    animeId: item.id || null,
    publicId,
  };
};

// Run one catalogAnime request. `sort` accepts the site's own presets
// (trending / popular / latest / score) or a raw [AnimeSortInput!] array.
export const getAnimexCatalog = async ({ sort = 'popular', page = 1, perPage = 24, filter = {} } = {}) => {
  const key = String(sort || 'popular').toLowerCase();
  const sortList = sortPresets[key] || sortPresets.popular;
  const normalizedPage = Math.max(1, Number(page) || 1);
  const limit = Math.min(50, Math.max(1, Number(perPage) || 24));

  const variables = {
    filter,
    sort: sortList,
    limit,
    offset: (normalizedPage - 1) * limit,
  };

  const payload = await graphqlPost(CATALOG_QUERY, variables);
  const catalog = payload?.data?.catalogAnime;
  if (!catalog) {
    const err = new Error('catalogAnime returned no data');
    err.status = 502;
    throw err;
  }

  return {
    source: `${ANIMEX_BASE_URL} (graphql.animex.one catalogAnime, sort=${sortList[0].field})`,
    sort: sortList[0].field,
    pagination: {
      currentPage: catalog.currentPage || normalizedPage,
      totalPages: catalog.totalPages || 1,
      hasNextPage: Boolean(catalog.hasNextPage),
      hasPreviousPage: catalog.hasPreviousPage || false,
      total: catalog.totalCount || 0,
    },
    results: (catalog.items || []).map(mapCatalogItem),
  };
};

// Map a /api/recent entry (latest episode releases) to the shared card shape.
const mapRecentItem = (r) => {
  const kebab = kebabize(String(r.titleRomaji || r.titleEnglish || r.id || ''));
  return {
    id: r.id,
    anilistId: r.anilistId ?? null,
    malId: r.malId ?? null,
    title: r.titleEnglish || r.titleRomaji || null,
    jname: r.titleRomaji || null,
    poster: r.coverImage?.extraLarge || r.coverImage?.large || null,
    color: r.color || null,
    episode: r.episode ?? null,
    airingAt: r.airingAt ? new Date(r.airingAt * 1000).toISOString() : null,
    duration: r.duration ?? null,
    url: `/watch/${kebab}-${r.anilistId}-episode-${r.episode ?? 1}`,
    animeId: r.id || null,
    publicId: `${kebab}-${r.anilistId ?? ''}`,
  };
};

// Home page assembled from the site's own GraphQL catalog plus the recent-
// episodes REST endpoint (same data the home page rows render).
export const getAnimexHomePage = async () => {
  const [trending, popular, latestAdded, recent] = await Promise.all([
    getAnimexCatalog({ sort: 'trending', perPage: 12 }).catch(() => ({ results: [] })),
    getAnimexCatalog({ sort: 'popular', perPage: 12 }),
    getAnimexCatalog({ sort: 'latest', perPage: 12 }),
    infoApiGet('/api/recent?page=1').catch(() => ({ results: [] })),
  ]);

  return {
    source: ANIMEX_BASE_URL,
    spotlight: trending.results.slice(0, 6),
    trending: trending.results,
    popular: popular.results,
    latestEpisode: latestAdded.results,
    recentEpisodes: (recent?.results || []).map(mapRecentItem),
    topAiring: [],
    upcoming: [],
    mostPopular: popular.results,
  };
};
