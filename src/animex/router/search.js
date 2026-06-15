import { Hono } from 'hono';
import { animexSearchController } from '../controllers/listings.js';

const router = new Hono();
router.get('/', animexSearchController);
export default router;
