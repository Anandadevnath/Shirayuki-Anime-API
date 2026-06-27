import { Hono } from 'hono';
import { nyaaAnimeController } from '../controllers/anime.js';

const router = new Hono();
router.get('/:id', nyaaAnimeController);
export default router;