import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import env from "./src/config/env.js";
import anikotoListingsRouter from "./src/anikoto/router/listings.js";
import anikotoEpisodeServersRouter from "./src/anikoto/router/episode-servers.js";
import anikotoEpisodeSourcesRouter from "./src/anikoto/router/streaming-server.js";
import anikotoProxyRouter from "./src/anikoto/router/proxy.js";
import animexListingsRouter from "./src/animex/router/listings.js";
import animexEpisodeServersRouter from "./src/animex/router/episode-servers.js";
import animexEpisodeSourcesRouter from "./src/animex/router/streaming-server.js";
import animexProxyRouter from "./src/animex/router/proxy.js";
import reanimeListingsRouter from "./src/reanime/router/listings.js";
import reanimeEpisodeServersRouter from "./src/reanime/router/episode-servers.js";
import reanimeEpisodeSourcesRouter from "./src/reanime/router/streaming-server.js";
import reanimeProxyRouter from "./src/reanime/router/proxy.js";
import hianimeListingsRouter from "./src/hianime/router/listings.js";
import hianimeEpisodeServersRouter from "./src/hianime/router/episode-servers.js";
import hianimeEpisodeSourcesRouter from "./src/hianime/router/streaming-server.js";
import hianimeProxyRouter from "./src/hianime/router/proxy.js";
import nyaaListingsRouter from "./src/nyaa/router/listings.js";
import nyaaEpisodeServersRouter from "./src/nyaa/router/episode-servers.js";
import nyaaEpisodeSourcesRouter from "./src/nyaa/router/streaming-server.js";
import nyaaPlayRouter from "./src/nyaa/router/play.js";
import nyaaProxyRouter from "./src/nyaa/router/proxy.js";
import { createNyaaWatchPage } from "./src/ui/nyaa-watch-page.js";
import scraplingRouter from "./src/scrapling/router/index.js";
import { renderLandingPage, API_CATALOG } from "./src/ui/landing.js";
import { createPlayPage } from "./src/ui/play-page.js";

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
app.route("/api/v2/hianime", hianimeListingsRouter);
app.route("/api/v2/hianime/episode", hianimeEpisodeServersRouter);
app.route("/api/v2/hianime/episode/sources", hianimeEpisodeSourcesRouter);
app.route("/api/v2/hianime/proxy", hianimeProxyRouter);

app.route("/api/v2/anikoto", anikotoListingsRouter);
app.route("/api/v2/anikoto/episode", anikotoEpisodeServersRouter);
app.route("/api/v2/anikoto/episode/sources", anikotoEpisodeSourcesRouter);
app.route("/api/v2/anikoto/proxy", anikotoProxyRouter);

app.route("/api/v2/animex", animexListingsRouter);
app.route("/api/v2/animex/episode", animexEpisodeServersRouter);
app.route("/api/v2/animex/episode/sources", animexEpisodeSourcesRouter);
app.route("/api/v2/animex/proxy", animexProxyRouter);

app.route("/api/v2/reanime", reanimeListingsRouter);
app.route("/api/v2/reanime/episode", reanimeEpisodeServersRouter);
app.route("/api/v2/reanime/episode/sources", reanimeEpisodeSourcesRouter);
app.route("/api/v2/reanime/proxy", reanimeProxyRouter);

// nyaa: AniList metadata + Nyaa torrents; streams are served by the separate
// stream worker (stream.js), so there is no /proxy router here.
app.route("/api/v2/nyaa", nyaaListingsRouter);
app.route("/api/v2/nyaa/episode", nyaaEpisodeServersRouter);
app.route("/api/v2/nyaa/episode/sources", nyaaEpisodeSourcesRouter);

app.route("/api/v2/scrapling", scraplingRouter);

// Built-in HLS player preview page (plays proxyM3u8 through hls.js).
app.route("/api/v2/hianime/play", createPlayPage("/api/v2/hianime/episode/sources"));

app.route("/api/v2/anikoto/play", createPlayPage("/api/v2/anikoto/episode/sources"));

app.route("/api/v2/animex/play", createPlayPage("/api/v2/animex/episode/sources"));

// reanime streams are resolved server-side (WASM de-obfuscation + XOR-decrypted
// playlist) and served through /proxy, so it uses the same HLS player page.
app.route("/api/v2/reanime/play", createPlayPage("/api/v2/reanime/episode/sources"));

// nyaa plays on webtor.io (remote torrent player), so nothing is downloaded on this machine.
app.route("/api/v2/nyaa/play", nyaaPlayRouter);
app.route("/api/v2/nyaa/proxy", nyaaProxyRouter);
app.route("/api/v2/nyaa/watch", createNyaaWatchPage());


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
