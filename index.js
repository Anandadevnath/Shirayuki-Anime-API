import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import env from "./src/config/env.js";
import anixoEpisodeSourcesRouter from "./src/anixo/router/streaming-server.js";
import anixoEpisodeServersRouter from "./src/anixo/router/episode-servers.js";
import anixoProxyRouter from "./src/anixo/router/proxy.js";
import anixoHomeRouter from "./src/anixo/router/home.js";
import anixoAzlistRouter from "./src/anixo/router/azlist.js";
import anixoAnimeRouter from "./src/anixo/router/anime.js";
import anixoSearchRouter from "./src/anixo/router/search.js";
import anixoSearchAdvancedRouter from "./src/anixo/router/search-advanced.js";
import anixoSearchSuggestionRouter from "./src/anixo/router/search-suggestion.js";
import anixoGenreRouter from "./src/anixo/router/genre.js";
import anixoCategoryRouter from "./src/anixo/router/category.js";
import anixoProducerRouter from "./src/anixo/router/producer.js";
import anixoScheduleRouter from "./src/anixo/router/schedule.js";
import animekaiListingsRouter from "./src/animekai/router/listings.js";
import animekaiEpisodeServersRouter from "./src/animekai/router/episode-servers.js";
import animekaiEpisodeSourcesRouter from "./src/animekai/router/streaming-server.js";
import animekaiProxyRouter from "./src/animekai/router/proxy.js";
import { renderLandingPage, API_CATALOG } from "./src/ui/landing.js";

const app = new Hono();

// Middleware
app.use("*", logger());
app.use("*", cors());

// Root — HTML API explorer (raw catalog available at /endpoints.json)
app.get("/", (c) => {
  c.header("Cache-Control", "no-store, no-cache, must-revalidate");
  c.header("Pragma", "no-cache");
  c.header("Expires", "0");
  return c.html(renderLandingPage());
});

app.get("/endpoints.json", (c) => {
  c.header("Cache-Control", "no-store, no-cache, must-revalidate");
  return c.json({ message: "Shirayuki-Anime-API", ...API_CATALOG });
});

// API Routes
app.route("/api/v2/anixo/episode", anixoEpisodeServersRouter);
app.route("/api/v2/anixo/episode/sources", anixoEpisodeSourcesRouter);
app.route("/api/v2/anixo/proxy", anixoProxyRouter);
app.route("/api/v2/anixo/home", anixoHomeRouter);
app.route("/api/v2/anixo/azlist", anixoAzlistRouter);
app.route("/api/v2/anixo/anime", anixoAnimeRouter);
app.route("/api/v2/anixo/search", anixoSearchRouter);
app.route("/api/v2/anixo/search/advanced", anixoSearchAdvancedRouter);
app.route("/api/v2/anixo/search/suggestion", anixoSearchSuggestionRouter);
app.route("/api/v2/anixo/genre", anixoGenreRouter);
app.route("/api/v2/anixo/producer", anixoProducerRouter);
app.route("/api/v2/anixo/category", anixoCategoryRouter);
app.route("/api/v2/anixo/schedule", anixoScheduleRouter);
app.route("/api/v2/animekai", animekaiListingsRouter);
app.route("/api/v2/animekai/episode", animekaiEpisodeServersRouter);
app.route("/api/v2/animekai/episode/sources", animekaiEpisodeSourcesRouter);
app.route("/api/v2/animekai/proxy", animekaiProxyRouter);

app.notFound((c) => {
  return c.json(
    {
      success: false,
      message: "Endpoint not found",
    },
    404,
  );
});

app.onError((err, c) => {
  console.error("Server error:", err);
  return c.json(
    {
      success: false,
      error: err.message,
    },
    500,
  );
});

const port = env.PORT;
console.log(`http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port,
});
