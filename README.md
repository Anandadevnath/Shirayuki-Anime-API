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
PORT=3000                    # Server port (default: 3000)
NODE_ENV=development         # Environment: development/production/test
```

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
