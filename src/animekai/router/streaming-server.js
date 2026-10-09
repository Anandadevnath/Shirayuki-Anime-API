import { Hono } from 'hono';
import { animekaiEpisodeSourcesController } from '../controllers/episode-sources.js';

const router = new Hono();
router.get('/', animekaiEpisodeSourcesController);
export default router;
