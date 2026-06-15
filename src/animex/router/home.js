import { Hono } from 'hono';
import { animexHomeController } from '../controllers/listings.js';

const router = new Hono();
router.get('/', animexHomeController);
export default router;
