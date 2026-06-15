import { Hono } from 'hono';
import { anixoAzListController } from '../controllers/listings.js';

const router = new Hono();
router.get('/:letter', anixoAzListController);
export default router;
