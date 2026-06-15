import { ANIXO_BASE_URL } from './_shared.js';
import {
  anilistQuery,
  MEDIA_FRAGMENT,
  mapMediaList,
  mapPageInfo,
  normalizePage,
} from './_anilist.js';

// Anixo's /browse paginates the full catalogue at perPage 30, sort
// POPULARITY_DESC (5000 cap -> 166 pages). The azlist endpoint mirrors that grid
// exactly: the `letter` path param is accepted for compatibility but does NOT
// filter — every letter returns the same full 166-page catalogue, since a single
// letter is only a small slice and could never fill 166 pages of its own.
const PER_PAGE = 30;

const PAGE_QUERY = `
  query AnixoAz($page: Int) {
    Page(page: $page, perPage: ${PER_PAGE}) {
      pageInfo { currentPage hasNextPage lastPage total perPage }
      media(sort: POPULARITY_DESC, type: ANIME, isAdult: false) { ...media }
    }
  }
  fragment media on Media { ${MEDIA_FRAGMENT} }
`;

export const getAnixoAzList = async ({ letter, page } = {}) => {
  const raw = String(letter || '').trim();
  if (!raw) {
    const err = new Error('letter path parameter is required');
    err.status = 400;
    throw err;
  }

  const normalizedPage = normalizePage(page);
  const data = await anilistQuery(PAGE_QUERY, { page: normalizedPage });

  return {
    source: `${ANIXO_BASE_URL}/browse?page=${normalizedPage}`,
    letter: raw,
    pagination: mapPageInfo(data?.Page?.pageInfo),
    results: mapMediaList(data?.Page?.media || []),
  };
};
