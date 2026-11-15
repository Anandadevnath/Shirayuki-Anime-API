# AGENTS.md

Hono (ESM, `"type": "module"`) anime scraping REST API. Node 26. No build step — the server runs the source directly.

## Commands

- `npm run dev` — nodemon, restart on change
- `npm start` — single run
- Env: `PORT` (default **4000**, not 3000 as README says), `NODE_ENV`, validated by `envalid` in `src/config/env.js` (invalid `NODE_ENV` throws at boot)
- `npm test` runs `node:test` suites in `test/` (currently nyaa provider + stream worker only). No linter, formatter, or typecheck exist.
- `npm run stream` starts the nyaa stream worker (needs `ffmpeg`/`ffprobe` on PATH).

## Architecture

`index.js` is the only entrypoint: it creates the Hono app and mounts all routers under `/api/v2/<provider>/...`. There is **no auto-loader** — every new router must be imported and `app.route()`-registered in `index.js`.

Each provider under `src/<provider>/` follows the same shape:

- `_shared.js` — base URLs, headers, normalizers (anikoto, animex only; hianime has none)
- `scraper/` — pure fetch/parse functions (axios + cheerio), return plain data
- `controllers/` — wrap scrapers with `_cache.js`; hold validation and response envelope
- `router/` — Hono routers mapping paths to controllers

Providers: `anikoto`, `hianime`, `animex` (newest, GraphQL + SvelteKit `__data.json` decode), `reanime` (public JSON API), plus `scrapling` (Python bridge). README only documents anikoto/hianime — **`animex` and `reanime` are real and mounted but undocumented there.**

`reanime` differs from the others: its listings/details/search are a pure JSON API (`reanime.to/api/v1/*`, no cheerio), but its **streams are resolved server-side and proxied like hianime**. The flix resolver (`/api/flix/{anilistId}/{ep}?mal=...`) returns flixcloud embed links (`flixcloud.cc/e/<id>?v=N`); `src/reanime/scraper/flixcloud.js` replays the player's own crypto to turn one into a real, server-fetchable `.m3u8`: derive field names by SHA-256 hashing the page `obfuscation_seed`, pull the frag/iv/token/key-fragment, fetch `/api/m3u8/<token>`, mix the three fragments with the page's `w_payload` WASM module, then PBKDF2 → XOR-with-seed → SHA-256 → AES-256-CBC to decrypt the URL blob. The resulting m3u8 JWT is IP-bound, but since we fetch it from our own server it works. Playlist bodies are base64 + XOR-obfuscated with a second WASM key (`_c()`, exposed in-page as `window.__pk`); `src/reanime/scraper/proxy.js` decrypts them and rewrites children, with the XOR key threaded through `proxyM3u8` as a `key` query param. Media segments come in two forms: HD-1 is standard `#EXT-X-KEY` AES-128 (passed through; hls.js decrypts with the proxied `key.bin`), while servers like HD-2 wrap plaintext TS in a fake WebP/PNG container — the proxy replays the patched hls.js unwrap (strip the 12/8-byte image header, then XOR with a fixed 16-byte key unless the payload already starts with a `0x47` TS sync byte) and serves everything as `video/mp2t` so MSE accepts it. `/episode/sources` returns a **hianime-shaped** response (`link`/`tracks`/`intro`/`outro`/`sources[]`) with `link`/`sources[].url` a real m3u8 and `sources[].proxyM3u8` pointing at `/api/v2/reanime/proxy`. `/play` is the standard hls.js player (shared `createPlayPage`), not an embed frame. If every server fails to resolve, sources degrade to the browser-only embed (`browserOnly: true`). Several reanime listing endpoints are auth-locked upstream (401): `/genres`, `/browse`, `/catalog`, `/trending`, `/upcoming` all fail, so genre/catalog are built on `/search` filters (`format`/`status`/`season`/`year` honored; `sort`/`type` ignored; bare `genre` only filters with a real keyword).

