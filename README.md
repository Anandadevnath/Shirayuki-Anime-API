# Shirayuki Anime API

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-22+-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Framework: Hono](https://img.shields.io/badge/Hono-4.x-E36002?logo=hono&logoColor=white)](https://hono.dev)

A self-hostable REST API that unifies anime metadata, search, and HLS streaming
across five upstream sources behind one consistent response shape. Built with
[Hono](https://hono.dev) on Node, no build step, no database.

Every route is a plain `GET` returning JSON. Streams are resolved server-side
and served through a built-in HLS proxy, so any player that speaks `.m3u8`
(with `hls.js` in the browser) can consume them. A server-rendered API explorer
ships with the project at `/`.

## Providers

| Provider | Upstream | Coverage |
|----------|----------|----------|
| **HiAnime** | `hianime.at` | Listings, search, seasons, characters, streaming (MegaPlay + vidplay resolvers) |
| **Anikoto** | `anikototv.to` | Home, search, details, streaming (MegaPlay resolver) |
| **Animex** | `animex.one` | GraphQL catalog, search, streaming (player API) |
| **Re:ANIME** | `reanime.cz` | Public JSON catalog, schedule, staff/characters, WASM-decoded streams |
| **anv** | `anv.to` | Open catalog API; streams gated behind a session cookie (handled internally) |

A sixth module, **Scrapling**, is a generic fetch/parse bridge to a Python
worker — useful for one-off scraping tasks outside the anime providers.

## Requirements

- Node.js 22+
- Python 3 + [Scrapling](https://github.com/D4Vinci/Scrapling) (optional — only
  for the `/scrapling` bridge and the `anv` provider's cookie bootstrap)

## Quick start

```bash
git clone https://github.com/Anandadevnath/Shirayuki-Anime-API.git
cd Shirayuki-Anime-API
npm install

npm run start          # or: npm run dev (nodemon reload)
```

The server listens on **port 4000** by default.

```bash
curl http://localhost:4000/health
# {"success":true}
```

- `http://localhost:4000/` — HTML API explorer (hub for all providers)
- `http://localhost:4000/p/<provider>` — explorer page for one provider
- `http://localhost:4000/endpoints.json` — machine-readable endpoint catalog

### Optional: Python bridge setup

Needed only if you use `/api/v2/scrapling/fetch` or the `anv` provider without
a pre-set cookie:

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/scrapling install   # browser binaries for js/stealth modes
```

The Node bridge auto-detects `.venv/bin/python` (override with
`SCRAPLING_PYTHON`).

## Configuration

Create a `.env` file (all fields optional):

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4000` | HTTP port |
| `NODE_ENV` | `development` | `development` / `production` / `test` (invalid values throw at boot) |
| `ANV_COOKIE` | — | Pre-obtained `shiro_watch` cookie for `anv.to`; skips the stealth-browser bootstrap. Useful on hosts without Python. |
| `SCRAPLING_PYTHON` | — | Path to the Python interpreter for the Scrapling bridge. |

## API reference

Base URL: `http://localhost:4000/api/v2`

**Conventions**

- All routes are `GET`. CORS is enabled globally.
- Success envelope: `{"success": true, "data": ..., "extractionTimeSec": 0.42}`
- Error envelope: `{"success": false, "error": "..."}`. Unmatched routes return
  `{"success": false, "message": "Endpoint not found"}` with `404`.
- Metadata responses are cached in memory for 5 minutes per route + parameter set;
  resolved stream sources for 60 seconds (provider tokens expire quickly). The cache
  is per process and cleared on restart.

### HiAnime

| Endpoint | Description |
|----------|-------------|
| `/hianime` | Home — spotlight, trending, top-viewed charts, latest sections |
| `/hianime/schedule` | Weekly release calendar |
| `/hianime/browse/:category?page=1` | Curated pages (`az-list`, `most-popular`, `tv`, `movie`, …) |
| `/hianime/genre/:genre?page=1` | Titles by genre |
| `/hianime/search?q=&page=1` | Keyword search |
| `/hianime/search/suggestion?q=` | Autocomplete suggestions |
| `/hianime/anime/:animeId` | Full metadata (synopsis, score, genres, rating) |
| `/hianime/anime/:animeId/episodes` | Episode list with episode ids |
| `/hianime/anime/:animeId/seasons` | Franchise seasons |
| `/hianime/anime/:animeId/characters?limit=` | Characters |
| `/hianime/anime/:animeId/artists` | Staff |
| `/hianime/anime/:animeId/art` | Title art, posters, characters, company |
| `/hianime/episode/servers?animeEpisodeId=&ep=1` | Sub/dub servers for an episode (`HD-1`, `HD-2`, …) |
| `/hianime/episode/sources?animeEpisodeId=&ep=1&server=HD-1&category=sub` | m3u8 + subtitle tracks + intro/outro. `server` optional — resolvers are tried in order |
| `/hianime/proxy?url=&ref=` | HLS playlist proxy (rewrites master → `stream.m3u8`) |
| `/hianime/play?animeEpisodeId=&ep=1&server=&category=` | Built-in hls.js player page |

### Anikoto

| Endpoint | Description |
|----------|-------------|
| `/anikoto` | Home — spotlight, latest episodes, upcoming, day/week/month rankings |
| `/anikoto/search?q=&page=1` | Keyword search |
| `/anikoto/search/suggestion?q=` | Suggestions |
| `/anikoto/anime/:animeId` | Full metadata + episode list |
| `/anikoto/anime/:animeId/episodes` | Episodes with sub/dub availability |
| `/anikoto/episode/servers?animeId=&ep=1` | Servers (`HD-1`, `Vidstream-1`, `Vidstream-2`) |
| `/anikoto/episode/sources?animeId=&ep=1&server=Vidstream-1&category=sub` | m3u8 + subtitles |
| `/anikoto/proxy?url=&ref=` | HLS playlist proxy |
| `/anikoto/play?animeId=&ep=1` | Built-in player page |

### Animex

| Endpoint | Description |
|----------|-------------|
| `/animex` | Home — trending, popular, latest additions |
| `/animex/catalog?q=&page=1&sort=&perPage=30` | Full catalog browse (site `/catalog` equivalent) |
| `/animex/search?q=&page=1` | Keyword search (`q` optional — omit for full-catalog pagination) |
| `/animex/search/suggestion?q=` | Suggestions |
| `/animex/anime/:animeId` | Metadata, characters, relations, recommendations |
| `/animex/anime/:animeId/episodes` | Episodes with titles, fillers, thumbnails |
| `/animex/episode/servers?animeId=&ep=1` | Providers (`Nero`, `Yuki`, `Zuna`, …) |
| `/animex/episode/sources?animeId=&ep=1&server=nero&category=sub` | m3u8 + subtitles + intro/outro chapters |
| `/animex/proxy?url=&ref=` | HLS playlist proxy |
| `/animex/play?animeId=&ep=1` | Built-in player page |

### Re:ANIME

| Endpoint | Description |
|----------|-------------|
| `/reanime` | Home — trending, latest aired, upcoming |
| `/reanime/schedule` | Weekly calendar (UTC) |
| `/reanime/catalog?page=1&format=TV` | Catalog browse; filters: `format`, `status`, `season`, `year` (`sort` is ignored upstream) |
| `/reanime/genre/:genre?page=1` | Titles by genre |
| `/reanime/search?q=&format=&status=&season=&year=&genre=` | Keyword search with filters |
| `/reanime/search/suggestion?q=` | Suggestions |
| `/reanime/anime/:animeId` | Metadata, external ids, studios |
| `/reanime/anime/:animeId/episodes?page=1` | Episodes with titles, fillers, air dates |
| `/reanime/anime/:animeId/seasons` | Franchise relations + season counts |
| `/reanime/anime/:animeId/relations` | Related titles |
| `/reanime/anime/:animeId/characters` | Characters with roles |
| `/reanime/anime/:animeId/artists` | Staff with roles |
| `/reanime/anime/:animeId/art` | Poster/banner/colors/artwork |
| `/reanime/episode/servers?animeId=&ep=1` | flixcloud servers (`HD-1`, `HD-2`) |
| `/reanime/episode/sources?animeId=&ep=1` | Server-resolved m3u8 (streams are decrypted server-side; response is hianime-shaped) |
| `/reanime/proxy?url=&key=` | HLS proxy (decrypts and rewrites playlists and segments) |
| `/reanime/play?animeId=&ep=1` | Built-in player page |

### anv

| Endpoint | Description |
|----------|-------------|
| `/anv` | Home sections |
| `/anv/browse?page=1` | Paginated full-catalog browse |
| `/anv/search?q=&page=1` | Keyword search |
| `/anv/anime/:animeId` | Metadata incl. MAL id and anv numeric id (`animeId` = slug or numeric) |
| `/anv/anime/:animeId/episodes` | Episodes with titles, thumbnails, fillers |
| `/anv/episode/servers?animeId=&ep=1` | Sub/dub server lists (`Orange`, `Pear`, `Banana`) |
| `/anv/episode/sources?animeId=&ep=1&server=&category=sub` | m3u8 + subtitles + AniSkip intro/outro. The first call bootstraps a session cookie via the stealth browser (~4s) |
| `/anv/proxy?url=` | Cookie-carrying HLS proxy for `anv.to/stream/*` |
| `/anv/play?animeId=&ep=1` | Built-in player page |

### Scrapling bridge

| Endpoint | Description |
|----------|-------------|
| `/scrapling/fetch?url=&js=&stealth=&proxy=&headers=&extract=&timeout=` | Fetch a page through the Python worker |

Parameters: `url` (required, http/https), `js` (`true` for browser rendering),
`stealth` (`true` for the anti-bot fetcher), `proxy`, `headers` (URL-encoded
JSON object), `extract` (URL-encoded JSON array of
`{"name","kind","selector","many"}` with `kind` of `css` or `xpath`),
`timeout` (seconds, default 25).

## Usage example

A typical client flow — search, pick an episode, resolve a stream:

```bash
BASE=http://localhost:4000/api/v2

# 1. Search
curl "$BASE/hianime/search?q=frieren"

# 2. Episode list (episode ids come from here)
curl "$BASE/hianime/anime/frieren-beyond-journeys-end-481/episodes"

# 3. Available servers for episode 1
curl "$BASE/hianime/episode/servers?animeEpisodeId=frieren-beyond-journeys-end-481&ep=1"

# 4. Playable m3u8 + subtitles
curl "$BASE/hianime/episode/sources?animeEpisodeId=frieren-beyond-journeys-end-481&ep=1&server=HD-1&category=sub"
```

The `sources` response contains the provider's direct `.m3u8` in `sources[].url`,
a browser-playable `sources[].embeddedUrl` that routes the playlist through the
provider's `/proxy`, and `sources[].proxyM3u8` pointing at the built-in `/play`
page for that episode. `tracks` carries subtitles and `intro`/`outro` gives skip
markers where the provider supplies them.

To preview without writing a client, open the `play` variant of any provider in
a browser — it is a small hls.js page wired to the proxy.

## Error handling

| Status | Meaning |
|--------|---------|
| `400` | Missing or invalid parameters |
| `404` | Unknown route or provider (`/p/:id`) |
| `403` | Upstream refused (e.g. expired `anv` session — retry to re-bootstrap) |
| `500` | Upstream failure or internal error (`{"success":false,"error":"..."}`) |

Providers depend on live third-party sites; transient upstream failures surface
as `500`s and usually clear on retry or after the upstream recovers.

## Project structure

```
├── index.js                  # Entrypoint — Hono app, mounts every router
├── src/
│   ├── anikoto/              # One folder per provider, same shape each time:
│   ├── hianime/              #   controllers/   cached route handlers
│   ├── animex/               #   router/        Hono route definitions
│   ├── reanime/              #   scraper/       pure fetch/parse functions
│   ├── anv/                  #   _shared.js     base URLs, headers, normalizers
│   ├── scrapling/            # Python bridge (spawns scripts/scrapling_worker.py)
│   ├── ui/
│   │   ├── landing.js        # Server-rendered API explorer + endpoint catalog
│   │   ├── play-page.js      # Generic hls.js player page
│   │   └── generic-player.js # Shared player HTML
│   ├── config/env.js         # Env validation (envalid)
│   └── utils/                # Shared scraper deps, request origin
├── scripts/
│   └── scrapling_worker.py   # Python Scrapling worker (stdin JSON → stdout JSON)
├── Dockerfile
└── render.yaml
```

Adding a provider means adding a `src/<name>/` set and registering its routers
in `index.js` — there is no auto-loader.

## Deployment

The included `Dockerfile` (Node 22, non-root) and `render.yaml` deploy the API
as a single Render web service with a `/health` check. Any Docker host works
the same way:

```bash
docker build -t shirayuki-api .
docker run -p 4000:4000 -e NODE_ENV=production shirayuki-api
```

Note: the in-memory cache and the `anv` session cookie are per-process — scale
horizontally only if you accept each instance warming its own cache.

## Disclaimer

This project scrapes public third-party websites and is intended for
educational and personal use. It is not affiliated with, endorsed by, or
connected to any of the upstream providers. Content availability depends
entirely on those third parties. Respect their terms of service and use the
API responsibly.

## License

[MIT](LICENSE) © 2025 Ananda Dev Nath
