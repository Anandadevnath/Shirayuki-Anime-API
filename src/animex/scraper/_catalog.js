import { axios } from '../../utils/scrapper-deps.js';
import { ANIMEX_BASE_URL, DEFAULT_UA } from './_shared.js';

// animex.one's own catalog backend (the full ~20.5k-anime database, 685 pages),
// distinct from AniList: POST https://graphql.animex.one/graphql. Items carry
// anilistId/malId, so /watch + the MegaPlay streaming endpoints still resolve.
export const ANIMEX_GRAPHQL_URL = 'https://graphql.animex.one/graphql';
export const CATALOG_PER_PAGE = 30; // matches the site's catalog grid

export const CATALOG_ITEM_FIELDS = `
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
`;

const CATALOG_QUERY = `
  query CatalogAnime($filter: AnimeCatalogFilterInput, $sort: [AnimeSortInput!], $limit: Int, $offset: Int) {
    catalogAnime(filter: $filter, sort: $sort, limit: $limit, offset: $offset) {
      items { ${CATALOG_ITEM_FIELDS} }
      totalCount
      limit
      offset
      currentPage
      totalPages
      hasNextPage
      hasPreviousPage
    }
  }
`;

// POST a GraphQL query to animex's catalog API and return the `data` object.
export const animexGraphql = async (query, variables = {}) => {
  const response = await axios.post(
    ANIMEX_GRAPHQL_URL,
    { query, variables },
    {
      proxy: false,
      timeout: 20000,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Origin: ANIMEX_BASE_URL,
        Referer: `${ANIMEX_BASE_URL}/`,
        'User-Agent': DEFAULT_UA,
      },
    },
  );

  const payload = response?.data;
  if (payload?.errors?.length) {
    throw new Error(payload.errors[0]?.message || 'Animex catalog query failed');
  }

  return payload?.data || null;
};

// Normalize a catalogAnime item into the shape used across the listings. `id` is
// the AniList id (plugs into /watch + episode/sources); animexId keeps the
// catalog's own id for reference.
export const mapCatalogItem = (item) => {
  if (!item) return null;

  const id = item.anilistId ?? item.id ?? null;

  return {
    id,
    animexId: item.id ?? null,
    idMal: item.malId ?? null,
    title: item.titleEnglish || item.titleRomaji || null,
    jname: item.titleRomaji || null,
    ename: item.titleEnglish || null,
    romaji: item.titleRomaji || null,
    poster: item.coverImage || null,
    banner: item.bannerImage || item.backdropUrl || null,
    color: item.color || null,
    type: item.format || null,
    status: item.status || null,
    episodes: {
      sub: item.subCount ?? item.episodeCount ?? null,
      dub: item.dubCount ?? null,
    },
    score: item.averageScore ?? null,
    popularity: item.popularity ?? null,
    genres: Array.isArray(item.genres) ? item.genres : [],
    season: item.season || null,
    year: item.seasonYear ?? null,
    nextAiringEpisode: item.nextAiringEpisode ?? null,
    href: id ? `/watch/${id}` : null,
    url: id ? `${ANIMEX_BASE_URL}/watch/${id}` : null,
  };
};

export const mapCatalogPageInfo = (catalog = {}, fallbackPage = 1) => ({
  currentPage: catalog.currentPage ?? fallbackPage,
  hasNextPage: Boolean(catalog.hasNextPage),
  totalPages: catalog.totalPages ?? null,
  total: catalog.totalCount ?? null,
  perPage: catalog.limit ?? CATALOG_PER_PAGE,
});

// Fetch one catalog page (1-based) with optional filter/sort, mapped + paginated.
export const fetchCatalogPage = async ({ page = 1, filter, sort } = {}) => {
  const normalizedPage = Number(page) > 0 ? Number(page) : 1;
  const offset = (normalizedPage - 1) * CATALOG_PER_PAGE;

  const data = await animexGraphql(CATALOG_QUERY, {
    filter: filter ?? null,
    sort: sort ?? null,
    limit: CATALOG_PER_PAGE,
    offset,
  });

  const catalog = data?.catalogAnime || {};
  return {
    pagination: mapCatalogPageInfo(catalog, normalizedPage),
    results: (catalog.items || []).map(mapCatalogItem).filter(Boolean),
  };
};
