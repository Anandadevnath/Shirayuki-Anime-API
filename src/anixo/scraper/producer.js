import { ANIXO_BASE_URL } from './_shared.js';
import {
  anilistQuery,
  MEDIA_FRAGMENT,
  mapMediaList,
  mapPageInfo,
  normalizePage,
} from './_anilist.js';

// Slug -> studio search term, e.g. "toei-animation" -> "Toei Animation".
const slugToName = (slug) =>
  String(slug || '')
    .trim()
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase());

const PRODUCER_QUERY = `
  query AnixoProducer($search: String, $page: Int) {
    Studio(search: $search) {
      id
      name
      isAnimationStudio
      media(sort: POPULARITY_DESC, page: $page, perPage: 24) {
        pageInfo { currentPage hasNextPage lastPage total perPage }
        nodes { ...media }
      }
    }
  }
  fragment media on Media { ${MEDIA_FRAGMENT} }
`;

export const getAnixoProducer = async ({ producer, page } = {}) => {
  const slug = String(producer || '').trim();
  if (!slug) {
    const err = new Error('producer path parameter is required');
    err.status = 400;
    throw err;
  }

  const name = slugToName(slug);
  const normalizedPage = normalizePage(page);
  const data = await anilistQuery(PRODUCER_QUERY, { search: name, page: normalizedPage });

  const studio = data?.Studio;
  if (!studio) {
    const err = new Error(`No producer/studio found for "${name}"`);
    err.status = 404;
    throw err;
  }

  return {
    source: `${ANIXO_BASE_URL}/producer/${slug}`,
    producer: {
      id: studio.id,
      name: studio.name,
      slug,
      isAnimationStudio: Boolean(studio.isAnimationStudio),
    },
    pagination: mapPageInfo(studio.media?.pageInfo),
    results: mapMediaList(studio.media?.nodes),
  };
};
