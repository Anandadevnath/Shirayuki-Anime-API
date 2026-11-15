import { Hono } from 'hono';
import env from '../config/env.js';

// Nyaa watch page: pick anime / episode / release, then watch it.
// With a remote stream worker (STREAM_ORIGIN not on this machine) it plays inline via
// /episode/sources + hls.js. Otherwise it links to webtor.io in a new tab, so torrents
// are never fetched locally (owner's requirement). webtor.io itself can't be embedded:
// it sends X-Frame-Options SAMEORIGIN and stopped serving SDK embeds in Nov 2026.

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0']);
const isRemoteWorker = () => {
  try {
    return !LOCAL_HOSTS.has(new URL(env.STREAM_ORIGIN).hostname);
  } catch {
    return false;
  }
};

// Initial values go into a <script> block: JSON-encode and escape "<" so a
// query value can never close the script tag (reflected XSS).
const toScriptJson = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

const PAGE = (initial) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Shirayuki Watch</title>
<style>
:root{--bg:#0d0d12;--panel:#17171f;--line:#2a2a3a;--text:#e8e8f0;--muted:#8a8aa0;--accent:#9b9bff;--err:#ff7b7b}
body{font-family:system-ui;margin:0;background:var(--bg);color:var(--text)}
header{padding:1rem 16px;background:var(--panel);border-bottom:1px solid var(--line);display:flex;gap:.6rem;align-items:center;flex-wrap:wrap}
header h1{font-size:1rem;margin:0 .5rem 0 0;color:var(--accent)}
input,select,button{font-size:14px;padding:.4rem .6rem;border-radius:6px;border:1px solid #3a3a50;background:#22223a;color:#eee}
button{cursor:pointer}
#src{flex:1 1 280px;min-width:0}
main{max-width:980px;margin:0 auto;padding:1.2rem 16px}
video{width:100%;aspect-ratio:16/9;background:#000;border-radius:10px;display:block}
video[hidden]{display:none}
#player[hidden]{display:none}
#player{width:100%;aspect-ratio:16/9;background:#000;border-radius:10px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1rem;padding:16px;box-sizing:border-box;text-align:center}
#ptitle{margin:0;font-size:15px}
.play{font-size:18px;padding:.8rem 1.6rem;border-radius:8px;background:var(--accent);color:#0d0d12;text-decoration:none;font-weight:600}
.play[hidden]{display:none}
.bar{display:flex;gap:.6rem;align-items:center;flex-wrap:wrap;margin-top:.8rem}
.muted{color:var(--muted);font-size:13px}
#status.err{color:var(--err)}
a{color:var(--accent)}
</style>
</head>
<body>
<header>
  <h1>Shirayuki · Watch</h1>
  <input id="src" placeholder="Paste anime id, play URL or AniList URL" aria-label="Anime id or URL" />
  <label>ep <input id="ep" type="number" min="1" style="width:70px" aria-label="Episode" /></label>
  <select id="cat" aria-label="Audio"><option value="sub">sub</option><option value="dub">dub</option></select>
  <button id="load">Load</button>
</header>
<main>
  <video id="video" controls playsinline crossorigin="anonymous" hidden></video>
  <div id="player">
    <p id="ptitle" class="muted">Load an anime to see its releases</p>
    <a id="watch" class="play" href="#" target="_blank" rel="noopener noreferrer" hidden>▶ Watch on webtor.io</a>
    <p id="note" class="muted">Opens in a new tab. Webtor's servers download the torrent; nothing is saved on this PC.</p>
  </div>
  <div class="bar">
    <button id="prev" aria-label="Previous episode">◀ prev</button>
    <button id="next" aria-label="Next episode">next ▶</button>
    <label>server <select id="server" aria-label="Release"></select></label>
  </div>
  <p id="status" class="muted" role="status"></p>
</main>
<script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.18/dist/hls.min.js"></script>
<script>
const INITIAL = ${toScriptJson(initial)};
const $ = (id) => document.getElementById(id);
const WEBTOR_PREFIX = 'https://webtor.io/';
let servers = { sub: [], dub: [] };

const status = (msg, isErr = false) => { $('status').textContent = msg; $('status').className = isErr ? 'err' : 'muted'; };

// Accepts "slug-123", "123", a Shirayuki URL with animeEpisodeId/animeId/ep, or anilist.co/anime/123.
const parseSource = (raw) => {
  const text = raw.trim();
  try {
    const url = new URL(text);
    const anilist = url.pathname.match(/\\/anime\\/(\\d+)/);
    if (url.hostname.endsWith('anilist.co') && anilist) return { anime: anilist[1] };
    return { anime: url.searchParams.get('animeEpisodeId') || url.searchParams.get('animeId') || '', ep: url.searchParams.get('ep') };
  } catch {
    return { anime: text };
  }
};

const syncUrl = () => {
  const q = new URLSearchParams({ animeEpisodeId: $('src').value.trim(), ep: $('ep').value, category: $('cat').value });
  if ($('server').value) q.set('server', $('server').value.slice(0, 8));
  history.replaceState(null, '', location.pathname + '?' + q);
};

// Remote worker: ask the API for signed worker URLs for this release and play them inline.
let hls = null;
const stopStream = () => {
  if (hls) { hls.destroy(); hls = null; }
  const video = $('video');
  video.removeAttribute('src');
  video.querySelectorAll('track').forEach((t) => t.remove());
};
const playInline = async (server) => {
  stopStream();
  const video = $('video');
  video.hidden = !server;
  $('player').hidden = !!server;
  if (!server) return;
  status('Starting stream on cloud worker… first segments can take up to a minute');
  try {
    const q = new URLSearchParams({ animeEpisodeId: $('src').value.trim(), ep: $('ep').value, category: $('cat').value, server: server.infoHash });
    const res = await fetch('/api/v2/nyaa/episode/sources?' + q);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Request failed (' + res.status + ')');
    const data = json.data;
    if (data.worker && data.worker.reachable === false) throw new Error('stream worker unreachable (' + data.worker.error + ')');
    (data.tracks || []).forEach((t) => {
      const el = document.createElement('track');
      el.kind = 'captions'; el.label = t.label || 'Subtitles'; el.src = t.file; el.default = !!t.default;
      video.appendChild(el);
    });
    if (window.Hls && Hls.isSupported()) {
      hls = new Hls({ manifestLoadingTimeOut: 60000, manifestLoadingMaxRetry: 4, levelLoadingTimeOut: 60000, fragLoadingTimeOut: 60000 });
      hls.on(Hls.Events.ERROR, (e, d) => { if (d.fatal) status('Playback error: ' + d.details, true); });
      hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
      hls.loadSource(data.sources[0].url);
      hls.attachMedia(video);
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = data.sources[0].url;
    } else {
      throw new Error('this browser has no HLS support');
    }
    status(server.seeders + ' seeders · ' + server.size + ' · streaming from cloud worker');
  } catch (e) {
    status('Stream failed: ' + e.message, true);
  }
};

// Point the watch button at this release on webtor.io (only plain webtor URLs from the API).
const play = (server) => {
  if (INITIAL.inline) { $('ptitle').textContent = server ? server.title : ''; if (server) syncUrl(); playInline(server); return; }
  const link = $('watch');
  const url = String(server?.webtorUrl || '');
  link.hidden = !url.startsWith(WEBTOR_PREFIX);
  link.href = link.hidden ? '#' : url;
  $('ptitle').textContent = server ? server.title : '';
  if (!server) return;
  const batchHint = server.release && server.release.isBatch ? ' · batch: pick episode ' + $('ep').value + ' in webtor\\'s file list' : '';
  status(server.seeders + ' seeders · ' + server.size + batchHint);
  syncUrl();
};

const fillServers = (wanted) => {
  const list = servers[$('cat').value] || [];
  const select = $('server');
  select.replaceChildren(...list.map((s) => {
    const opt = document.createElement('option');
    opt.value = s.infoHash;
    opt.textContent = s.name + ' · ' + s.seeders + ' seeders · ' + s.size;
    return opt;
  }));
  const pick = list.find((s) => wanted && s.infoHash.startsWith(wanted)) || list[0];
  if (!pick) { play(null); status('No seeded ' + $('cat').value + ' release found for this episode', true); return; }
  select.value = pick.infoHash;
  play(pick);
};

const load = async (wantedServer) => {
  const { anime, ep } = parseSource($('src').value);
  if (!anime) { status('Enter an anime id or URL', true); return; }
  $('src').value = anime;
  if (ep) $('ep').value = ep;
  status('Finding releases…');
  try {
    const res = await fetch('/api/v2/nyaa/episode/servers?animeEpisodeId=' + encodeURIComponent(anime) + '&ep=' + encodeURIComponent($('ep').value || '1'));
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Request failed (' + res.status + ')');
    servers = json.data.servers;
    $('src').value = json.data.animeId;
    fillServers(wantedServer);
  } catch (e) {
    servers = { sub: [], dub: [] };
    $('server').replaceChildren();
    play(null);
    status('Failed: ' + e.message, true);
  }
};

const stepEpisode = (delta) => { $('ep').value = Math.max(1, Number($('ep').value || 1) + delta); load(); };

$('load').onclick = () => load();
$('src').onkeydown = $('ep').onkeydown = (e) => { if (e.key === 'Enter') load(); };
$('cat').onchange = () => fillServers();
$('server').onchange = () => play((servers[$('cat').value] || []).find((s) => s.infoHash === $('server').value));
$('prev').onclick = () => stepEpisode(-1);
$('next').onclick = () => stepEpisode(1);

$('src').value = INITIAL.anime;
$('ep').value = INITIAL.ep;
$('cat').value = INITIAL.category;
if (INITIAL.anime) load(INITIAL.server);
</script>
</body>
</html>`;

export const createNyaaWatchPage = () => {
  const router = new Hono();
  router.get('/', (c) => {
    const q = c.req.query();
    const ep = Number.parseInt(q.ep, 10);
    c.header('Cache-Control', 'no-store');
    return c.html(
      PAGE({
        anime: String(q.animeEpisodeId || q.animeId || '').slice(0, 200),
        ep: Number.isFinite(ep) && ep > 0 ? ep : 1,
        category: q.category === 'dub' ? 'dub' : 'sub',
        server: /^[a-f0-9]{1,40}$/i.test(q.server || '') ? q.server.toLowerCase() : '',
        inline: isRemoteWorker(),
      }),
    );
  });
  return router;
};
