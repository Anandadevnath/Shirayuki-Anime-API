<p align="center">
  <a href="https://github.com/Anandadevnath/Shirayuki-Anime-API"><img src="https://img.shields.io/github/stars/Anandadevnath/Shirayuki-Anime-API?style=social" alt="Stars"></a>
  <a href="https://github.com/Anandadevnath/Shirayuki-Anime-API/network/members"><img src="https://img.shields.io/github/forks/Anandadevnath/Shirayuki-Anime-API?style=social" alt="Forks"></a>
  <img src="https://img.shields.io/badge/Framework-Hono-ee6c00?style=for-the-badge&logo=fire" alt="Hono">
  <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" alt="JavaScript">
  <img src="https://img.shields.io/badge/Platform-REST%20API-green?style=for-the-badge" alt="REST API">
  <img src="https://img.shields.io/badge/License-ISC-purple?style=for-the-badge" alt="License">
</p>

<div align="center">

<pre>
███████╗██╗  ██╗██╗██████╗  █████╗ ██╗   ██╗██╗   ██╗██╗  ██╗██╗
██╔════╝██║  ██║██║██╔══██╗██╔══██╗╚██╗ ██╔╝██║   ██║██║ ██╔╝██║
███████╗███████║██║██████╔╝███████║ ╚████╔╝ ██║   ██║█████╔╝ ██║
╚════██║██╔══██║██║██╔══██╗██╔══██║  ╚██╔╝  ██║   ██║██╔═██╗ ██║
███████║██║  ██║██║██║  ██║██║  ██║   ██║   ╚██████╔╝██║  ██╗██║
╚══════╝╚═╝  ╚═╝╚═╝╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝╚═╝
</pre>

# 🔥 Shirayuki Anime API

> **The ultimate anime scraping API — fast, lightweight, and powered by Hono**

*A RESTful API that unifies anime data across **Anikoto** and **HiAnime (hianime.at)** — listings, search, metadata, and HLS streaming sources, all wrapped in a clean Hono interface.*

</div>

---

## ✨ Features

<div align="center">

| Feature | Description |
|---------|-------------|
| 🏠 **Home & Trending** | Spotlight, trending anime, top charts |
| 🔍 **Smart Search** | Keyword search + autocomplete suggestions |
| 📺 **Anime Details** | Full metadata & episode lists |
| 🎬 **Streaming Sources** | Episode servers and video sources (m3u8) |
| 🔌 **Scrapling Bridge** | Fetch / parse any page via the Python worker |
| 🌐 **Multi-Provider** | Anikoto · HiAnime (hianime.at) |
| 🔁 **HLS Proxy** | Ready-to-play proxied `.m3u8` streams |

</div>

---

## 🚀 Quick Start

```bash
# Clone the repository
git clone https://github.com/Anandadevnath/Shirayuki-Anime-API.git
cd Shirayuki-Anime-API

# Install dependencies
npm install

# Start the server
npm run start

# Open the API explorer → http://localhost:3000
```

---

## 📡 API Endpoints

### Anikoto

> `https://anikototv.to` scrape · MegaPlay streaming (`getSources`). Home is an aggregate of hotspot slides, latest-episodes, upcoming, and Day/Week/Month top rankings.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v2/anikoto` | Home — spotlight, latest episodes, upcoming, top charts |
| `GET` | `/api/v2/anikoto/search?q=&page=1` | Keyword search |
| `GET` | `/api/v2/anikoto/search/suggestion?q=` | Search-style suggestions |
| `GET` | `/api/v2/anikoto/anime/:animeId` | Full anime details (synopsis, genres, studios, score) |
| `GET` | `/api/v2/anikoto/anime/:animeId/episodes` | Episode list with sub/dub ranges |
| `GET` | `/api/v2/anikoto/episode/servers?animeId=&ep=1` | Streaming servers (sub/dub) |
| `GET` | `/api/v2/anikoto/episode/sources?animeId=&ep=&server=&category=sub` | Video sources (m3u8) |
| `GET` | `/api/v2/anikoto/proxy?url=&ref=` | HLS playlist proxy |
| `GET` | `/api/v2/anikoto/play?animeId=&ep=&server=&category=` | Built-in browser player page |

### HiAnime

> **`https://hianime.at` scrape** · Multi-source streaming — **MegaPlay** family (`bibiemb`, `megaplay`, `megacloud`, `vidcloud`, ...) and the **vidplay** family (`otakuhg`, `otakuvid`, `playmogo`, ...), both resolving to `.m3u8` HLS with subtitles, intro & outro tracks.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v2/hianime` | Home — trending, top-airing, seasonal, latest episodes |
| `GET` | `/api/v2/hianime/browse/:category?page=1` | Curated listing pages (az-list, most-popular, tv, movie...) |
| `GET` | `/api/v2/hianime/genre/:genre?page=1` | Titles by genre |
| `GET` | `/api/v2/hianime/search?q=&page=1` | Keyword search |
| `GET` | `/api/v2/hianime/search/suggestion?q=` | Autocomplete |
| `GET` | `/api/v2/hianime/anime/:animeId` | Full anime details (synopsis, score, genres) |
| `GET` | `/api/v2/hianime/anime/:animeId/episodes` | Episode list with watch URLs |
| `GET` | `/api/v2/hianime/episode/servers?animeEpisodeId=&ep=1` | Streaming servers (sub/dub) |
| `GET` | `/api/v2/hianime/episode/sources?animeEpisodeId=&ep=&server=&category=sub` | Video sources (m3u8) |
| `GET` | `/api/v2/hianime/proxy?url=&ref=` | HLS playlist proxy |
| `GET` | `/api/v2/hianime/play?animeEpisodeId=&ep=&server=&category=` | Built-in browser player page |