`nyaa` is the site-independent provider. Metadata comes from the AniList GraphQL API (`src/nyaa/scraper/anilist.js`) and sources from the Nyaa RSS feed (`rss.js`, failover across `NYAA_BASE_URLS`). Release names are parsed by `release-parser.js` (group/season/episode/range/codec; anitomyscript was rejected as unmaintained). `episode-servers.js` queries title variants plus the episode number, filters by season/episode, and ranks the results. Batches get `fileSelection: e<N>`, singles get `auto`. `/api/v2/nyaa/watch` (`src/ui/nyaa-watch-page.js`) is the picker page. When `STREAM_ORIGIN` is a remote host (e.g. the Render worker, `render.yaml`) it plays the release inline via `/episode/sources` + hls.js; when it is localhost it falls back to linking webtor.io in a new tab, so torrents are never fetched on the local machine (owner's requirement). webtor.io can't be embedded (`X-Frame-Options: SAMEORIGIN`, and its embed SDK stopped serving webtor.io embeds on 2026-11-14). `/api/v2/nyaa/play` 302-redirects to `https://webtor.io/<infoHash>`, and every server in `/episode/servers` carries a `webtorUrl`. `episode-sources.js` returns HMAC-signed URLs (`stream-token.js`, `STREAM_SECRET`) to the separate **stream worker** (`stream.js` + `stream-worker/`, `npm run stream`, port 4100). The worker uses webtorrent v3 (`deselect: true`, then only the chosen file is selected) and ffmpeg HLS (EVENT playlist; H.264 8-bit is copied, anything else goes to libx264; the first English text sub becomes `subs.vtt` with `-flush_packets 1`). It also has a Range-capable `/raw` route, which is ffmpeg's input via `?internal=1`, so ffmpeg reads don't count as viewer activity. Sessions die after `STREAM_IDLE_MS` (cache dir and torrent store are deleted); an unfinished session is closed after 15s without requests once a newer session exists (`stream-worker/session-policy.js`), so switching episodes doesn't leave the old torrent splitting bandwidth. Ranking requires the release title to match an AniList title/synonym exactly (normalized) and prefers `NYAA_PREFERRED_RESOLUTION` (default 720: 1080p needs ~9 Mbit/s of swarm download to play without stalling). webtorrent files are streamx/async-iterable, **not** Node streams, so serve them with `ReadableStream.from(file[Symbol.asyncIterator]({start,end}))` (`Readable.toWeb` throws "init.highWaterMark is required"). The worker cannot run on Vercel. Tests: `npm test` (`node:test`, `test/`, RSS fixture in `test/fixtures/`).

## Conventions

- Controllers return `{ success, data, extractionTimeSec }` (errors: `{ success: false, error }`). Keep this envelope — `src/ui/landing.js` and the player pages depend on it.
- `_cache.js` exists as an identical copy per provider (`anikoto`, `animex`, and their streaming variants) with a `provider:`-prefixed key. Caching is an **in-memory `Map`, 5-min TTL**, per-process — wiped on restart, not shared across instances. Copy the pattern rather than refactoring into a shared module unless asked.
- Proxy routers rewrite `master.m3u8` → `proxy/stream.m3u8`; player pages (`src/ui/`) consume proxied sources.
- Cheerio/axios are re-exported from `src/utils/scrapper-deps.js`; import from there, not directly.
- Add new providers as a full `_shared.js` / `scraper/` / `controllers/` / `router/` set and register in `index.js`.

## Scrapling (Python bridge)

- `/api/v2/scrapling/fetch` spawns `scripts/scrapling_worker.py` via `child_process`, reading the request as JSON on stdin and returning JSON on stdout.
- Interpreter resolution order (`src/scrapling/index.js`): `SCRAPLING_PYTHON` env → `.venv/bin/python` → `.venv/Scripts/python.exe` → `python3`.
- Vanilla fetch needs no browser; `js=1` needs Playwright and `stealth=1` needs Scrapling's anti-bot extras, both installed via `requirements.txt` (`scrapling[fetchers]`) plus `scrapling install` for browser binaries into `.venv`.
- Setup: `python3 -m venv .venv && .venv/bin/pip install -r requirements.txt && .venv/bin/scrapling install`. Versions: Scrapling 0.4.15. `requirements.txt` declares only the top-level dep; the rest is transitive.
- `scripts/scrapling_worker.py` uses the 0.4.x API: `Fetcher.get`, `DynamicFetcher.fetch`, `StealthyFetcher.fetch`.

## Deploy

`vercel.json` sets `api/**/*.js` maxDuration, but no `api/` directory exists in the repo — the Vercel config appears stale. Verify actual deploy wiring before trusting it.

## Gotchas

- `src/anikoto/.../streaming-server.js` is imported as `anikotoEpisodeSourcesRouter` — filenames don't always match the logical role.
- README endpoint tables are the fastest API reference, but trust `index.js` route mounts over README when they disagree.
- Scrapers depend on live third-party sites (`anikototv.to`, `hianime.at`, `animex.one`) and their private JSON/GraphQL endpoints; failures are often upstream changes or anti-bot, not local bugs. `proxy: false` is set on axios calls to avoid env-proxy interference.
