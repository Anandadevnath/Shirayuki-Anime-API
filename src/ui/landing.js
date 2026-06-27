// API explorer landing page served at "/". The endpoint catalog below is the
// single source of truth — it renders the HTML and also backs /endpoints.json.

// Build the standard provider surface (listings + search + discover + streaming).
const fullProvider = ({ id, name, accent, source, anime, epId, server, proxy, seasons }) => {
  const b = `/api/v2/${id}`;
  const listings = [
    { label: 'Home', path: `${b}/home`, desc: 'Spotlight, trending, popular, top-airing & seasonal rows.' },
    { label: 'A–Z list', path: `${b}/azlist/A?page=1`, desc: 'Full catalogue grid, paginated.' },
    { label: 'Anime details', path: `${b}/anime/${anime}`, desc: 'Synopsis, score, studios, characters, relations.' },
    { label: 'Episodes', path: `${b}/anime/${anime}/episodes`, desc: 'Episode list with titles, fillers & air dates.' },
  ];
  if (seasons) {
    listings.push({
      label: 'All seasons',
      path: `${b}/seasons/${anime}`,
      desc: 'All seasons/parts/movies of a franchise, ordered serially.',
    });
  }
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
          { label: 'Schedule', path: `${b}/schedule?date=2026-06-15&timezone=UTC`, desc: 'Airing schedule for a date.' },
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
    fullProvider({ id: 'hianime', name: 'HiAnime', accent: '#8b8cf7', source: 'HiAnime scrape', anime: 'one-piece', epId: 'one-piece', server: 'hd-1', proxy: false, seasons: true }),
    fullProvider({ id: 'anixo', name: 'Anixo', accent: '#f472b6', source: 'AniList + MegaPlay', anime: '21', epId: '21', server: 'megaplay', proxy: true }),
    fullProvider({ id: 'animex', name: 'AnimeX', accent: '#fbbf24', source: 'animex.one + MegaPlay', anime: '21', epId: '21', server: 'megaplay', proxy: true }),
    {
      id: 'anikuro',
      name: 'Anikuro',
      accent: '#34d399',
      source: 'Anikuro (streaming only)',
      groups: [
        {
          title: 'Streaming',
          items: [
            { label: 'Episode servers', path: '/api/v2/anikuro/episode/servers?animeEpisodeId=180745&ep=1', desc: 'Available servers for an episode.' },
            { label: 'Episode sources', path: '/api/v2/anikuro/episode/sources?animeEpisodeId=199221:1&server=anikoto&category=dub', desc: 'Playable sources for an episode.' },
          ],
        },
      ],
    },
    {
      id: 'nyaa',
      name: 'Nyaa.si',
      accent: '#3582F7',
      source: 'nyaa.si (torrent index — returns .torrent URL + info hash, not m3u8)',
      groups: [
        {
          title: 'Listings',
          items: [
            { label: 'Home', path: '/api/v2/nyaa/home', desc: 'Latest uploads across English-translated + Anime categories.' },
            { label: 'A–Z list', path: '/api/v2/nyaa/azlist/A?page=1', desc: 'Browse a Nyaa category by letter (A = Anime, C = Anime English-translated, etc).' },
            { label: 'Torrent details', path: '/api/v2/nyaa/anime/naruto', desc: 'Resolves the first search hit for the given name and returns its metadata, .torrent URL, info hash & file list. Numeric torrent IDs also work.' },
            { label: 'Episodes', path: '/api/v2/nyaa/anime/one-piece/episodes', desc: 'Per-episode list (hianime-shape) — each row links to the best Nyaa torrent for that episode.' },
          ],
        },
        {
          title: 'Search',
          items: [
            { label: 'Search', path: '/api/v2/nyaa/search?q=naruto&page=1', desc: 'Search by keyword with category / filter / sort.' },
            { label: 'Suggestions', path: '/api/v2/nyaa/search/suggestion?q=naruto', desc: 'Top titles returned for a keyword.' },
          ],
        },
        {
          title: 'Torrents (hand off to WebTorrent client)',
          items: [
            { label: 'Episode files', path: '/api/v2/nyaa/episode/servers?torrentId=2123254', desc: 'List of video files in the torrent (treated as selectable "servers").' },
            { label: 'Episode sources', path: '/api/v2/nyaa/episode/sources?torrentId=2123254&ep=1&category=dub', desc: 'Pick the right file inside the supplied torrent. If the torrent doesn\'t contain the requested episode, the endpoint transparently searches nyaa for a torrent that does and reroutes — so you can pass any torrentId from the franchise and still land on ep N\'s file. Returns the .torrent URL + info hash. `category=dub` picks the English audio track; omit or use `category=sub` for Japanese. NOT an m3u8 — feed into WebTorrent/Transmission/etc.' },
          ],
        },
      ],
    },
  ],
};

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const countEndpoints = () =>
  API_CATALOG.providers.reduce((n, p) => n + p.groups.reduce((m, g) => m + g.items.length, 0), 0);

