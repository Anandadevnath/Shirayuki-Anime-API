import { REANIME_BASE_URL, apiGet, mapAnimeCard } from '../_shared.js';

// Home is assembled entirely from the site's own public API
// (reanime.to/api/v1/home) — one call returns every home row.
export const getReanimeHomePage = async () => {
  const data = await apiGet('/home');

  const map = (list) => (Array.isArray(list) ? list.map(mapAnimeCard) : []);

  const trending = map(data?.trending);
  const latestAired = map(data?.latest_aired);
  const newOnSite = map(data?.new_on_site);
  const upcoming = map(data?.upcoming);

  return {
    source: `${REANIME_BASE_URL}/api/v1/home`,
    spotlight: trending.slice(0, 8),
    trending,
    latestAired,
    newOnSite,
    popular: trending,
    mostPopular: trending,
    topAiring: [],
    upcoming,
    recentEpisodes: latestAired,
    cursors: {
      latestAired: data?.latest_aired_cursor || null,
      newOnSite: data?.new_on_site_cursor || null,
      upcoming: data?.upcoming_cursor || null,
    },
  };
};
