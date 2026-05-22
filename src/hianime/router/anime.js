import { Hono } from 'hono';
import { hianimeAnimeController } from '../controllers/anime.js';
import { hianimeEpisodesController } from '../controllers/episodes.js';
import { hianimeNextEpisodeController } from '../controllers/next-episode.js';

const router = new Hono();
router.get('/:animeId', hianimeAnimeController);
router.get('/:animeId/episodes', hianimeEpisodesController);
router.get('/:animeId/next-episode', hianimeNextEpisodeController);
export default router;
