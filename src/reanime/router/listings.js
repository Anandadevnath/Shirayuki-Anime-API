import { Hono } from 'hono';
import {
  reanimeHomeController,
  reanimeSearchController,
  reanimeSearchSuggestionController,
  reanimeAnimeController,
  reanimeEpisodesController,
} from '../controllers/listings.js';

const router = new Hono();
router.get('/', reanimeHomeController);
router.get('/home', reanimeHomeController);
router.get('/search', reanimeSearchController);
router.get('/search/suggestion', reanimeSearchSuggestionController);
router.get('/anime/:animeId', reanimeAnimeController);
router.get('/anime/:animeId/episodes', reanimeEpisodesController);
export default router;
