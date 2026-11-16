// API explorer served at "/" (hub) and "/p/:id" (one page per provider).
// The endpoint catalog below is the single source of truth — it renders the
// HTML and also backs /endpoints.json.

// Build the standard provider surface (listings + search + discover + streaming).
const fullProvider = ({ id, name, accent, source, anime, epId, server, proxy }) => {
  const b = `/api/v2/${id}`;
  const listings = [
    { label: 'Home', path: `${b}/home`, desc: 'Spotlight, trending, popular, top-airing & seasonal rows.' },
    { label: 'A–Z list', path: `${b}/azlist/A?page=1`, desc: 'Full catalogue grid, paginated.' },
    { label: 'Anime details', path: `${b}/anime/${anime}`, desc: 'Synopsis, score, studios, characters, relations.' },
    { label: 'Episodes', path: `${b}/anime/${anime}/episodes`, desc: 'Episode list with titles, fillers & air dates.' },
  ];
  return {
    id,
    name,
    accent,
    source,
    groups: [
      {
        title: 'Listings',
        items: listings,
      },
      {
        title: 'Search',
        items: [
          { label: 'Search', path: `${b}/search?q=naruto&page=1`, desc: 'Keyword search.' },
          { label: 'Advanced search', path: `${b}/search/advanced?q=naruto&type=tv&genres=action&page=1`, desc: 'Filter by type, genre, season, year, status, sort.' },
          { label: 'Suggestions', path: `${b}/search/suggestion?q=naruto`, desc: 'Autocomplete suggestions.' },
        ],
      },
      {
        title: 'Discover',
        items: [
          { label: 'Producer', path: `${b}/producer/toei-animation?page=1`, desc: 'Titles by studio / producer.' },
          { label: 'Genre', path: `${b}/genre/action?page=1`, desc: 'Titles by genre.' },
          { label: 'Category', path: `${b}/category/most-popular?page=1`, desc: 'Curated categories (most-popular, etc.).' },
          { label: 'Schedule', path: `${b}/schedule`, desc: 'Weekly release calendar: weekday-premiere buckets, upcoming premieres (date-sorted) and currently airing.' },
        ],
      },
      {
        title: 'Streaming',
        items: [
          { label: 'Episode servers', path: `${b}/episode/servers?animeEpisodeId=${epId}&ep=1`, desc: 'Available sub/dub servers for an episode.' },
          { label: 'Episode sources', path: `${b}/episode/sources?animeEpisodeId=${epId}&ep=1&server=${server}&category=sub`, desc: 'Playable m3u8 + subtitle tracks, intro/outro.' },
          ...(proxy
            ? [{ label: 'Stream proxy', path: `${b}/proxy?url=...&ref=...`, desc: 'CORS/referer proxy that rewrites the HLS playlist.', noTry: true }]
            : []),
        ],
      },
    ],
  };
};

