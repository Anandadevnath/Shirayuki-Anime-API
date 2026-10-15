import { wrapController } from './_cache.js';
import { getHianimeHomePage } from '../scraper/home.js';
import { getHianimeSchedule } from '../scraper/schedule.js';
import { getHianimeSearch, getHianimeBrowse, getHianimeGenre } from '../scraper/search.js';
import { getHianimeSearchSuggestion } from '../scraper/search-suggestion.js';
import { getHianimeAnimeDetails, getHianimeEpisodes } from '../scraper/anime.js';
import { getHianimeSeasons } from '../scraper/seasons.js';
import { getHianimeCharacters } from '../scraper/characters.js';
import { getHianimeArtists } from '../scraper/artists.js';
import { getHianimeArt } from '../scraper/art.js';

export const hianimeHomeController = wrapController({
  cacheKey: () => 'home',
  handler: () => getHianimeHomePage(),
});

export const hianimeScheduleController = wrapController({
  cacheKey: () => 'schedule',
  handler: () => getHianimeSchedule(),
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

export const hianimeSeasonsController = wrapController({
  cacheKey: (c) => `seasons:${c.req.param('animeId')}`,
  handler: (c) => getHianimeSeasons({ animeId: c.req.param('animeId') }),
});

export const hianimeCharactersController = wrapController({
  cacheKey: (c) => `characters:${c.req.param('animeId')}:${c.req.query('limit') || ''}`,
  handler: (c) =>
    getHianimeCharacters({ animeId: c.req.param('animeId'), limit: c.req.query('limit') }),
});

export const hianimeArtistsController = wrapController({
  cacheKey: (c) => `artists:${c.req.param('animeId')}`,
  handler: (c) => getHianimeArtists({ animeId: c.req.param('animeId') }),
});

export const hianimeArtController = wrapController({
  cacheKey: (c) =>
    `art:${c.req.param('animeId')}:${c.req.query('charLimit') || ''}:${c.req.query('artLimit') || ''}`,
  handler: (c) =>
    getHianimeArt({
      animeId: c.req.param('animeId'),
      charactersLimit: c.req.query('charLimit'),
      artLimit: c.req.query('artLimit'),
    }),
});
