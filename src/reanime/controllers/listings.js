import { wrapController } from './_cache.js';
import { getReanimeHomePage } from '../scraper/home.js';
import {
  getReanimeSearch,
  getReanimeSearchSuggestion,
  getReanimeCatalog,
  getReanimeGenre,
} from '../scraper/search.js';
import { getReanimeSchedule } from '../scraper/schedule.js';
import {
  getReanimeAnimeDetails,
  getReanimeEpisodes,
  getReanimeCharacters,
  getReanimeArtists,
  getReanimeArt,
  getReanimeSeasons,
  getReanimeRelations,
} from '../scraper/anime.js';

export const reanimeHomeController = wrapController({
  cacheKey: () => 'home',
  handler: () => getReanimeHomePage(),
});

export const reanimeScheduleController = wrapController({
  cacheKey: () => 'schedule',
  handler: () => getReanimeSchedule(),
});

export const reanimeCatalogController = wrapController({
  cacheKey: (c) =>
    `catalog:${c.req.query('page') || '1'}:${c.req.query('perPage') || '20'}:${
      c.req.query('format') || ''
    }:${c.req.query('status') || ''}:${c.req.query('season') || ''}:${c.req.query('year') || ''}`,
  handler: (c) =>
    getReanimeCatalog({
      page: c.req.query('page'),
      perPage: c.req.query('perPage'),
      format: c.req.query('format'),
      status: c.req.query('status'),
      season: c.req.query('season'),
      year: c.req.query('year'),
    }),
});

export const reanimeGenreController = wrapController({
  cacheKey: (c) => `genre:${c.req.param('genre')}:${c.req.query('page') || '1'}`,
  handler: (c) =>
    getReanimeGenre({ genre: c.req.param('genre'), page: c.req.query('page') }),
});

export const reanimeSearchController = wrapController({
  cacheKey: (c) =>
    `search:${c.req.query('q') || ''}:${c.req.query('page') || '1'}:${
      c.req.query('format') || ''
    }:${c.req.query('status') || ''}:${c.req.query('season') || ''}:${
      c.req.query('year') || ''
    }:${c.req.query('genre') || ''}`,
  handler: (c) =>
    getReanimeSearch({
      q: c.req.query('q'),
      page: c.req.query('page'),
      filters: {
        format: c.req.query('format'),
        status: c.req.query('status'),
        season: c.req.query('season'),
        year: c.req.query('year'),
        genre: c.req.query('genre'),
      },
    }),
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

export const reanimeCharactersController = wrapController({
  cacheKey: (c) => `characters:${c.req.param('animeId')}`,
  handler: (c) => getReanimeCharacters({ animeId: c.req.param('animeId') }),
});

export const reanimeArtistsController = wrapController({
  cacheKey: (c) => `artists:${c.req.param('animeId')}`,
  handler: (c) => getReanimeArtists({ animeId: c.req.param('animeId') }),
});

export const reanimeArtController = wrapController({
  cacheKey: (c) => `art:${c.req.param('animeId')}`,
  handler: (c) => getReanimeArt({ animeId: c.req.param('animeId') }),
});

export const reanimeSeasonsController = wrapController({
  cacheKey: (c) => `seasons:${c.req.param('animeId')}`,
  handler: (c) => getReanimeSeasons({ animeId: c.req.param('animeId') }),
});

export const reanimeRelationsController = wrapController({
  cacheKey: (c) => `relations:${c.req.param('animeId')}`,
  handler: (c) => getReanimeRelations({ animeId: c.req.param('animeId') }),
});
