import { Hono } from 'hono';
import { hianimeAzlistController } from '../controllers/azlist.js';

const router = new Hono();
router.get('/:letter', hianimeAzlistController);
export default router;
