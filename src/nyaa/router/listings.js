import { Hono } from 'hono';
import {
  nyaaHomeController,
  nyaaScheduleController,
  nyaaBrowseController,
  nyaaGenreController,
  nyaaSearchController,
  nyaaSearchSuggestionController,
  nyaaAnimeController,
  nyaaEpisodesController,
  nyaaTorrentsController,
} from '../controllers/listings.js';

const router = new Hono();
router.get('/', nyaaHomeController);
router.get('/schedule', nyaaScheduleController);
router.get('/browse/:category', nyaaBrowseController);
router.get('/genre/:genre', nyaaGenreController);
router.get('/search', nyaaSearchController);
router.get('/search/suggestion', nyaaSearchSuggestionController);
router.get('/anime/:animeId', nyaaAnimeController);
router.get('/anime/:animeId/episodes', nyaaEpisodesController);
router.get('/torrents', nyaaTorrentsController);
export default router;
