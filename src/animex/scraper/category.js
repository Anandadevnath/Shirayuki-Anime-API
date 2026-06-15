import { ANIMEX_BASE_URL } from './_shared.js';
import { normalizePage } from './_anilist.js';
import { queryMediaPage } from './_list-query.js';

// Map friendly category slugs (hianime-style) to AniList media() arguments.
const CATEGORY_MAP = {
  'most-popular': { filter: 'sort: POPULARITY_DESC, type: ANIME, isAdult: false' },
  'most-favorite': { filter: 'sort: FAVOURITES_DESC, type: ANIME, isAdult: false' },
  'top-airing': { filter: 'sort: TRENDING_DESC, type: ANIME, status: RELEASING, isAdult: false' },
  'recently-updated': { filter: 'sort: UPDATED_AT_DESC, type: ANIME, isAdult: false' },
  'recently-added': { filter: 'sort: ID_DESC, type: ANIME, isAdult: false' },
  'top-upcoming': { filter: 'sort: POPULARITY_DESC, type: ANIME, status: NOT_YET_RELEASED, isAdult: false' },
  'top-rated': { filter: 'sort: SCORE_DESC, type: ANIME, isAdult: false' },
  'latest-completed': { filter: 'sort: END_DATE_DESC, type: ANIME, status: FINISHED, isAdult: false' },
  movie: { filter: 'sort: POPULARITY_DESC, type: ANIME, format: MOVIE, isAdult: false' },
  tv: { filter: 'sort: POPULARITY_DESC, type: ANIME, format: TV, isAdult: false' },
  ova: { filter: 'sort: POPULARITY_DESC, type: ANIME, format: OVA, isAdult: false' },
  ona: { filter: 'sort: POPULARITY_DESC, type: ANIME, format: ONA, isAdult: false' },
  special: { filter: 'sort: POPULARITY_DESC, type: ANIME, format: SPECIAL, isAdult: false' },
};

export const getAnimexCategory = async ({ category, page } = {}) => {
  const slug = String(category || '').trim().toLowerCase();
  if (!slug) {
    const err = new Error('category path parameter is required');
    err.status = 400;
    throw err;
  }

  const mapping = CATEGORY_MAP[slug];
  if (!mapping) {
    const err = new Error(
      `Unknown category "${slug}". Valid: ${Object.keys(CATEGORY_MAP).join(', ')}`,
    );
    err.status = 400;
    throw err;
  }

  const normalizedPage = normalizePage(page);
  const { pagination, results } = await queryMediaPage({
    filter: mapping.filter,
    variables: { page: normalizedPage },
  });

  return {
    source: `${ANIMEX_BASE_URL}/category/${slug}`,
    category: slug,
    pagination,
    results,
  };
};
