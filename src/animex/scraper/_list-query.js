import {
  anilistQuery,
  MEDIA_FRAGMENT,
  mapMediaList,
  mapPageInfo,
} from './_anilist.js';

// Generic paginated media query. `filter` is a GraphQL argument string injected
// into media(...), e.g. `search: $search, genre_in: $genres`. `variables` must
// supply matching values plus `page`.
export const queryMediaPage = async ({ filter, variables, perPage = 24, varDefs = '' }) => {
  const query = `
    query AnimexList($page: Int${varDefs ? `, ${varDefs}` : ''}) {
      Page(page: $page, perPage: ${perPage}) {
        pageInfo { currentPage hasNextPage lastPage total perPage }
        media(${filter}) { ...media }
      }
    }
    fragment media on Media { ${MEDIA_FRAGMENT} }
  `;

  const data = await anilistQuery(query, variables);

  return {
    pagination: mapPageInfo(data?.Page?.pageInfo),
    results: mapMediaList(data?.Page?.media),
  };
};
