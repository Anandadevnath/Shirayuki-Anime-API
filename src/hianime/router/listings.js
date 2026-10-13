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
export default router;