export const API_CATALOG = {
  name: 'Shirayuki Anime API',
  tagline: 'A unified anime API across multiple providers — listings, search, metadata & HLS streaming.',
  providers: [
    {
      id: 'hianime',
      name: 'HiAnime',
      accent: '#f472b6',
      source: 'hianime.at scrape + MegaPlay',
      groups: [
        {
          title: 'Listings',
          items: [
            { label: 'Home', path: '/api/v2/hianime', desc: 'Spotlight, trending, featured blocks, top-viewed charts & latest sections.' },
            { label: 'Browse', path: '/api/v2/hianime/browse/az-list?page=1', desc: 'Curated / category listing pages (az-list, most-popular, tv, movie...).' },
            { label: 'Anime details', path: '/api/v2/hianime/anime/one-piece-1', desc: 'Synopsis, score, genres, rating & metadata from the detail page.' },
            { label: 'Episodes', path: '/api/v2/hianime/anime/one-piece-1/episodes', desc: 'Full episode list with episode ids and watch URLs.' },
            { label: 'Seasons', path: '/api/v2/hianime/anime/one-piece-1/seasons', desc: 'Franchise seasons derived from search: base-title, season markers, stable ordering.' },
            { label: 'Art (watching)', path: '/api/v2/hianime/anime/one-piece-1/art', desc: 'Bundle for the anime being watched: title art + sibling posters, artists, characters & company.' },
            { label: 'Schedule', path: '/api/v2/hianime/schedule', desc: 'Weekly release calendar: weekday-premiere buckets, upcoming premieres (date-sorted) and currently airing.' },
          ],
        },
        {
          title: 'Search',
          items: [
            { label: 'Search', path: '/api/v2/hianime/search?q=naruto&page=1', desc: 'Keyword search.' },
            { label: 'Genre', path: '/api/v2/hianime/genre/action?page=1', desc: 'Titles by genre.' },
            { label: 'Suggestions', path: '/api/v2/hianime/search/suggestion?q=naruto', desc: 'Autocomplete suggestions.' },
          ],
        },
        {
          title: 'Streaming',
          items: [
            { label: 'Episode servers', path: '/api/v2/hianime/episode/servers?animeEpisodeId=one-piece-1&ep=1', desc: 'Available sub/dub servers (HD-1, HD-2) for an episode.' },
            { label: 'Episode sources', path: '/api/v2/hianime/episode/sources?animeEpisodeId=one-piece-1&ep=1&server=HD-1&category=sub', desc: 'Playable m3u8 + subtitle tracks via the MegaPlay AES-CBC resolver.' },
            { label: 'Stream proxy', path: '/api/v2/hianime/proxy?url=...&ref=...', desc: 'CORS/referer proxy that rewrites the HLS playlist.', noTry: true },
          ],
        },
      ],
    },
    {
      id: 'anikoto',
      name: 'Anikoto',
      accent: '#34d399',
      source: 'anikototv.to scrape + MegaPlay',
      groups: [
        {
          title: 'Listings',
          items: [
            { label: 'Home', path: '/api/v2/anikoto', desc: 'Spotlight, latest-episodes, upcoming, new-release, recently-added, latest-completed & top Day/Week/Month rankings.' },
            { label: 'Anime details', path: '/api/v2/anikoto/anime/naruto-eybxz', desc: 'Synopsis, genres, studios, producers, premiere, score & full episode list.' },
            { label: 'Episodes', path: '/api/v2/anikoto/anime/naruto-eybxz/episodes', desc: 'Episode list with sub/dub availability and range chips.' },
          ],
        },
        {
          title: 'Search',
          items: [
            { label: 'Search', path: '/api/v2/anikoto/search?q=naruto&page=1', desc: 'Keyword search (Anikoto /filter).' },
            { label: 'Suggestions', path: '/api/v2/anikoto/search/suggestion?q=naruto', desc: 'Search-style suggestions (filter page top results).' },
          ],
        },
        {
          title: 'Streaming',
          items: [
            { label: 'Episode servers', path: '/api/v2/anikoto/episode/servers?animeId=naruto-eybxz&ep=1', desc: 'Available sub/dub servers (HD-1, Vidstream-1, Vidstream-2) for an episode.' },
            { label: 'Episode sources', path: '/api/v2/anikoto/episode/sources?animeId=naruto-eybxz&ep=1&server=Vidstream-2&category=sub', desc: 'Playable m3u8 + subtitle tracks via the MegaPlay AES-CBC resolver.' },
            { label: 'Stream proxy', path: '/api/v2/anikoto/proxy?url=...&ref=...', desc: 'CORS/referer proxy that rewrites the HLS playlist.', noTry: true },
          ],
        },
      ],
    },
    {
      id: 'animex',
      name: 'Animex',
      accent: '#60a5fa',
      source: 'animex.one GraphQL + pp player API',
      groups: [
        {
          title: 'Listings',
          items: [
            { label: 'Home', path: '/api/v2/animex', desc: 'Trending, popular, latest additions (site GraphQL catalog) & recent episode releases.' },
            { label: 'Anime details', path: '/api/v2/animex/anime/naruto-20', desc: 'Synopsis, score, genres, studios, characters, relations & recommendations.' },
            { label: 'Episodes', path: '/api/v2/animex/anime/naruto-20/episodes', desc: 'Episode list with titles, fillers & thumbnails from the player API.' },
          ],
        },
        {
          title: 'Search',
          items: [
            { label: 'Catalog', path: '/api/v2/animex/catalog?page=1', desc: 'Full catalog browse like the site /catalog page (691 pages, 30/page). Supports q, page, sort & perPage.' },
            { label: 'Search', path: '/api/v2/animex/search?q=naruto&page=1', desc: 'Keyword search over the site catalog (GraphQL catalogAnime). q optional — omit for full-catalog pagination.' },
            { label: 'Suggestions', path: '/api/v2/animex/search/suggestion?q=naruto', desc: 'Autocomplete-style suggestions.' },
          ],
        },
        {
          title: 'Streaming',
          items: [
            { label: 'Episode servers', path: '/api/v2/animex/episode/servers?animeId=naruto-20&ep=1', desc: 'Available sub/dub providers (Nero, Yuki, Zuna...) for an episode.' },
            { label: 'Episode sources', path: '/api/v2/animex/episode/sources?animeId=naruto-20&ep=1&server=nero&category=sub', desc: 'Playable m3u8 + subtitle tracks + intro/outro chapters.' },
            { label: 'Stream proxy', path: '/api/v2/animex/proxy?url=...&ref=...', desc: 'CORS/referer proxy that rewrites the HLS playlist.', noTry: true },
          ],
        },
      ],
    },
    {
      id: 'reanime',
      name: 'Re:ANIME',
      accent: '#f59e0b',
      source: 'reanime.cz public JSON API',
      groups: [
        {
          title: 'Listings',
          items: [
            { label: 'Home', path: '/api/v2/reanime', desc: 'Trending, latest-aired, new-on-site & upcoming rows from reanime.cz/api/v1/home.' },
            { label: 'Schedule', path: '/api/v2/reanime/schedule', desc: 'Weekly release calendar (UTC): per-day episode buckets + flat date-sorted list.' },
            { label: 'Catalog', path: '/api/v2/reanime/catalog?page=1&format=TV', desc: 'Full-catalog browse; filters: format, status, season, year (sort is ignored upstream).' },
            { label: 'Genre', path: '/api/v2/reanime/genre/action?page=1', desc: 'Titles by genre.' },
            { label: 'Anime details', path: '/api/v2/reanime/anime/go-lion-4q2k84', desc: 'Synopsis, score, genres, tags, external ids, studios & air dates.' },
            { label: 'Episodes', path: '/api/v2/reanime/anime/go-lion-4q2k84/episodes', desc: 'Episode list with titles, thumbnails, fillers & air dates (paginated).' },
            { label: 'Seasons', path: '/api/v2/reanime/anime/go-lion-4q2k84/seasons', desc: 'Franchise relations + external season counts.' },
            { label: 'Characters', path: '/api/v2/reanime/anime/go-lion-4q2k84/characters', desc: 'Character list with roles.' },
            { label: 'Artists', path: '/api/v2/reanime/anime/go-lion-4q2k84/artists', desc: 'Staff list with roles.' },
            { label: 'Art', path: '/api/v2/reanime/anime/go-lion-4q2k84/art', desc: 'Poster/banner/colour, studios & artwork images.' },
          ],
        },
        {
          title: 'Search',
          items: [
            { label: 'Search', path: '/api/v2/reanime/search?q=naruto', desc: 'Keyword search; filters: format, status, season, year, genre.' },
            { label: 'Suggestions', path: '/api/v2/reanime/search/suggestion?q=naruto', desc: 'Autocomplete-style suggestions.' },
          ],
        },
        {
          title: 'Streaming',
          items: [
            { label: 'Episode servers', path: '/api/v2/reanime/episode/servers?animeId=go-lion-4q2k84&ep=1', desc: 'Sub/dub flixcloud servers (HD-1, HD-2) with embed links.' },
            { label: 'Episode sources', path: '/api/v2/reanime/episode/sources?animeId=go-lion-4q2k84&ep=1', desc: 'hianime-shaped response with a real server-resolved m3u8 (WASM de-obfuscation + XOR-decrypted playlist) and a proxied proxyM3u8.' },
            { label: 'Proxy', path: '/api/v2/reanime/proxy?url=...', desc: 'HLS proxy: decrypts flixcloud playlists and rewrites children; plays through hls.js.' },
            { label: 'Player page', path: '/api/v2/reanime/play?animeId=go-lion-4q2k84&ep=1', desc: 'Built-in HLS player that plays the reanime proxyM3u8 through hls.js.' },
          ],
        },
      ],
    },
    {
      id: 'anv',
      name: 'anv',
      accent: '#22c55e',
      source: 'anv.to catalog API + Scrapling session cookie',
      groups: [
        {
          title: 'Listings',
          items: [
            { label: 'Home', path: '/api/v2/anv', desc: 'Home sections (hero, trending, ...) from anv.to /api/catalog HomeAnime.' },
            { label: 'Browse', path: '/api/v2/anv/browse?page=1', desc: 'Paginated full-catalog browse.' },
            { label: 'Anime details', path: '/api/v2/anv/anime/naruto-eybxz', desc: 'Synopsis, score, genres, studios, MAL id & anv numeric id.' },
            { label: 'Episodes', path: '/api/v2/anv/anime/naruto-eybxz/episodes', desc: 'Episode list with titles, thumbnails & fillers.' },
          ],
        },
        {
          title: 'Search',
          items: [
            { label: 'Search', path: '/api/v2/anv/search?q=naruto&page=1', desc: 'Keyword search with pageInfo.' },
          ],
        },
        {
          title: 'Streaming',
          items: [
            { label: 'Episode servers', path: '/api/v2/anv/episode/servers?animeId=naruto-eybxz&ep=1', desc: 'hianime-shaped sub/dub server lists (Orange/Pear/Banana). Pass a serverId or name as ?server= to Episode sources.' },
            { label: 'Episode sources', path: '/api/v2/anv/episode/sources?animeId=naruto-eybxz&ep=1&category=sub', desc: 'hianime-shaped response: m3u8 link, subtitle tracks, AniSkip intro/outro, proxied proxyM3u8. First call launches a stealth browser for the session cookie (~4s).' },
            { label: 'Proxy', path: '/api/v2/anv/proxy?url=...', desc: 'Cookie-carrying HLS proxy for anv.to/stream/* (master, variants, disguised TS segments, VTT).', noTry: true },
            { label: 'Player page', path: '/api/v2/anv/play?animeId=naruto-eybxz&ep=1', desc: 'Built-in HLS player that plays the anv stream through hls.js.' },
          ],
        },
      ],
    },
  ],
};

