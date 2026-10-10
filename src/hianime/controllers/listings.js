import { wrapController } from './_cache.js';
import { getHianimeHomePage } from '../scraper/home.js';
import { getHianimeSearch, getHianimeBrowse, getHianimeGenre } from '../scraper/search.js';
import { getHianimeSearchSuggestion } from '../scraper/search-suggestion.js';
import { getHianimeAnimeDetails, getHianimeEpisodes } from '../scraper/anime.js';

export const hianimeHomeController = wrapController({
  cacheKey: () => 'home',
  handler: () => getHianimeHomePage(),
});

export const hianimeBrowseController = wrapController({
  cacheKey: (c) => `browse:${c.req.param('category')}:${c.req.query('page') || '1'}`,
  handler: (c) => getHianimeBrowse({ category: c.req.param('category'), page: c.req.query('page') }),
});

export const hianimeGenreController = wrapController({
  cacheKey: (c) => `genre:${c.req.param('genre')}:${c.req.query('page') || '1'}`,
  handler: (c) => getHianimeGenre({ genre: c.req.param('genre'), page: c.req.query('page') }),
});

export const hianimeSearchController = wrapController({
  cacheKey: (c) => `search:${c.req.query('q') || ''}:${c.req.query('page') || '1'}`,
  handler: (c) => getHianimeSearch({ q: c.req.query('q'), page: c.req.query('page') }),
});

export const hianimeSearchSuggestionController = wrapController({
  cacheKey: (c) => `search-suggestion:${c.req.query('q') || ''}`,
  handler: (c) => getHianimeSearchSuggestion({ q: c.req.query('q') }),
});

export const hianimeAnimeController = wrapController({
  cacheKey: (c) => `anime:${c.req.param('animeId')}`,
  handler: (c) => getHianimeAnimeDetails({ animeId: c.req.param('animeId') }),
});

export const hianimeEpisodesController = wrapController({
  cacheKey: (c) => `episodes:${c.req.param('animeId')}`,
  handler: (c) => getHianimeEpisodes({ animeId: c.req.param('animeId') }),
});
