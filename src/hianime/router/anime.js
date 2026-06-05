import { Hono } from "hono";
import { hianimeAnimeController } from "../controllers/anime.js";
import { hianimeEpisodesController } from "../controllers/episodes.js";

const router = new Hono();
router.get("/:animeId", hianimeAnimeController);
router.get("/:animeId/episodes", hianimeEpisodesController);
export default router;
