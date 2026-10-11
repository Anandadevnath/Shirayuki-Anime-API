import { Hono } from 'hono';
import { anikotoEpisodeServersController } from '../controllers/episode-servers.js';

const router = new Hono();
router.get('/servers', anikotoEpisodeServersController);
export default router;