### Nyaa (AniList + nyaa.si torrents)

> Metadata from the official **AniList GraphQL API**, sources from the **nyaa.si RSS feed**. Torrents are turned into a playable **HLS `.m3u8`** by a separate long-running **stream worker** (`npm run stream`: webtorrent + ffmpeg). Because the catalog doesn't depend on a pirate streaming site, it survives site shutdowns. Nyaa mirrors are a config change (`NYAA_BASE_URLS`).

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v2/nyaa` | Home: spotlight, trending, seasonal, top-airing, upcoming, top-rated, latest Nyaa releases |
| `GET` | `/api/v2/nyaa/schedule?date=YYYY-MM-DD` | Airing schedule (AniList) |
| `GET` | `/api/v2/nyaa/browse/:category?page=1` | `trending`, `most-popular`, `top-rated`, `top-airing`, `upcoming`, `completed`, `tv`, `movie`, `ova`, `ona`, `special`, ... |
| `GET` | `/api/v2/nyaa/genre/:genre?page=1` | Titles by genre |
| `GET` | `/api/v2/nyaa/search?q=&page=1` | Keyword search |
| `GET` | `/api/v2/nyaa/search/suggestion?q=` | Autocomplete |
| `GET` | `/api/v2/nyaa/anime/:animeId` | Details (`animeId` = `slug-<anilistId>`, e.g. `sousou-no-frieren-154587`) |
| `GET` | `/api/v2/nyaa/anime/:animeId/episodes` | Aired episodes (`episodeId` = `<anilistId>-ep-<n>`) |
| `GET` | `/api/v2/nyaa/torrents?q=&c=1_2&f=0&s=seeders&page=1` | Raw Nyaa search |
| `GET` | `/api/v2/nyaa/episode/servers?animeEpisodeId=&ep=1` | Ranked torrents for the episode (sub / dual-audio) |
| `GET` | `/api/v2/nyaa/episode/sources?animeEpisodeId=&ep=&server=<infoHash>&category=sub` | `server`, **`sources[0].url`** (m3u8), `sources[0].proxyM3u8` (same stream via `/api/v2/nyaa/proxy`), `tracks` (WebVTT), `worker`, `alternatives` |
| `GET` | `/api/v2/nyaa/play?animeEpisodeId=&ep=` | Built-in browser player page |

**Stream worker** (separate process; *not* deployable on Vercel):

```bash
npm run stream      # http://localhost:4100. Needs ffmpeg + ffprobe on PATH
```

| Worker route | Purpose |
|---|---|
| `GET /stream/:hash/:sel/index.m3u8?t=` | HLS playlist (H.264 copied, HEVC/10-bit transcoded) |
| `GET /stream/:hash/:sel/subs.vtt?t=` | First English text subtitle track as WebVTT |
| `GET /raw/:hash/:sel?t=` | Original file with HTTP Range (VLC/mpv seek anywhere) |
| `GET /status/:hash/:sel?t=` | Peers, speed, progress, segment count |
| `POST /prepare/:hash/:sel?t=` | Start fetching early (the API calls this for you) |

All worker URLs are HMAC-signed by the API (`STREAM_SECRET`, shared by both processes), so the worker can't be used as an open torrent proxy. The first play takes ~5–30 s depending on seeders. Browser seeking only reaches segments that already exist. The worker joins the BitTorrent swarm and uploads (capped by `STREAM_UPLOAD_LIMIT`), so host it somewhere you are comfortable with that.

### Scrapling (Python bridge)

> Fetch and parse pages with [Scrapling](https://github.com/D4Vinci/Scrapling). The
> request is executed by a Python worker in the project `.venv` via `child_process`
> and `scripts/scrapling_worker.py`. Vanilla fetches need no browser; `js=1` uses
> browser rendering (Playwright) and `stealth=1` uses Scrapling's anti-bot fetcher.

| `GET` | `/api/v2/scrapling/fetch?url=&js=&proxy=&headers=&extract=&timeout=` | Fetch a page / extract selectors |

---

## 💡 Usage Examples

### Get Home
```bash
# Anikoto home
curl "http://localhost:3000/api/v2/anikoto"

