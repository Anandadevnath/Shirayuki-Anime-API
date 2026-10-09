import { Hono } from 'hono';
import {
  animekaiHomeController,
  animekaiAzListController,
  animekaiSearchController,
  animekaiSearchAdvancedController,
  animekaiSearchSuggestionController,
  animekaiAnimeController,
  animekaiEpisodesController,
  animekaiScheduleController,
} from '../controllers/listings.js';

const router = new Hono();
router.get('/', animekaiHomeController);
router.get('/azlist/:letter', animekaiAzListController);
router.get('/search', animekaiSearchController);
router.get('/search/advanced', animekaiSearchAdvancedController);
router.get('/search/suggestion', animekaiSearchSuggestionController);
router.get('/anime/:animeId', animekaiAnimeController);
router.get('/anime/:animeId/episodes', animekaiEpisodesController);
router.get('/schedule', animekaiScheduleController);
export default router;
