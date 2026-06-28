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

*A RESTful API that unifies anime data across **HiAnime**, **Anixo**, **AnimeX**, and **Anikuro** — listings, search, metadata, schedules, and HLS streaming sources, all wrapped in a clean Hono interface.*

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
| 🌐 **Multi-Provider** | HiAnime · Anixo · AnimeX · Anikuro |
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

### HiAnime

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v2/hianime/home` | Spotlight, trending, top anime |
| `GET` | `/api/v2/hianime/azlist/:letter?page=1` | Browse anime A-Z |
| `GET` | `/api/v2/hianime/anime/:animeId` | Full anime details |
| `GET` | `/api/v2/hianime/anime/:animeId/episodes` | Episode list |
| `GET` | `/api/v2/hianime/search?q=&page=1` | Basic search |
| `GET` | `/api/v2/hianime/search/advanced` | Advanced filters |
| `GET` | `/api/v2/hianime/search/suggestion?q=` | Autocomplete |
| `GET` | `/api/v2/hianime/producer/:producer?page=1` | Filter by studio |
| `GET` | `/api/v2/hianime/genre/:genre?page=1` | Filter by genre |
| `GET` | `/api/v2/hianime/category/:category?page=1` | Curated lists |
| `GET` | `/api/v2/hianime/schedule?date=YYYY-MM-DD&timezone=UTC` | Daily schedule |
| `GET` | `/api/v2/hianime/episode/servers?animeEpisodeId=&ep=` | Get streaming servers (animeEpisodeId required) |
| `GET` | `/api/v2/hianime/episode/sources?animeEpisodeId=&ep=&server=&category=` | Get video sources (animeEpisodeId required) |

### Anikuro

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v2/anikuro/episode/servers?animeEpisodeId=&ep=` | Get streaming servers (animeEpisodeId required) |
| `GET` | `/api/v2/anikuro/episode/sources?animeEpisodeId=&ep=&server=&category=` | Get video sources (animeEpisodeId required) |

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

### AnimeX

> animex.one catalog via its own GraphQL (~20.5k titles, 685 pages) · MegaPlay streaming

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v2/animex/home` | Spotlight, trending, popular, seasonal |
| `GET` | `/api/v2/animex/azlist/:letter?page=1` | Full catalogue grid (685 pages) |
| `GET` | `/api/v2/animex/anime/:animeId` | Full anime details |
| `GET` | `/api/v2/animex/anime/:animeId/episodes` | Episode list |
| `GET` | `/api/v2/animex/search?q=&page=1` | Basic search |
| `GET` | `/api/v2/animex/search/advanced` | Advanced filters |
| `GET` | `/api/v2/animex/search/suggestion?q=` | Autocomplete |
| `GET` | `/api/v2/animex/producer/:producer?page=1` | Filter by studio |
| `GET` | `/api/v2/animex/genre/:genre?page=1` | Filter by genre |
| `GET` | `/api/v2/animex/category/:category?page=1` | Curated lists |
| `GET` | `/api/v2/animex/schedule?date=YYYY-MM-DD&timezone=UTC` | Daily schedule |
| `GET` | `/api/v2/animex/episode/servers?animeEpisodeId=&ep=` | Streaming servers |
| `GET` | `/api/v2/animex/episode/sources?animeEpisodeId=&ep=&server=megaplay&category=sub` | Video sources (m3u8) |
| `GET` | `/api/v2/animex/proxy?url=&ref=` | HLS playlist proxy |

---

## 💡 Usage Examples

### Get Trending Anime
```bash
curl "http://localhost:3000/api/v2/hianime/home"
```

### Search for Anime
```bash
curl "http://localhost:3000/api/v2/hianime/search?q=attack%20on%20titan&page=1"
```

### Get Anime Details
```bash
curl "http://localhost:3000/api/v2/hianime/anime/one-piece"
```

### Get Episode Servers
```bash
curl "http://localhost:3000/api/v2/hianime/episode/servers?animeEpisodeId=one-piece&ep=1"
```

### Advanced Search
```bash
curl "http://localhost:3000/api/v2/hianime/search/advanced?q=titan&genres=action&type=movie&sort=score&page=1"
```

### Get Schedule
```bash
curl "http://localhost:3000/api/v2/hianime/schedule?date=2026-05-22&timezone=UTC"
```

### Get Episode Sources (Anikuro)
```bash
curl "http://localhost:3000/api/v2/anikuro/episode/sources?animeEpisodeId=199221:1&ep=1&server=anikoto&category=dub"
```

### Get Episode Sources (AnimeX — MegaPlay m3u8)
```bash
curl "http://localhost:3000/api/v2/animex/episode/sources?animeEpisodeId=21&ep=1&server=megaplay&category=sub"
```

---

## ⚙️ Configuration

Create a `.env` file in the project root:

```env
PORT=3000                    # Server port (default: 3000)
NODE_ENV=development         # Environment: development/production/test

# WebTorrent cache (controls disk usage for streamed torrents)
WEBTORRENT_CACHE_DIR=/tmp/webtorrent   # Where downloaded chunks are stored
WEBTORRENT_MAX_TORRENTS=5             # LRU cap on loaded torrents
WEBTORRENT_MAX_BYTES=5368709120       # LRU cap in bytes (default 5 GiB)
```

---

## 🛠️ Tech Stack

<div align="center">

| Technology | Purpose |
|------------|---------|
| <img src="https://img.shields.io/badge/Hono-ee6c00?style=flat-square&logo=fire" height="20"> | Web framework |
| <img src="https://img.shields.io/badge/Puppeteer-40B5A4?style=flat-square&logo=headless-browser" height="20"> | Headless browser scraping |
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
│   ├── hianime/
│   │   ├── controllers/        # Business logic
│   │   ├── router/            # Route definitions
│   │   └── scraper/           # Scraping utilities
│   ├── anikuro/                # Streaming-only provider
│   │   ├── controllers/
│   │   ├── router/
│   │   └── scraper/
│   ├── anixo/                  # AniList listings + MegaPlay streaming
│   │   ├── controllers/
│   │   ├── router/
│   │   └── scraper/
│   ├── animex/                 # animex.one catalog + MegaPlay streaming
│   │   ├── controllers/
│   │   ├── router/
│   │   └── scraper/
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
├── package.json
├── vercel.json                # Vercel deployment config
└── README.md
```

---

## 🔀 Server Alias Mapping

| Alias | Provider |
|-------|----------|
| `hd-1` | megacloud |
| `hd-2` | vidsrc |
| `hd-3` | mycloud |

> **Anixo / AnimeX** stream via MegaPlay: `megaplay` (AniList route) and `megaplay-mal` (MAL route).

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
