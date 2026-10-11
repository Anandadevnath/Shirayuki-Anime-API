import { Hono } from 'hono';
import {
  anikotoHomeController,
  anikotoSearchController,
  anikotoSearchSuggestionController,
  anikotoAnimeController,
  anikotoEpisodesController,
} from '../controllers/listings.js';

const router = new Hono();
router.get('/', anikotoHomeController);
router.get('/search', anikotoSearchController);
router.get('/search/suggestion', anikotoSearchSuggestionController);
router.get('/anime/:animeId', anikotoAnimeController);
router.get('/anime/:animeId/episodes', anikotoEpisodesController);
export default router;