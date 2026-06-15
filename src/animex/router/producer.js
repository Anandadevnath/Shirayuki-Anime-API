import { Hono } from 'hono';
import { animexProducerController } from '../controllers/listings.js';

const router = new Hono();
router.get('/:producer', animexProducerController);
export default router;