// Short monogram per provider — UI-only, kept out of API_CATALOG so
// /endpoints.json stays a clean API description.
const MARKS = { hianime: 'HI', anikoto: 'AK', animex: 'AX', reanime: 'RA', anv: 'AV' };
const mark = (p) => MARKS[p.id] || p.name.slice(0, 2).toUpperCase();

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const countEndpoints = (p) => p.groups.reduce((n, g) => n + g.items.length, 0);
const countAllEndpoints = () => API_CATALOG.providers.reduce((n, p) => n + countEndpoints(p), 0);

const CHEVRON = `<svg class="pgo" viewBox="0 0 24 24" width="15" height="15" fill="none"
  stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
  aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>`;

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600&family=Space+Grotesk:wght@400;500;600&display=swap" />`;

const renderItem = (item) => {
  const tryBtn = item.noTry
    ? `<span class="btn btn-off" title="Fill in url &amp; ref">Try</span>`
    : `<a class="btn btn-try" href="${esc(item.path)}" target="_blank" rel="noopener">Try</a>`;
  return `
    <article class="ep" data-search="${esc((item.label + ' ' + item.desc + ' ' + item.path).toLowerCase())}">
      <div class="ep-body">
        <div class="ep-head">
          <h3 class="ep-title">${esc(item.label)}</h3>
          <p class="ep-desc">${esc(item.desc)}</p>
        </div>
        <code class="ep-path">${esc(item.path)}</code>
      </div>
      <div class="ep-actions">
        ${tryBtn}
        <button class="btn btn-copy" data-path="${esc(item.path)}" type="button">Copy</button>
      </div>
    </article>`;
};

