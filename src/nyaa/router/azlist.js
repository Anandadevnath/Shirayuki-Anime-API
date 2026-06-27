import { Hono } from 'hono';
import { nyaaAzlistController } from '../controllers/azlist.js';

const router = new Hono();
router.get('/:letter', nyaaAzlistController);
export default router;
