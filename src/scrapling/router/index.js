import { Hono } from "hono";
import { scraplingFetchController } from "../controllers/fetch.js";

const router = new Hono();

router.get("/fetch", scraplingFetchController);

export default router;