const renderItem = (item) => {
  const tryBtn = item.noTry
    ? `<span class="btn btn-disabled" title="Fill in url & ref">Try</span>`
    : `<a class="btn btn-try" href="${esc(item.path)}" target="_blank" rel="noopener">Try ↗</a>`;
  return `
    <article class="ep" data-search="${esc((item.label + ' ' + item.desc + ' ' + item.path).toLowerCase())}">
      <div class="ep-main">
        <div class="ep-head">
          <span class="method">GET</span>
          <h4 class="ep-title">${esc(item.label)}</h4>
          <p class="ep-desc">${esc(item.desc)}</p>
        </div>
        <code class="ep-path">${esc(item.path)}</code>
      </div>
      <div class="ep-actions">
        ${tryBtn}
        <button class="btn btn-copy" data-path="${esc(item.path)}">Copy</button>
      </div>
    </article>`;
};

const renderGroup = (group) => `
  <div class="group">
    <div class="group-title">${esc(group.title)}<span class="group-count">${group.items.length}</span></div>
    <div class="ep-grid">${group.items.map(renderItem).join('')}</div>
  </div>`;

const renderProvider = (p) => `
  <section class="provider" id="${esc(p.id)}" style="--accent:${esc(p.accent)}">
    <header class="provider-head">
      <span class="dot"></span>
      <h2>${esc(p.name)}</h2>
      <span class="src-badge">${esc(p.source)}</span>
      <span class="base">/api/v2/${esc(p.id)}</span>
    </header>
    ${p.groups.map(renderGroup).join('')}
  </section>`;

const navPills = () =>
  API_CATALOG.providers
    .map((p) => `<a class="pill" href="#${esc(p.id)}" style="--accent:${esc(p.accent)}">${esc(p.name)}</a>`)
    .join('');

const CLIENT_JS = `
  // Live search filter
  var q = document.getElementById('search');
  q.addEventListener('input', function () {
    var term = q.value.trim().toLowerCase();
    document.querySelectorAll('.ep').forEach(function (el) {
      el.style.display = !term || el.dataset.search.indexOf(term) > -1 ? '' : 'none';
    });
    document.querySelectorAll('.group').forEach(function (g) {
      var any = g.querySelectorAll('.ep:not([style*="display: none"])').length;
      g.style.display = any ? '' : 'none';
    });
    document.querySelectorAll('.provider').forEach(function (s) {
      var any = s.querySelectorAll('.ep:not([style*="display: none"])').length;
      s.style.display = any ? '' : 'none';
    });
  });

  // Copy full URL to clipboard
  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(window.__tt); window.__tt = setTimeout(function () { t.classList.remove('show'); }, 1400);
  }
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.btn-copy');
    if (!btn) return;
    var full = location.origin + btn.dataset.path;
    navigator.clipboard.writeText(full).then(function () { toast('Copied ' + btn.dataset.path); });
  });

  // Scrollspy for nav pills
  var pills = [].slice.call(document.querySelectorAll('.pill'));
  var sections = pills.map(function (a) { return document.querySelector(a.getAttribute('href')); });
  function onScroll() {
    var y = window.scrollY + 140, idx = 0;
    sections.forEach(function (s, i) { if (s && s.offsetTop <= y) idx = i; });
    pills.forEach(function (p, i) { p.classList.toggle('active', i === idx); });
  }
  window.addEventListener('scroll', onScroll); onScroll();
`;

