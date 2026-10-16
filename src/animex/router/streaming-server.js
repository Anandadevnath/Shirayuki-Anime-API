import { Hono } from 'hono';
import { animexEpisodeSourcesController } from '../controllers/episode-sources.js';

const router = new Hono();
router.get('/', animexEpisodeSourcesController);
export default router;
