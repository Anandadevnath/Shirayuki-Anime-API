import { Hono } from 'hono';
import { nyaaEpisodeSourcesController } from '../controllers/episode-sources.js';

const router = new Hono();
router.get('/', nyaaEpisodeSourcesController);
export default router;