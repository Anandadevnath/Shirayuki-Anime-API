import { Hono } from 'hono';
import { nyaaHomeController } from '../controllers/home.js';

const router = new Hono();
router.get('/', nyaaHomeController);
export default router;