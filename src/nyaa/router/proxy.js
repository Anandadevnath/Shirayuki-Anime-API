import { Hono } from 'hono';
import { nyaaProxyController } from '../controllers/proxy.js';

const router = new Hono();
router.get('/', nyaaProxyController);
export default router;
