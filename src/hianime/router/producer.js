import { Hono } from 'hono';
import { hianimeProducerController } from '../controllers/producer.js';

const router = new Hono();
router.get('/:producer', hianimeProducerController);
export default router;
