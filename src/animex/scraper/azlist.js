import { ANIMEX_BASE_URL } from './_shared.js';
import { fetchCatalogPage } from './_catalog.js';

// animex.one's /catalog grid is its own full database (~20.5k anime, 685 pages
// at 30/page) served from graphql.animex.one — NOT AniList (which caps at 5000
// = 166 pages). We mirror it exactly via the catalog API. The `letter` path
// param is accepted for compatibility but does not filter: a single letter is a
// small slice and could never fill 685 pages, and the catalog API has no
// starts-with filter. Use this endpoint as the browse/catalogue grid.
export const getAnimexAzList = async ({ letter, page } = {}) => {
  const raw = String(letter || '').trim();
  if (!raw) {
    const err = new Error('letter path parameter is required');
    err.status = 400;
    throw err;
  }

  const normalizedPage = Number(page) > 0 ? Number(page) : 1;
  const { pagination, results } = await fetchCatalogPage({ page: normalizedPage });

  return {
    source: `${ANIMEX_BASE_URL}/catalog?page=${normalizedPage}`,
    letter: raw,
    pagination,
    results,
  };
};
