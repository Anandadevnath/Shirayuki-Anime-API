import { Hono } from 'hono';
import { animexAzListController } from '../controllers/listings.js';

const router = new Hono();
router.get('/:letter', animexAzListController);
export default router;
