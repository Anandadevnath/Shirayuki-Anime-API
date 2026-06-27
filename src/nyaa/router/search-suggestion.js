import { Hono } from 'hono';
import { nyaaSearchSuggestionController } from '../controllers/search-suggestion.js';

const router = new Hono();
router.get('/', nyaaSearchSuggestionController);
export default router;