const renderGroup = (group) => `
  <section class="group">
    <header class="sec-head">
      <h2>${esc(group.title)}</h2>
      <span class="n">${group.items.length}</span>
    </header>
    <div class="ep-list">${group.items.map(renderItem).join('')}</div>
  </section>`;

const renderProviderRow = (p) => `
  <li class="prow" style="--accent:${esc(p.accent)}">
    <a href="/p/${esc(p.id)}">
      <span class="mark">${esc(mark(p))}</span>
      <span class="pbody">
        <span class="pname">${esc(p.name)}</span>
        <span class="psrc">${esc(p.source)}</span>
      </span>
      <span class="pcnt">${countEndpoints(p)}</span>
      ${CHEVRON}
    </a>
  </li>`;

const SPECIMEN = `
  <div class="specimen" role="group" aria-label="Example request and response">
    <div class="srow">
      <span class="sk">Request</span>
      <code><span class="tok-get">GET</span> <span class="tok-path">/api/v2/hianime/episode/sources</span><span class="tok-dim">?animeEpisodeId=one-piece-1&amp;ep=1</span></code>
    </div>
    <div class="srow">
      <span class="sk">Response</span>
      <code><span class="tok-dim">{</span> <span class="tok-key">"success"</span><span class="tok-dim">:</span> <span class="tok-val">true</span><span class="tok-dim">,</span> <span class="tok-key">"data"</span><span class="tok-dim">:</span> <span class="tok-dim">{ … }</span><span class="tok-dim">,</span> <span class="tok-key">"extractionTimeSec"</span><span class="tok-dim">:</span> <span class="tok-val">0.42</span> <span class="tok-dim">}</span></code>
    </div>
  </div>`;

