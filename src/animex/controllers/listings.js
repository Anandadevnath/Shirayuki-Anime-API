import { wrapController } from './_cache.js';
import { getAnimexHomePage } from '../scraper/home.js';
import { getAnimexSearch, getAnimexSearchSuggestion } from '../scraper/search.js';
import { getAnimexAnimeDetails, getAnimexEpisodes } from '../scraper/anime.js';

export const animexHomeController = wrapController({
  cacheKey: () => 'home',
  handler: () => getAnimexHomePage(),
});

export const animexSearchController = wrapController({
  cacheKey: (c) => `search:${c.req.query('q') || ''}:${c.req.query('page') || '1'}`,
  handler: (c) => getAnimexSearch({ q: c.req.query('q'), page: c.req.query('page') }),
});

export const animexSearchSuggestionController = wrapController({
  cacheKey: (c) => `search-suggestion:${c.req.query('q') || ''}`,
  handler: (c) => getAnimexSearchSuggestion({ q: c.req.query('q') }),
});

export const animexAnimeController = wrapController({
  cacheKey: (c) => `anime:${c.req.param('animeId')}`,
  handler: (c) => getAnimexAnimeDetails({ animeId: c.req.param('animeId') }),
});

export const animexEpisodesController = wrapController({
  cacheKey: (c) => `episodes:${c.req.param('animeId')}`,
  handler: (c) => getAnimexEpisodes({ animeId: c.req.param('animeId') }),
});
