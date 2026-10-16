import { Hono } from 'hono';
import {
  reanimeHomeController,
  reanimeScheduleController,
  reanimeCatalogController,
  reanimeGenreController,
  reanimeSearchController,
  reanimeSearchSuggestionController,
  reanimeAnimeController,
  reanimeEpisodesController,
  reanimeCharactersController,
  reanimeArtistsController,
  reanimeArtController,
  reanimeSeasonsController,
  reanimeRelationsController,
} from '../controllers/listings.js';

const router = new Hono();
router.get('/', reanimeHomeController);
router.get('/home', reanimeHomeController);
router.get('/schedule', reanimeScheduleController);
router.get('/catalog', reanimeCatalogController);
router.get('/genre/:genre', reanimeGenreController);
router.get('/search', reanimeSearchController);
router.get('/search/suggestion', reanimeSearchSuggestionController);
router.get('/anime/:animeId', reanimeAnimeController);
router.get('/anime/:animeId/episodes', reanimeEpisodesController);
router.get('/anime/:animeId/seasons', reanimeSeasonsController);
router.get('/anime/:animeId/relations', reanimeRelationsController);
router.get('/anime/:animeId/characters', reanimeCharactersController);
router.get('/anime/:animeId/artists', reanimeArtistsController);
router.get('/anime/:animeId/art', reanimeArtController);
export default router;
