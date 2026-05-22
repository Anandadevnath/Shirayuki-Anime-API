import { Hono } from 'hono';
import { hianimeScheduleController } from '../controllers/schedule.js';

const router = new Hono();
router.get('/', hianimeScheduleController);
export default router;