const CLIENT_JS = `
  (function () {
    function toast(msg) {
      var t = document.getElementById('toast');
      if (!t) return;
      t.textContent = msg;
      t.classList.add('show');
      clearTimeout(window.__tt);
      window.__tt = setTimeout(function () { t.classList.remove('show'); }, 1600);
    }

    // Copy the full endpoint URL to the clipboard.
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('.btn-copy');
      if (!btn) return;
      var path = btn.dataset.path;
      var full = location.origin + path;
      if (!navigator.clipboard) { toast('Clipboard unavailable'); return; }
      navigator.clipboard.writeText(full).then(
        function () { toast('Copied ' + path); },
        function () { toast('Could not copy'); }
      );
    });

    // Live filter over endpoints on a provider page.
    var q = document.getElementById('search');
    if (!q) return;
    q.addEventListener('input', function () {
      var term = q.value.trim().toLowerCase();
      var items = document.querySelectorAll('.ep');
      items.forEach(function (el) {
        el.hidden = !!term && el.dataset.search.indexOf(term) === -1;
      });
      document.querySelectorAll('.group').forEach(function (g) {
        g.hidden = !g.querySelector('.ep:not([hidden])');
      });
      var empty = document.getElementById('empty');
      if (empty) {
        var any = document.querySelector('.ep:not([hidden])');
        empty.hidden = !!any;
      }
    });
  })();
`;

