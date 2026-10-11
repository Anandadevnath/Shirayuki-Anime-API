import { Hono } from 'hono';
import { anikotoEpisodeSourcesController } from '../controllers/episode-sources.js';

const router = new Hono();
router.get('/', anikotoEpisodeSourcesController);
export default router;