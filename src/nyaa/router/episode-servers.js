import { Hono } from 'hono';
import { nyaaEpisodeServersController } from '../controllers/episode-servers.js';

const router = new Hono();
router.get('/servers', nyaaEpisodeServersController);
export default router;