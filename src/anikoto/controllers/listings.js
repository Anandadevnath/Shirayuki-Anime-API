import { wrapController } from './_cache.js';
import { getAnikotoHomePage } from '../scraper/home.js';
import { getAnikotoSearch, getAnikotoSearchSuggestion } from '../scraper/search.js';
import { getAnikotoAnimeDetails, getAnikotoEpisodes } from '../scraper/anime.js';

export const anikotoHomeController = wrapController({
  cacheKey: () => 'home',
  handler: () => getAnikotoHomePage(),
});

export const anikotoSearchController = wrapController({
  cacheKey: (c) => `search:${c.req.query('q') || ''}:${c.req.query('page') || '1'}`,
  handler: (c) => getAnikotoSearch({ q: c.req.query('q'), page: c.req.query('page') }),
});

export const anikotoSearchSuggestionController = wrapController({
  cacheKey: (c) => `search-suggestion:${c.req.query('q') || ''}`,
  handler: (c) => getAnikotoSearchSuggestion({ q: c.req.query('q') }),
});

export const anikotoAnimeController = wrapController({
  cacheKey: (c) => `anime:${c.req.param('animeId')}`,
  handler: (c) => getAnikotoAnimeDetails({ animeId: c.req.param('animeId') }),
});

export const anikotoEpisodesController = wrapController({
  cacheKey: (c) => `episodes:${c.req.param('animeId')}`,
  handler: (c) => getAnikotoEpisodes({ animeId: c.req.param('animeId') }),
});