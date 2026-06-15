import { Hono } from 'hono';
import {
  anixoAnimeController,
  anixoEpisodesController,
} from '../controllers/listings.js';

const router = new Hono();
router.get('/:animeId', anixoAnimeController);
router.get('/:animeId/episodes', anixoEpisodesController);
export default router;
