import { Hono } from 'hono';
import { anixoScheduleController } from '../controllers/listings.js';

const router = new Hono();
router.get('/', anixoScheduleController);
export default router;
