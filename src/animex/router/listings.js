import { Hono } from 'hono';
import {
  animexHomeController,
  animexCatalogController,
  animexSearchController,
  animexSearchSuggestionController,
  animexAnimeController,
  animexEpisodesController,
} from '../controllers/listings.js';

const router = new Hono();
router.get('/', animexHomeController);
router.get('/catalog', animexCatalogController);
router.get('/search', animexSearchController);
router.get('/search/suggestion', animexSearchSuggestionController);
router.get('/anime/:animeId', animexAnimeController);
router.get('/anime/:animeId/episodes', animexEpisodesController);
export default router;
