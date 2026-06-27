import { Hono } from 'hono';
import { nyaaAnimeController } from '../controllers/anime.js';
import { nyaaEpisodesController } from '../controllers/episodes.js';

const router = new Hono();
router.get('/:id', nyaaAnimeController);
router.get('/:animeId/episodes', nyaaEpisodesController);
export default router;
