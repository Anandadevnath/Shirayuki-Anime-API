import { Hono } from 'hono';
import { anixoProducerController } from '../controllers/listings.js';

const router = new Hono();
router.get('/:producer', anixoProducerController);
export default router;
