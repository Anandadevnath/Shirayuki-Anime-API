import { wrapController } from './_cache.js';
import { getReanimeHomePage } from '../scraper/home.js';
import { getReanimeSearch, getReanimeSearchSuggestion } from '../scraper/search.js';
import { getReanimeAnimeDetails, getReanimeEpisodes } from '../scraper/anime.js';

export const reanimeHomeController = wrapController({
  cacheKey: () => 'home',
  handler: () => getReanimeHomePage(),
});

export const reanimeSearchController = wrapController({
  cacheKey: (c) => `search:${c.req.query('q') || ''}:${c.req.query('page') || '1'}`,
  handler: (c) => getReanimeSearch({ q: c.req.query('q'), page: c.req.query('page') }),
});

export const reanimeSearchSuggestionController = wrapController({
  cacheKey: (c) => `search-suggestion:${c.req.query('q') || ''}`,
  handler: (c) => getReanimeSearchSuggestion({ q: c.req.query('q') }),
});

export const reanimeAnimeController = wrapController({
  cacheKey: (c) => `anime:${c.req.param('animeId')}`,
  handler: (c) => getReanimeAnimeDetails({ animeId: c.req.param('animeId') }),
});

export const reanimeEpisodesController = wrapController({
  cacheKey: (c) => `episodes:${c.req.param('animeId')}:${c.req.query('page') || '1'}`,
  handler: (c) =>
    getReanimeEpisodes({ animeId: c.req.param('animeId'), page: c.req.query('page') }),
});
