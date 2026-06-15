import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import env from "./src/config/env.js";
import hianimeEpisodeSourcesRouter from "./src/hianime/router/streaming-server.js";
import hianimeHomeRouter from "./src/hianime/router/home.js";
import hianimeAzlistRouter from "./src/hianime/router/azlist.js";
import hianimeAnimeRouter from "./src/hianime/router/anime.js";
import hianimeSearchRouter from "./src/hianime/router/search.js";
import hianimeSearchAdvancedRouter from "./src/hianime/router/search-advanced.js";
import hianimeSearchSuggestionRouter from "./src/hianime/router/search-suggestion.js";
import hianimeGenreRouter from "./src/hianime/router/genre.js";
import hianimeCategoryRouter from "./src/hianime/router/category.js";
import hianimeProducerRouter from "./src/hianime/router/producer.js";
import hianimeScheduleRouter from "./src/hianime/router/schedule.js";
import hianimeEpisodeServersRouter from "./src/hianime/router/episode-servers.js";
import anikuroEpisodeSourcesRouter from "./src/anikuro/router/streaming-server.js";
import anikuroEpisodeServersRouter from "./src/anikuro/router/episode-servers.js";
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
import animexEpisodeSourcesRouter from "./src/animex/router/streaming-server.js";
import animexEpisodeServersRouter from "./src/animex/router/episode-servers.js";
import animexProxyRouter from "./src/animex/router/proxy.js";
import animexHomeRouter from "./src/animex/router/home.js";
import animexAzlistRouter from "./src/animex/router/azlist.js";
import animexAnimeRouter from "./src/animex/router/anime.js";
import animexSearchRouter from "./src/animex/router/search.js";
import animexSearchAdvancedRouter from "./src/animex/router/search-advanced.js";
import animexSearchSuggestionRouter from "./src/animex/router/search-suggestion.js";
import animexGenreRouter from "./src/animex/router/genre.js";
import animexCategoryRouter from "./src/animex/router/category.js";
import animexProducerRouter from "./src/animex/router/producer.js";
import animexScheduleRouter from "./src/animex/router/schedule.js";
import { renderLandingPage, API_CATALOG } from "./src/ui/landing.js";

const app = new Hono();

// Middleware
app.use("*", logger());
app.use("*", cors());

// Root — HTML API explorer (raw catalog available at /endpoints.json)
app.get("/", (c) => c.html(renderLandingPage()));

app.get("/endpoints.json", (c) =>
  c.json({ message: "Shirayuki-Anime-API", ...API_CATALOG }),
);

// API Routes
app.route("/api/v2/hianime/home", hianimeHomeRouter);
app.route("/api/v2/hianime/azlist", hianimeAzlistRouter);
app.route("/api/v2/hianime/anime", hianimeAnimeRouter);
app.route("/api/v2/hianime/search", hianimeSearchRouter);
app.route("/api/v2/hianime/search/advanced", hianimeSearchAdvancedRouter);
app.route("/api/v2/hianime/search/suggestion", hianimeSearchSuggestionRouter);
app.route("/api/v2/hianime/genre", hianimeGenreRouter);
app.route("/api/v2/hianime/producer", hianimeProducerRouter);
app.route("/api/v2/hianime/category", hianimeCategoryRouter);
app.route("/api/v2/hianime/schedule", hianimeScheduleRouter);
app.route("/api/v2/hianime/episode", hianimeEpisodeServersRouter);
app.route("/api/v2/hianime/episode/sources", hianimeEpisodeSourcesRouter);
app.route("/api/v2/anikuro/episode", anikuroEpisodeServersRouter);
app.route("/api/v2/anikuro/episode/sources", anikuroEpisodeSourcesRouter);
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
app.route("/api/v2/animex/episode", animexEpisodeServersRouter);
app.route("/api/v2/animex/episode/sources", animexEpisodeSourcesRouter);
app.route("/api/v2/animex/proxy", animexProxyRouter);
app.route("/api/v2/animex/home", animexHomeRouter);
app.route("/api/v2/animex/azlist", animexAzlistRouter);
app.route("/api/v2/animex/anime", animexAnimeRouter);
app.route("/api/v2/animex/search", animexSearchRouter);
app.route("/api/v2/animex/search/advanced", animexSearchAdvancedRouter);
app.route("/api/v2/animex/search/suggestion", animexSearchSuggestionRouter);
app.route("/api/v2/animex/genre", animexGenreRouter);
app.route("/api/v2/animex/producer", animexProducerRouter);
app.route("/api/v2/animex/category", animexCategoryRouter);
app.route("/api/v2/animex/schedule", animexScheduleRouter);

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
