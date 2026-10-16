# AGENTS.md

Hono (ESM, `"type": "module"`) anime scraping REST API. Node 26. No build step — the server runs the source directly.

## Commands

- `npm run dev` — nodemon, restart on change
- `npm start` — single run
- Env: `PORT` (default **4000**, not 3000 as README says), `NODE_ENV`, validated by `envalid` in `src/config/env.js` (invalid `NODE_ENV` throws at boot)
- No tests, linter, formatter, or typecheck exist. Do not invent or claim to run them.

## Architecture

`index.js` is the only entrypoint: it creates the Hono app and mounts all routers under `/api/v2/<provider>/...`. There is **no auto-loader** — every new router must be imported and `app.route()`-registered in `index.js`.

Each provider under `src/<provider>/` follows the same shape:

- `_shared.js` — base URLs, headers, normalizers (anikoto, animex only; hianime has none)
- `scraper/` — pure fetch/parse functions (axios + cheerio), return plain data
- `controllers/` — wrap scrapers with `_cache.js`; hold validation and response envelope
- `router/` — Hono routers mapping paths to controllers

Providers: `anikoto`, `hianime`, `animex` (newest, GraphQL + SvelteKit `__data.json` decode), `reanime` (public JSON API), plus `scrapling` (Python bridge). README only documents anikoto/hianime — **`animex` and `reanime` are real and mounted but undocumented there.**

`reanime` differs from the others: it is a pure JSON-API provider (`reanime.to/api/v1/*`), no HTML/cheerio. Its streams are **not proxyable** — the flix resolver (`/api/flix/{anilistId}/{ep}?mal=...`) hands back flixcloud embed links whose real `.m3u8` is minted with a JWT bound to the requester's IP (a plain server-side fetch returns 403, and segments are AES-128). So `reanime` exposes listings/search/details/episodes/servers only, with **no `/episode/sources`, `/proxy`, or `/play`** — do not add them expecting them to work.

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
