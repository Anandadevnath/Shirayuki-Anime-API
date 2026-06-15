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

const app = new Hono();

// Middleware
app.use("*", logger());
app.use("*", cors());

// Root
app.get("/", (c) => {
  return c.json({
    message: "Shirayuki-Anime-API",
    endpoints: {
      hianime: {
        home: "/api/v2/hianime/home",
        azlist: "/api/v2/hianime/azlist/A?page=1",
        animeDetails: "/api/v2/hianime/anime/one-piece",
        animeEpisodes: "/api/v2/hianime/anime/one-piece/episodes",
        search: {
          basic: "/api/v2/hianime/search?q=naruto&page=1",
          advanced:
            "/api/v2/hianime/search/advanced?q=naruto&type=tv&genres=action&page=1",
          suggestion: "/api/v2/hianime/search/suggestion?q=naruto",
        },
        discover: {
          producer: "/api/v2/hianime/producer/toei-animation?page=1",
          genre: "/api/v2/hianime/genre/action?page=1",
          category: "/api/v2/hianime/category/most-popular?page=1",
          schedule: "/api/v2/hianime/schedule?date=2026-05-22&timezone=UTC",
        },
        episode: {
          servers:
            "/api/v2/hianime/episode/servers?animeEpisodeId=one-piece&ep=1",
          sources:
            "/api/v2/hianime/episode/sources?animeEpisodeId=one-piece&ep=1&server=hd-1&category=sub",
        },
      },
      anikuro: {
        episode: {
          servers: "/api/v2/anikuro/episode/servers?animeEpisodeId=180745&ep=1",
          sources:
            "/api/v2/anikuro/episode/sources?animeEpisodeId=199221:1&server=anikoto&category=dub",
        },
      },
      anixo: {
        home: "/api/v2/anixo/home",
        azlist: "/api/v2/anixo/azlist/A?page=1",
        animeDetails: "/api/v2/anixo/anime/21",
        animeEpisodes: "/api/v2/anixo/anime/21/episodes",
        search: {
          basic: "/api/v2/anixo/search?q=naruto&page=1",
          advanced:
            "/api/v2/anixo/search/advanced?q=naruto&type=tv&genres=action&page=1",
          suggestion: "/api/v2/anixo/search/suggestion?q=naruto",
        },
        discover: {
          producer: "/api/v2/anixo/producer/toei-animation?page=1",
          genre: "/api/v2/anixo/genre/action?page=1",
          category: "/api/v2/anixo/category/most-popular?page=1",
          schedule: "/api/v2/anixo/schedule?date=2026-05-22&timezone=UTC",
        },
        episode: {
          servers: "/api/v2/anixo/episode/servers?animeEpisodeId=21&ep=1",
          sources:
            "/api/v2/anixo/episode/sources?animeEpisodeId=21&ep=1&server=megaplay&category=sub",
        },
      },
      animex: {
        episode: {
          servers: "/api/v2/animex/episode/servers?animeEpisodeId=21&ep=1",
          sources:
            "/api/v2/animex/episode/sources?animeEpisodeId=21&ep=1&server=megaplay&category=sub",
        },
      },
    },
  });
});

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