# HiAnime home
curl "http://localhost:3000/api/v2/hianime"
```

### Search for Anime
```bash
# Anikoto
curl "http://localhost:3000/api/v2/anikoto/search?q=attack%20on%20titan&page=1"

# HiAnime
curl "http://localhost:3000/api/v2/hianime/search?q=attack%20on%20titan&page=1"
```

### Get Anime Details
```bash
# Anikoto
curl "http://localhost:3000/api/v2/anikoto/anime/naruto-eybxz"

# HiAnime
curl "http://localhost:3000/api/v2/hianime/anime/one-piece-1"
```

### Get Episode Servers
```bash
# Anikoto
curl "http://localhost:3000/api/v2/anikoto/episode/servers?animeId=naruto-eybxz&ep=1"

# HiAnime
curl "http://localhost:3000/api/v2/hianime/episode/servers?animeEpisodeId=one-piece-1&ep=1"
```

### Get Episode Sources
```bash
# Anikoto — video sources (m3u8) for episode 1
curl "http://localhost:3000/api/v2/anikoto/episode/sources?animeId=naruto-eybxz&ep=1&server=Vidstream-1&category=sub"

# HiAnime — video sources (m3u8) for episode 1
curl "http://localhost:3000/api/v2/hianime/episode/sources?animeEpisodeId=one-piece-1&ep=1&server=HD-1&category=sub"
```

### Play the stream in a browser
```bash
# Anikoto player page (auto-plays via hls.js)
open "http://localhost:3000/api/v2/anikoto/play?animeId=naruto-eybxz&ep=1&server=Vidstream-1&category=sub"

# HiAnime player page
open "http://localhost:3000/api/v2/hianime/play?animeEpisodeId=one-piece-1&ep=1&server=HD-1&category=sub"

# Or proxy a raw m3u8 URL yourself
curl "http://localhost:3000/api/v2/anikoto/proxy?url=<ENCODED_M3U8_URL>&ref=https%3A%2F%2Fmegaplay.buzz%2F"
```

---

### Scrapling Fetch (Python bridge)

```bash
# Vanilla fetch — returns page text + extracted selectors
curl \
  "http://localhost:3000/api/v2/scrapling/fetch?url=https%3A%2F%2Fexample.com&extract=%5B%7B%22name%22%3A%22title%22%2C%22kind%22%3A%22xpath%22%2C%22selector%22%3A%22%2F%2Ftitle%2Ftext()%22%7D%5D"

# Browser-rendered fetch (requires Playwright in .venv)
curl "http://localhost:3000/api/v2/scrapling/fetch?url=https%3A%2F%2Fexample.com&js=true"
```

> **Params** — `url` (required, http(s)) · `js` (boolean) · `stealth` (boolean) ·
> `proxy` (string) · `headers` (URL-encoded JSON object) · `extract` (URL-encoded
> JSON array `[{name,kind,selector,many}]` with `kind` ∈ `css`|`xpath`) · `timeout`.
>
> **Response** — `{ success, ok, status, url, text, extracts, error, extractionTimeSec }`;

## ⚙️ Configuration

Create a `.env` file in the project root:

```env
PORT=4000                    # Server port (default: 4000)
NODE_ENV=development         # Environment: development/production/test

# --- nyaa provider ---
NYAA_BASE_URLS=https://nyaa.si             # comma-separated failover list
NYAA_PREFERRED_GROUPS=SubsPlease,Erai-raws,EMBER,ASW,Judas
STREAM_ORIGIN=http://localhost:4100        # public URL of the stream worker
STREAM_SECRET=change-me-long-random        # REQUIRED in production, same value on API + worker
STREAM_TOKEN_TTL_SEC=21600

