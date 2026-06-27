import { Hono } from 'hono';
import { nyaaStreamController } from '../controllers/stream.js';
import { nyaaStreamFileController } from '../controllers/stream-file.js';

const router = new Hono();
router.get('/', nyaaStreamController);
router.get('/file', nyaaStreamFileController);
export default router;