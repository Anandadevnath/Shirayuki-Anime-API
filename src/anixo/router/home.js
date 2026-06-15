import { Hono } from 'hono';
import { anixoHomeController } from '../controllers/listings.js';

const router = new Hono();
router.get('/', anixoHomeController);
export default router;