const BASE_CSS = `:root{
  /* Sode no Shirayuki tokens — glacial slate surfaces, one frost accent. */
  --base:oklch(0.07 0.012 250);
  --surface:oklch(0.12 0.013 250);
  --surface-2:oklch(0.16 0.014 250);
  --line:oklch(0.26 0.015 250);
  --snow:oklch(0.97 0.004 240);
  --muted:oklch(0.82 0.014 245);
  --faint:oklch(0.78 0.014 248);
  --frost:oklch(0.82 0.12 215);
  --frost-lift:oklch(0.88 0.11 210);
  --ok:oklch(0.8 0.13 165);

  --font-sans:"Plus Jakarta Sans",ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
  --font-display:"Manrope","Plus Jakarta Sans",ui-sans-serif,system-ui,sans-serif;
  --font-accent:"Space Grotesk",ui-monospace,SFMono-Regular,Menlo,monospace;
}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{
  margin:0;color:var(--snow);font-family:var(--font-sans);font-size:15px;line-height:1.6;
  -webkit-font-smoothing:antialiased;
  background:
    radial-gradient(940px 460px at 8% -14%,oklch(0.82 0.12 215 / 0.075),transparent 64%),
    radial-gradient(720px 380px at 96% 4%,oklch(0.83 0.07 350 / 0.045),transparent 62%),
    var(--base);
  min-height:100vh;
}
a{color:inherit;text-decoration:none}
:focus-visible{outline:2px solid var(--frost);outline-offset:3px;border-radius:4px}
.wrap{max-width:1060px;margin:0 auto;padding:0 32px}
@media(max-width:560px){.wrap{padding:0 20px}}

/* ── Top bar ───────────────────────────────────────────── */
.top{position:sticky;top:0;z-index:30;border-bottom:1px solid var(--line);
  background:color-mix(in oklch,var(--base) 86%,transparent);
  backdrop-filter:blur(16px) saturate(1.25)}
.top-in{display:flex;align-items:center;gap:14px;height:64px}
.brand{display:flex;align-items:center;gap:11px;font-family:var(--font-display);
  font-weight:800;font-size:16.5px;letter-spacing:-.012em;line-height:1}
.brand .glyph{width:32px;height:32px;border-radius:9px;display:grid;place-items:center;
  background:var(--frost);color:var(--base);font-size:14.5px;font-weight:800;line-height:1;
  box-shadow:inset 0 1px 0 oklch(1 0 0 / 0.18)}
.brand .api{color:var(--faint);font-weight:600;font-size:.86em;letter-spacing:.015em}
@media(max-width:560px){
  .top-in{height:58px}
  .brand{font-size:15.5px;gap:10px}
  .brand .glyph{width:28px;height:28px;border-radius:8px;font-size:13px}
}
.top-right{margin-left:auto;display:flex;align-items:center;gap:16px}
.top-link{font-family:var(--font-accent);font-size:13px;color:var(--faint);transition:color .16s}
.top-link:hover{color:var(--frost)}

/* ── Hero ──────────────────────────────────────────────── */
.hero{padding:80px 0 0}
.hero h1{font-family:var(--font-display);font-weight:800;letter-spacing:-.032em;
  font-size:clamp(2.3rem,5.4vw,3.4rem);line-height:1.03;margin:0 0 20px;max-width:15ch}
.lede{margin:0 0 34px;max-width:54ch;color:var(--muted);font-size:16px}
@media(max-width:560px){.hero{padding-top:56px}.lede{font-size:15px}}

/* Request/response specimen — the page's one memorable artifact. */
.specimen{border:1px solid var(--line);border-radius:13px;background:var(--surface);
  overflow:hidden;max-width:760px}
.srow{display:grid;grid-template-columns:84px 1fr;gap:18px;align-items:baseline;padding:15px 18px}
.srow + .srow{border-top:1px solid var(--line)}
.sk{font-size:11.5px;color:var(--faint);letter-spacing:.01em}
.srow code{font-family:var(--font-accent);font-size:12.5px;line-height:1.75;
  word-break:break-word;color:var(--snow)}
.tok-get{color:var(--ok);font-weight:600}
.tok-path{color:var(--frost)}
.tok-dim{color:var(--faint)}
.tok-key{color:var(--muted)}
.tok-val{color:var(--frost)}
@media(max-width:560px){
  .srow{grid-template-columns:1fr;gap:6px;padding:13px 15px}
  .srow code{font-size:12px}
}

/* ── Section heading ───────────────────────────────────── */
.sec-head{display:flex;align-items:baseline;gap:12px;
  padding:0 4px 12px;border-bottom:1px solid var(--line)}
.sec-head h2{font-family:var(--font-display);font-size:1.0625rem;font-weight:700;
  letter-spacing:-.012em;margin:0;color:var(--snow)}
.sec-head .n{margin-left:auto;font-family:var(--font-accent);font-size:12.5px;color:var(--faint)}

/* ── Provider index (hub) ──────────────────────────────── */
.index{padding:62px 0 84px}
.plist{list-style:none;margin:0;padding:0}
.prow a{position:relative;display:grid;grid-template-columns:38px 1fr auto 15px;gap:18px;
  align-items:center;padding:17px 8px 17px 15px;border-bottom:1px solid var(--line);
  transition:background-color .18s ease}
.prow a::before{content:"";position:absolute;left:0;top:15px;bottom:15px;width:2px;
  border-radius:2px;background:var(--accent);opacity:0;transition:opacity .18s ease}
.prow a:hover{background:color-mix(in oklch,var(--surface) 65%,transparent)}
.prow a:hover::before{opacity:1}
.prow a:hover .pgo{color:var(--frost);transform:translateX(3px)}
.mark{width:38px;height:38px;border-radius:10px;display:grid;place-items:center;
  border:1px solid var(--line);background:var(--surface);color:var(--accent);
  font-family:var(--font-accent);font-size:12px;font-weight:600;letter-spacing:.03em;
  transition:border-color .18s ease}
.prow a:hover .mark{border-color:color-mix(in oklch,var(--accent) 45%,var(--line))}
.pbody{min-width:0}
.pname{display:block;font-family:var(--font-display);font-size:1.0625rem;font-weight:700;
  letter-spacing:-.014em;line-height:1.25}
.psrc{display:block;color:var(--faint);font-size:12.5px;font-family:var(--font-accent);
  margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pcnt{font-family:var(--font-accent);font-size:12.5px;color:var(--muted)}
.pgo{color:var(--faint);transition:color .18s ease,transform .18s ease}
@media(max-width:560px){
  .prow a{grid-template-columns:34px 1fr 13px;gap:14px;padding:15px 4px 15px 13px}
  .pcnt{display:none}
  .mark{width:34px;height:34px;border-radius:9px;font-size:11px}
}

/* ── Provider page header ──────────────────────────────── */
.phead{display:flex;gap:18px;align-items:flex-start;padding:52px 0 8px}
.phead .mark{width:52px;height:52px;border-radius:13px;font-size:13px;flex:0 0 auto}
.phead h1{font-family:var(--font-display);font-weight:800;letter-spacing:-.028em;
  font-size:clamp(1.85rem,3.8vw,2.4rem);line-height:1.1;margin:0 0 7px}
.phead .src{margin:0;color:var(--muted);font-size:13.5px}
.pmeta{display:flex;flex-wrap:wrap;gap:8px 20px;margin-top:11px;
  font-family:var(--font-accent);font-size:12.5px;color:var(--faint)}
.pmeta .path{color:var(--frost)}
@media(max-width:560px){.phead{padding-top:38px}.phead .mark{width:44px;height:44px}}

/* Provider switcher + search */
.toolbar{display:flex;align-items:center;gap:14px;flex-wrap:wrap;
  padding:22px 0 6px;border-bottom:1px solid var(--line)}
.switch{display:flex;gap:2px;padding:3px;border:1px solid var(--line);border-radius:10px;
  background:var(--surface);max-width:100%;overflow-x:auto;scrollbar-width:none}
.switch::-webkit-scrollbar{display:none}
.switch a{padding:6px 12px;border-radius:7px;font-size:12.5px;font-weight:600;
  color:var(--muted);white-space:nowrap;transition:background-color .16s ease,color .16s ease}
.switch a:hover{color:var(--snow)}
.switch a[aria-current="page"]{background:var(--surface-2);color:var(--snow);
  box-shadow:inset 0 0 0 1px var(--line)}
.search{position:relative;margin-left:auto;min-width:250px;flex:1;max-width:330px}
.search input{width:100%;padding:8px 13px 8px 34px;border-radius:9px;border:1px solid var(--line);
  background:var(--surface);color:var(--snow);font-family:var(--font-sans);font-size:13px;
  outline:none;transition:border-color .16s ease,box-shadow .16s ease}
.search input::placeholder{color:var(--faint)}
.search input:focus{border-color:var(--frost);box-shadow:0 0 0 3px oklch(0.82 0.12 215 / 0.14)}
.search .ic{position:absolute;left:11px;top:50%;transform:translateY(-50%);
  color:var(--faint);font-size:14px;pointer-events:none}
@media(max-width:720px){
  .search{margin-left:0;max-width:none;min-width:0;width:100%}
  .toolbar{padding-top:18px}
}

/* ── Endpoint groups ───────────────────────────────────── */
main.body{padding-bottom:84px}
.group{margin-top:42px}
.ep-list{margin-top:2px}
.ep{position:relative;display:grid;grid-template-columns:1fr auto;gap:22px;
  align-items:start;padding:16px 8px 16px 15px;border-bottom:1px solid var(--line);
  transition:background-color .18s ease}
.ep::before{content:"";position:absolute;left:0;top:13px;bottom:13px;width:2px;
  border-radius:2px;background:var(--frost);opacity:0;transition:opacity .18s ease}
.ep:hover{background:color-mix(in oklch,var(--surface) 60%,transparent)}
.ep:hover::before{opacity:1}
.ep-body{min-width:0}
.ep-head{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.ep-title{font-family:var(--font-display);font-size:.9375rem;font-weight:700;
  letter-spacing:-.008em;margin:0;line-height:1.4}
.ep-desc{margin:0;color:var(--faint);font-size:13px;line-height:1.5}
.ep-path{display:block;margin-top:7px;font-family:var(--font-accent);font-size:12.5px;
  color:var(--muted);word-break:break-all;line-height:1.6}
.ep-actions{display:flex;gap:8px;flex:0 0 auto;padding-top:1px}
@media(max-width:620px){
  .ep{grid-template-columns:1fr;gap:12px;padding:15px 4px 15px 13px}
  .ep-actions{padding-top:0}
  .ep-desc{width:100%}
}

/* Buttons */
.btn{display:inline-flex;align-items:center;justify-content:center;
  font-family:var(--font-sans);font-size:12.5px;font-weight:600;line-height:1;
  border-radius:7px;padding:7px 13px;cursor:pointer;white-space:nowrap;
  border:1px solid var(--line);background:transparent;color:var(--muted);
  transition:color .16s ease,border-color .16s ease,background-color .16s ease}
.btn-try{background:var(--frost);border-color:var(--frost);color:var(--base)}
.btn-try:hover{background:var(--frost-lift);border-color:var(--frost-lift)}
.btn-copy:hover{color:var(--snow);border-color:color-mix(in oklch,var(--frost) 50%,var(--line))}
.btn-off{opacity:.4;cursor:not-allowed}

/* Empty search state */
#empty{padding:52px 4px;color:var(--faint);font-size:14px}
#empty strong{color:var(--muted);font-weight:600}

/* Toast + footer */
#toast{position:fixed;left:50%;bottom:28px;transform:translate(-50%,14px);
  background:var(--surface-2);border:1px solid var(--line);color:var(--snow);
  padding:11px 17px;border-radius:10px;font-size:13px;z-index:50;
  opacity:0;pointer-events:none;transition:opacity .2s ease,transform .2s ease}
#toast.show{opacity:1;transform:translate(-50%,0)}
footer{border-top:1px solid var(--line);padding:24px 0 56px;
  color:var(--faint);font-size:12.5px;display:flex;flex-wrap:wrap;gap:6px 14px}
footer code{font-family:var(--font-accent);color:var(--muted);
  background:var(--surface);padding:2px 6px;border-radius:5px;border:1px solid var(--line)}
footer a{color:var(--muted);border-bottom:1px solid var(--line)}
footer a:hover{color:var(--frost);border-color:var(--frost)}

@media(prefers-reduced-motion:reduce){
  *,*::before,*::after{transition:none!important;animation:none!important}
  html{scroll-behavior:auto}
}`;

