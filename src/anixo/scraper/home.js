import { ANIXO_BASE_URL } from './_shared.js';
import { anilistQuery, MEDIA_FRAGMENT, mapMediaList } from './_anilist.js';

const currentSeason = () => {
  // Months are 0-indexed; AniList seasons: WINTER(Dec-Feb) SPRING(Mar-May) SUMMER(Jun-Aug) FALL(Sep-Nov)
  const month = new Date().getUTCMonth() + 1;
  const year = new Date().getUTCFullYear();
  if (month === 12) return { season: 'WINTER', seasonYear: year + 1 };
  if (month <= 2) return { season: 'WINTER', seasonYear: year };
  if (month <= 5) return { season: 'SPRING', seasonYear: year };
  if (month <= 8) return { season: 'SUMMER', seasonYear: year };
  return { season: 'FALL', seasonYear: year };
};

const HOME_QUERY = `
  query AnixoHome($season: MediaSeason, $seasonYear: Int) {
    trending: Page(page: 1, perPage: 24) {
      media(sort: TRENDING_DESC, type: ANIME, isAdult: false) { ...media }
    }
    popular: Page(page: 1, perPage: 24) {
      media(sort: POPULARITY_DESC, type: ANIME, isAdult: false) { ...media }
    }
    topRated: Page(page: 1, perPage: 24) {
      media(sort: SCORE_DESC, type: ANIME, isAdult: false) { ...media }
    }
    topAiring: Page(page: 1, perPage: 24) {
      media(sort: TRENDING_DESC, type: ANIME, status: RELEASING, isAdult: false) { ...media }
    }
    seasonal: Page(page: 1, perPage: 24) {
      media(season: $season, seasonYear: $seasonYear, sort: POPULARITY_DESC, type: ANIME, isAdult: false) { ...media }
    }
    upcoming: Page(page: 1, perPage: 24) {
      media(sort: POPULARITY_DESC, type: ANIME, status: NOT_YET_RELEASED, isAdult: false) { ...media }
    }
  }
  fragment media on Media { ${MEDIA_FRAGMENT} }
`;

export const getAnixoHomePage = async () => {
  const { season, seasonYear } = currentSeason();
  const data = await anilistQuery(HOME_QUERY, { season, seasonYear });

  const trending = mapMediaList(data?.trending?.media);

  return {
    source: `${ANIXO_BASE_URL}/`,
    spotlight: trending.slice(0, 10),
    trending,
    topAiring: mapMediaList(data?.topAiring?.media),
    mostPopular: mapMediaList(data?.popular?.media),
    topRated: mapMediaList(data?.topRated?.media),
    seasonal: {
      season,
      year: seasonYear,
      results: mapMediaList(data?.seasonal?.media),
    },
    upcoming: mapMediaList(data?.upcoming?.media),
  };
};