# --- stream worker (npm run stream) ---
STREAM_PORT=4100
STREAM_CACHE_DIR=                          # default: <os tmp>/shirayuki-stream
STREAM_IDLE_MS=600000                      # close torrent + delete files after 10 min idle
STREAM_MAX_SESSIONS=3
STREAM_UPLOAD_LIMIT=51200                  # bytes/sec, -1 = unlimited
STREAM_READY_TIMEOUT_MS=50000
STREAM_TRANSCODE=auto                      # auto | always | never
```

**Split deploy:** the API (catalog + `/episode/sources`) can stay on Vercel. Run `npm run stream` on a VPS, Railway or Fly (see `Dockerfile.stream`), or on your PC behind a Cloudflare Tunnel. Then set `STREAM_ORIGIN` on Vercel to that public URL, and use the same `STREAM_SECRET` on both.

---

## 🛠️ Tech Stack

<div align="center">

| Technology | Purpose |
|------------|---------|
| <img src="https://img.shields.io/badge/Hono-ee6c00?style=flat-square&logo=fire" height="20"> | Web framework |
| <img src="https://img.shields.io/badge/node--server-135F8D?style=flat-square&logo=node.js" height="20"> | Node adapter (serve the Hono app) |
| <img src="https://img.shields.io/badge/Cheerio-259BFF?style=flat-square" height="20"> | HTML parsing |
| <img src="https://img.shields.io/badge/Axios-5A29E4?style=flat-square" height="20"> | HTTP client |

</div>

> Scraping stack: Axios + Cheerio per provider, with a small shared scraper utils layer.

---

## 📁 Project Structure

```
Shirayuki-Anime-API/
├── index.js                    # Entry point — mounts all /api/v2 routers
├── src/
│   ├── anikoto/               # anikototv.to listings + MegaPlay streaming
│   │   ├── controllers/       # cached controllers
│   │   ├── router/            # Hono routers (listings, streaming, proxy)
│   │   ├── scraper/           # scrapers (home, anime, search, servers, sources, megaplay, proxy)
│   │   └── _shared.js        # base URL, headers, normalizers
│   ├── hianime/              # hianime.at listings + MegaPlay/vidplay streaming
│   │   ├── controllers/
│   │   ├── router/
│   │   ├── scraper/           # home, anime, search, sources, servers, vidplay, megaplay, proxy
│   │   └── _shared.js
│   ├── scrapling/             # Scrapling Python bridge
│   │   ├── controllers/
│   │   ├── router/
│   │   └── index.js           # spawns .venv python worker
│   ├── ui/
│   │   ├── landing.js         # HTML API explorer (served at /)
│   │   ├── play-page.js       # generic HLS player preview page
│   │   └── generic-player.js  # shared player HTML used by proxy routers
│   ├── config/
│   │   └── env.js             # Environment validation (envalid)
│   └── utils/
│       ├── request-origin.js  # Resolves public scheme/host behind proxies
│       └── scrapper-deps.js   # Scraping dependencies
├── scripts/
│   └── scrapling_worker.py    # Python Scrapling worker (run via .venv)
├── package.json
├── vercel.json                # Vercel deployment config
└── README.md
```

---

## 🔀 Streaming Notes

- **Anikoto** servers resolve through MegaPlay's `/getSources` — supply the server name from `/episode/servers` (e.g. `Vidstream-1`).
- **HiAnime** servers resolve through either the MegaPlay or vidplay flow automatically, so you can omit `server` and it will iterate: first match wins.
- Both proxies rewrite `master.m3u8` → `proxy/stream.m3u8`, keep the key URI, and proxy the TS segments.

---

## ⚠️ Error Handling

| Status | Meaning |
|--------|---------|
| `400` | Missing required parameters |
| `404` | Route not found |
| `500` | Upstream or internal error |

---

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

```bash
1. 🍴 Fork the repository
2. 🌿 Create a feature branch (git checkout -b feature/amazing-feature)
3. 💬 Commit your changes (git commit -m 'Add amazing feature')
4. 🔀 Push to the branch (git push origin feature/amazing-feature)
5. 🎁 Open a Pull Request
```

---

## 📜 License

This project is licensed under the **ISC License** — free to use, modify, and share.

---

<div align="center">

<pre>
██████╗ ███████╗██╗   ██╗    ███████╗███╗   ██╗██████╗ 
██╔══██╗██╔════╝██║   ██║    ██╔════╝████╗  ██║██╔══██╗
██║  ██║█████╗  ██║   ██║    █████╗  ██╔██╗ ██║██║  ██║
██║  ██║██╔══╝  ╚██╗ ██╔╝    ██╔══╝  ██║╚██╗██║██║  ██║
██████╔╝███████╗ ╚████╔╝     ███████╗██║ ╚████║██████╔╝
╚═════╝ ╚══════╝  ╚═══╝      ╚══════╝╚═╝  ╚═══╝╚═════╝ 
</pre>

*Built with ❤️ and lots of coffee*

**Stars & Forks are appreciated!**

</div>
