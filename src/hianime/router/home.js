import { Hono } from 'hono';
import { hianimeHomeController } from '../controllers/home.js';

const router = new Hono();
router.get('/', hianimeHomeController);
export default router;
