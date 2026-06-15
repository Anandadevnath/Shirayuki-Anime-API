import { Hono } from 'hono';
import {
  animexAnimeController,
  animexEpisodesController,
} from '../controllers/listings.js';

const router = new Hono();
router.get('/:animeId', animexAnimeController);
router.get('/:animeId/episodes', animexEpisodesController);
export default router;