const topBar = (right = '') => `
  <div class="top">
    <div class="wrap top-in">
      <a class="brand" href="/"><span class="glyph" aria-hidden="true">桜</span>Shirayuki<span class="api">API</span></a>
      <div class="top-right">
        <a class="top-link" href="/endpoints.json">endpoints.json</a>
        ${right}
      </div>
    </div>
  </div>`;

export const renderLandingPage = () => {
  const providerCount = API_CATALOG.providers.length;
  const total = countAllEndpoints();

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(API_CATALOG.name)}</title>
<meta name="description" content="${esc(API_CATALOG.tagline)}" />
${FONTS}
<style>${BASE_CSS}</style>
</head>
<body>
  ${topBar(`<span class="top-link" aria-hidden="true">v2</span>`)}

  <header class="wrap hero">
    <h1>One envelope. Every provider.</h1>
    <p class="lede">Listings, search, metadata and HLS stream resolution from
      ${providerCount} upstream catalogs, returned in a single response shape.
      ${total} documented endpoints, all <code>GET</code>, all JSON.</p>
    ${SPECIMEN}
  </header>

  <main class="wrap index">
    <header class="sec-head">
      <h2>Providers</h2>
      <span class="n">${providerCount}</span>
    </header>
    <ul class="plist">${API_CATALOG.providers.map(renderProviderRow).join('')}</ul>
  </main>

  <footer class="wrap">
    <span>Base path <code>/api/v2/&lt;provider&gt;</code></span>
    <span>Raw catalog <a href="/endpoints.json">/endpoints.json</a></span>
    <span>Every route returns <code>{ success, data, extractionTimeSec }</code></span>
  </footer>

  <div id="toast" role="status" aria-live="polite"></div>
  <script>${CLIENT_JS}</script>
