import { Hono } from 'hono';
import { anixoEpisodeServersController } from '../controllers/episode-servers.js';

const router = new Hono();
router.get('/servers', anixoEpisodeServersController);
export default router;
