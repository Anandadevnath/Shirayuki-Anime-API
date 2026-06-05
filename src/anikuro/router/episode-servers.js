import { Hono } from 'hono';
import { anikuroEpisodeServersController } from '../controllers/episode-servers.js';

const router = new Hono();
router.get('/servers', anikuroEpisodeServersController);
export default router;
