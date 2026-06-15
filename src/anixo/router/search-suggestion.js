import { Hono } from 'hono';
import { anixoSearchSuggestionController } from '../controllers/listings.js';

const router = new Hono();
router.get('/', anixoSearchSuggestionController);
export default router;
