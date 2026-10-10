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

*A RESTful API that unifies anime data across **Anixo** and **AnimeKai** — listings, search, metadata, schedules, and HLS streaming sources, all wrapped in a clean Hono interface.*

</div>

---

## ✨ Features

<div align="center">

| Feature | Description |
|---------|-------------|
| 🏠 **Home & Trending** | Spotlight, trending anime, top charts |
| 🔍 **Smart Search** | Basic, advanced filters, autocomplete |
| 📺 **Anime Details** | Full metadata, episodes, schedules |
| 🎬 **Streaming Sources** | Episode servers and video sources |
| 🗓️ **Schedules** | Daily airing schedules by date |
| 🌐 **Multi-Provider** | Anixo · AnimeKai |
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

### Anixo

> AniList-backed listings · MegaPlay streaming (`megaplay`, `megaplay-mal`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v2/anixo/home` | Spotlight, trending, popular, seasonal |
| `GET` | `/api/v2/anixo/azlist/:letter?page=1` | Full catalogue grid |
| `GET` | `/api/v2/anixo/anime/:animeId` | Full anime details |
| `GET` | `/api/v2/anixo/anime/:animeId/episodes` | Episode list |
| `GET` | `/api/v2/anixo/search?q=&page=1` | Basic search |
| `GET` | `/api/v2/anixo/search/advanced` | Advanced filters |
| `GET` | `/api/v2/anixo/search/suggestion?q=` | Autocomplete |
| `GET` | `/api/v2/anixo/producer/:producer?page=1` | Filter by studio |
| `GET` | `/api/v2/anixo/genre/:genre?page=1` | Filter by genre |
| `GET` | `/api/v2/anixo/category/:category?page=1` | Curated lists |
| `GET` | `/api/v2/anixo/schedule?date=YYYY-MM-DD&timezone=UTC` | Daily schedule |
| `GET` | `/api/v2/anixo/episode/servers?animeEpisodeId=&ep=` | Streaming servers |
| `GET` | `/api/v2/anixo/episode/sources?animeEpisodeId=&ep=&server=megaplay&category=sub` | Video sources (m3u8) |
| `GET` | `/api/v2/anixo/proxy?url=&ref=` | HLS playlist proxy |

### AnimeKai

> animekai.ro scrape · MegaVid streaming (`ani-hd`, `hd`, `hd-1`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v2/animekai` | Spotlight, trending, top-airing, popular, latest-episode & recently-updated |
| `GET` | `/api/v2/animekai/azlist/:letter?page=1` | Catalogue by letter (0-9, A-Z, other) |
| `GET` | `/api/v2/animekai/anime/:animeId` | Full anime details |
| `GET` | `/api/v2/animekai/anime/:animeId/episodes` | Episode list |
| `GET` | `/api/v2/animekai/search?q=&page=1` | Basic search |
| `GET` | `/api/v2/animekai/search/advanced` | Advanced filters |
| `GET` | `/api/v2/animekai/search/suggestion?q=` | Autocomplete |
| `GET` | `/api/v2/animekai/schedule?date=YYYY-MM-DD` | Daily schedule |
| `GET` | `/api/v2/animekai/episode/servers?animeEpisodeId=&ep=` | Streaming servers (Ani-HD, HD, HD-1) |
| `GET` | `/api/v2/animekai/episode/sources?animeEpisodeId=&ep=&server=&category=` | Video sources (m3u8) |
| `GET` | `/api/v2/animekai/proxy?url=&ref=` | HLS playlist proxy |

### Scrapling (Python bridge)

> Fetch and parse pages with [Scrapling](https://github.com/D4Vinci/Scrapling). The
> request is executed by a Python worker in the project `.venv` via `child_process`
> and `scripts/scrapling_worker.py`. Vanilla fetches need no browser; `js=1` uses
> browser rendering (Playwright) and `stealth=1` uses Scrapling's anti-bot fetcher.

| `GET` | `/api/v2/scrapling/fetch?url=&js=&proxy=&headers=&extract=&timeout=` | Fetch a page / extract selectors |

---

## 💡 Usage Examples

### Get Trending Anime
```bash
curl "http://localhost:3000/api/v2/anixo/home"
```

### Search for Anime
```bash
curl "http://localhost:3000/api/v2/anixo/search?q=attack%20on%20titan&page=1"
```

### Get Anime Details
```bash
curl "http://localhost:3000/api/v2/anixo/anime/21"
```

### Get Episode Servers
```bash
curl "http://localhost:3000/api/v2/anixo/episode/servers?animeEpisodeId=21&ep=1"
```

### Advanced Search
```bash
curl "http://localhost:3000/api/v2/anixo/search/advanced?q=titan&genres=action&type=movie&sort=score&page=1"
```

### Get Schedule
```bash
curl "http://localhost:3000/api/v2/anixo/schedule?date=2026-05-22&timezone=UTC"
```

### Get Episode Sources (Anixo — MegaPlay m3u8)
```bash
curl "http://localhost:3000/api/v2/anixo/episode/sources?animeEpisodeId=21&ep=1&server=megaplay&category=sub"
```

### Get Episode Sources (AnimeKai — MegaVid m3u8)
```bash
curl "http://localhost:3000/api/v2/animekai/episode/sources?animeEpisodeId=one-piece-ewc5jc&ep=1&server=ani-hd&category=sub"
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
| <img src="https://img.shields.io/badge/Cheerio-259BFF?style=flat-square" height="20"> | HTML parsing |
| <img src="https://img.shields.io/badge/Axios-5A29E4?style=flat-square" height="20"> | HTTP client |
| <img src="https://img.shields.io/badge/Pino-FFD43B?style=flat-square" height="20"> | Fast logging |

</div>

---

## 📁 Project Structure

```
Shirayuki-Anime-API/
├── index.js                    # Entry point
├── src/
│   ├── anixo/                  # AniList listings + MegaPlay streaming
│   │   ├── controllers/
│   │   ├── router/
│   │   └── scraper/
│   ├── animekai/               # animekai.ro listings + MegaVid streaming
│   │   ├── controllers/
│   │   ├── router/
│   │   └── scraper/
│   ├── scrapling/               # Scrapling Python bridge
│   │   ├── controllers/
│   │   ├── router/
│   │   └── index.js            # spawns .venv python worker
│   ├── ui/
│   │   └── landing.js          # HTML API explorer (served at /)
│   ├── config/
│   │   ├── env.js             # Environment validation
│   │   └── errorHandler.js    # Error handling
│   └── utils/
│       ├── cache.js           # In-memory caching
│       ├── constants.js       # Base URLs & user agent
│       ├── scrapper-deps.js   # Scraping dependencies
│       └── scrapper-helpers.js # Helper functions
├── scripts/
│   └── scrapling_worker.py    # Python Scrapling worker (run via .venv)
├── package.json
├── vercel.json                # Vercel deployment config
└── README.md
```

---

## 🔀 Server Alias Mapping

> **Anixo** streams via MegaPlay: `megaplay` (AniList route) and `megaplay-mal` (MAL route).

> **AnimeKai** streams via MegaVid: `ani-hd`, `hd`, `hd-1`.

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