</body>
</html>`;
};

export const renderProviderPage = (providerId) => {
  const p = API_CATALOG.providers.find((pr) => pr.id === providerId);
  if (!p) return null;
  const total = countEndpoints(p);

  const switcher = API_CATALOG.providers
    .map((pr) => {
      const current = pr.id === p.id ? ' aria-current="page"' : '';
      return `<a href="/p/${esc(pr.id)}"${current}>${esc(pr.name)}</a>`;
    })
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(p.name)} · ${esc(API_CATALOG.name)}</title>
<meta name="description" content="${esc(p.name)} endpoints — ${esc(p.source)}." />
${FONTS}
<style>${BASE_CSS}</style>
</head>
<body>
  ${topBar()}

  <header class="wrap">
    <div class="phead" style="--accent:${esc(p.accent)}">
      <span class="mark" aria-hidden="true">${esc(mark(p))}</span>
      <div>
        <h1>${esc(p.name)}</h1>
        <p class="src">${esc(p.source)}</p>
        <div class="pmeta">
          <span class="path">/api/v2/${esc(p.id)}</span>
          <span>${total} endpoints</span>
          <span>${p.groups.length} groups</span>
        </div>
      </div>
    </div>

    <div class="toolbar">
      <nav class="switch" aria-label="Providers">
        <a href="/">All</a>${switcher}
      </nav>
      <div class="search">
        <span class="ic" aria-hidden="true">⌕</span>
        <input id="search" type="search" placeholder="Filter ${esc(p.name)} endpoints"
          aria-label="Filter endpoints" autocomplete="off" />
      </div>
    </div>
  </header>

  <main class="wrap body">
    ${p.groups.map(renderGroup).join('')}
    <p id="empty" hidden>No endpoints match that filter.</p>
  </main>

  <footer class="wrap">
    <span>Base path <code>/api/v2/${esc(p.id)}</code></span>
    <span>Raw catalog <a href="/endpoints.json">/endpoints.json</a></span>
    <span>Every route returns <code>{ success, data, extractionTimeSec }</code></span>
  </footer>

  <div id="toast" role="status" aria-live="polite"></div>
  <script>${CLIENT_JS}</script>
</body>
</html>`;
};