export const renderLandingPage = () => {
  const total = countEndpoints();
  const providerCount = API_CATALOG.providers.length;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(API_CATALOG.name)}</title>
<style>
:root{
  --bg:#0a0b10; --bg2:#0f1118; --card:#13161f; --card2:#171b26;
  --line:#222636; --text:#e7e9f0; --muted:#9aa0b4; --brand:#8b8cf7;
}
*{box-sizing:border-box}
html{scroll-behavior:smooth;scroll-padding-top:128px}
body{margin:0;background:radial-gradient(1200px 600px at 80% -10%,#1b1e2e 0,transparent 60%),var(--bg);
  color:var(--text);font:15px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Inter,Arial}
a{color:inherit;text-decoration:none}
.wrap{max-width:1180px;margin:0 auto;padding:0 22px}

/* Topbar */
.top{position:sticky;top:0;z-index:20;backdrop-filter:blur(12px);
  background:linear-gradient(180deg,rgba(10,11,16,.92),rgba(10,11,16,.72));border-bottom:1px solid var(--line)}
.top-inner{display:flex;align-items:center;gap:18px;padding:14px 0}
.logo{display:flex;align-items:center;gap:10px;font-weight:800;letter-spacing:.2px;font-size:18px;white-space:nowrap}
.logo .mark{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;
  background:linear-gradient(135deg,#8b8cf7,#f472b6);color:#0a0b10;font-weight:900}
.search{flex:1;position:relative}
.search input{width:100%;padding:11px 14px 11px 38px;border-radius:11px;border:1px solid var(--line);
  background:var(--bg2);color:var(--text);outline:none;font-size:14px}
.search input:focus{border-color:var(--brand);box-shadow:0 0 0 3px rgba(139,140,247,.15)}
.search .ic{position:absolute;left:13px;top:50%;transform:translateY(-50%);color:var(--muted)}
.nav{display:flex;gap:8px;flex-wrap:wrap;padding:10px 0 14px}
.pill{padding:6px 13px;border-radius:999px;border:1px solid var(--line);background:var(--bg2);
  color:var(--muted);font-size:13px;font-weight:600;transition:.15s}
.pill:hover{color:var(--text);border-color:var(--accent)}
.pill.active{color:#0a0b10;background:var(--accent);border-color:var(--accent)}

/* Hero */
.hero{padding-top:42px;padding-bottom:26px}
.hero h1{margin:0 0 8px;font-size:34px;font-weight:850;letter-spacing:-.5px}
.hero p{margin:0;color:var(--muted);max-width:640px}
.stats{display:flex;gap:14px;margin-top:24px;flex-wrap:wrap}
.stat{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 18px;min-width:104px}
.stat b{font-size:24px;line-height:1.1;display:block}
.stat span{display:block;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.7px;margin-top:3px}

/* Provider */
.provider{padding:34px 0;border-top:1px solid var(--line);scroll-margin-top:128px}
.provider-head{display:flex;align-items:center;gap:11px;margin-bottom:20px;flex-wrap:wrap}
.provider-head h2{margin:0;font-size:22px;font-weight:800;line-height:1}
.dot{width:11px;height:11px;border-radius:50%;background:var(--accent);box-shadow:0 0 14px var(--accent);flex:0 0 auto}
.src-badge{font-size:12px;line-height:1;color:var(--accent);border:1px solid var(--accent);
  padding:5px 10px;border-radius:999px;opacity:.9}
.base{margin-left:auto;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;color:var(--muted)}
.group{margin:18px 0}
.group-title{font-size:13px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;
  display:flex;align-items:center;gap:8px;margin-bottom:12px}
.group-count{font-size:11px;background:var(--card2);color:var(--muted);padding:1px 7px;border-radius:999px;border:1px solid var(--line)}

/* Endpoint list */
.ep-grid{display:flex;flex-direction:column;gap:9px}
.ep{display:flex;align-items:center;gap:18px;background:var(--card);border:1px solid var(--line);
  border-radius:12px;padding:13px 16px;transition:.15s}
.ep:hover{border-color:var(--accent);background:var(--card2)}
.ep-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:7px}
.ep-head{display:flex;align-items:center;gap:11px;flex-wrap:wrap}
.method{font-size:11px;font-weight:800;color:#34d399;border:1px solid #2a5a47;background:#0e1a16;
  padding:3px 7px;border-radius:6px;letter-spacing:.5px;line-height:1;flex:0 0 auto}
.ep-title{margin:0;font-size:15px;font-weight:700;line-height:1.2;flex:0 0 auto}
.ep-desc{margin:0;color:var(--muted);font-size:13px;line-height:1.3}
.ep-path{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;color:#cdd2e6;
  background:var(--bg2);border:1px solid var(--line);border-radius:8px;padding:7px 10px;
  word-break:break-all;align-self:flex-start;max-width:100%}
.ep-actions{display:flex;gap:8px;flex:0 0 auto}
@media(max-width:640px){
  .ep{flex-direction:column;align-items:stretch}
  .ep-actions{justify-content:flex-start}
}
.btn{display:inline-flex;align-items:center;justify-content:center;font-size:12.5px;font-weight:700;
  border-radius:9px;padding:7px 14px;line-height:1;cursor:pointer;font-family:inherit;
  border:1px solid var(--line);background:var(--card2);color:var(--text);transition:.15s}
.btn-try{background:var(--accent);border-color:var(--accent);color:#0a0b10}
.btn-try:hover{filter:brightness(1.08)}
.btn-copy:hover{border-color:var(--accent);color:var(--accent)}
.btn-disabled{opacity:.45;cursor:not-allowed}

/* Toast + footer */
#toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%) translateY(20px);
  background:#1b1f2c;border:1px solid var(--line);color:var(--text);padding:11px 18px;border-radius:11px;
  font-size:13px;opacity:0;pointer-events:none;transition:.2s;z-index:50}
#toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
footer{border-top:1px solid var(--line);padding-top:26px;padding-bottom:50px;color:var(--muted);font-size:13px}
footer code{color:#cdd2e6;background:var(--bg2);padding:2px 6px;border-radius:6px;border:1px solid var(--line)}
@media(max-width:620px){.hero h1{font-size:27px}.base{display:none}}
</style>
</head>
<body>
  <div class="top">
    <div class="wrap">
      <div class="top-inner">
        <div class="logo"><span class="mark">桜</span> Shirayuki API</div>
        <div class="search">
          <span class="ic">⌕</span>
          <input id="search" type="search" placeholder="Search endpoints…  (e.g. sources, genre, schedule)" autocomplete="off" />
        </div>
      </div>
      <nav class="nav">${navPills()}</nav>
    </div>
  </div>

  <header class="wrap hero">
    <h1>${esc(API_CATALOG.name)}</h1>
    <p>${esc(API_CATALOG.tagline)}</p>
    <div class="stats">
      <div class="stat"><b>${providerCount}</b><span>Providers</span></div>
      <div class="stat"><b>${total}</b><span>Endpoints</span></div>
      <div class="stat"><b>v2</b><span>API version</span></div>
    </div>
  </header>

  <main class="wrap">
    ${API_CATALOG.providers.map(renderProvider).join('')}
  </main>

  <footer class="wrap">
    Base path <code>/api/v2/&lt;provider&gt;</code> · Raw catalog at <code><a href="/endpoints.json">/endpoints.json</a></code> · All routes are <code>GET</code> and return JSON.
  </footer>

  <div id="toast"></div>
  <script>${CLIENT_JS}</script>
</body>
</html>`;
};
