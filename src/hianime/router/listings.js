import { Hono } from 'hono';
import {
  hianimeHomeController,
  hianimeScheduleController,
  hianimeBrowseController,
  hianimeGenreController,
  hianimeSearchController,
  hianimeSearchSuggestionController,
  hianimeAnimeController,
  hianimeEpisodesController,
  hianimeSeasonsController,
  hianimeCharactersController,
  hianimeArtistsController,
  hianimeArtController,
} from '../controllers/listings.js';

const router = new Hono();
router.get('/', hianimeHomeController);
router.get('/schedule', hianimeScheduleController);
router.get('/browse/:category', hianimeBrowseController);
router.get('/genre/:genre', hianimeGenreController);
router.get('/search', hianimeSearchController);
router.get('/search/suggestion', hianimeSearchSuggestionController);
router.get('/anime/:animeId', hianimeAnimeController);
router.get('/anime/:animeId/episodes', hianimeEpisodesController);
router.get('/anime/:animeId/seasons', hianimeSeasonsController);
router.get('/anime/:animeId/characters', hianimeCharactersController);
router.get('/anime/:animeId/artists', hianimeArtistsController);
router.get('/anime/:animeId/art', hianimeArtController);
export default router;
