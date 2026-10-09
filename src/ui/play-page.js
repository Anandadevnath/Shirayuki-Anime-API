import { Hono } from 'hono';

const PLAY_PAGE = ({ apiPath, animeEpisodeId, ep, server, category }) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Shirayuki — built-in HLS player</title>
<style>
body{font-family:system-ui;margin:0;background:#0d0d12;color:#e8e8f0;display:flex;flex-direction:column;min-height:100vh}
header{padding:1rem 1.5rem;background:#17171f;border-bottom:1px solid #2a2a3a;display:flex;gap:1rem;align-items:center;flex-wrap:wrap}
header h1{font-size:1rem;margin:0;color:#9b9bff}
input,select,button{font-size:14px;padding:.35rem .6rem;border-radius:6px;border:1px solid #3a3a50;background:#22223a;color:#eee}
main{flex:1;display:flex;flex-direction:column;align-items:center;padding:1.5rem}
video{width:min(92vw,940px);background:#000;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.6)}
pre{white-space:pre-wrap;background:#0a0a0f;color:#7dff9b;padding:.7rem;font-size:12px;max-height:220px;overflow:auto;width:min(92vw,940px);border:1px solid #2a2a3a;border-radius:8px;margin-top:1rem}
.controls{display:flex;gap:.6rem;margin-top:1rem;flex-wrap:wrap;align-items:center}
.muted{color:#6a6a7a}
</style>
</head>
<body>
<header>
  <h1>Shirayuki · HLS play test</h1>
  <label>anime id:
    <input id="anime" value="${animeEpisodeId}" size="24" />
  </label>
  <label>ep:
    <input id="ep" type="number" min="1" value="${ep}" style="width:70px" />
  </label>
  <label>server:
    <select id="server">
      <option value="ani-hd" ${server==='ani-hd'?'selected':''}>ani-hd</option>
      <option value="megaplay" ${server==='megaplay'?'selected':''}>megaplay</option>
    </select>
  </label>
  <label>category:
    <select id="cat"><option value="sub" ${category==='sub'?'selected':''}>sub</option><option value="dub" ${category==='dub'?'selected':''}>dub</option></select>
  </label>
  <button id="load">Play</button>
</header>
<main>
  <video id="v" controls autoplay muted playsinline></video>
  <div class="controls">
    <label><input type="checkbox" id="mute" checked> muted</label>
  </div>
  <pre id="log">ready…</pre>
</main>

<script src="https://cdn.jsdelivr.net/npm/hls.js@1"></script>
<script>
const log=m=>{const p=document.getElementById('log');p.textContent+=m+'\\n';console.log(m);};
const video=document.getElementById('v');
const animeSel=document.getElementById('anime'), epSel=document.getElementById('ep');
const serverSel=document.getElementById('server'), catSel=document.getElementById('cat');

async function play(){
  const anime=animeSel.value.trim(), ep=epSel.value, server=serverSel.value, cat=catSel.value;
  const api='${apiPath}?animeEpisodeId='+encodeURIComponent(anime)+'&ep='+encodeURIComponent(ep)+'&server='+encodeURIComponent(server)+'&category='+encodeURIComponent(cat);
  document.getElementById('log').textContent='';
  log('fetching '+api);
  try{
    const r=await fetch(api);
    const j=await r.json();
    if(!j.success){throw new Error(j.error||'bad response');}
    const src=j.data.sources[0];
    // proxyM3u8 is now the /play page URL; build the actual proxy stream from raw data.
    const proxy=location.origin+'/api/v2/animekai/proxy?url='+encodeURIComponent(src.url)+'&ref='+encodeURIComponent(src.referer);
    log('episode '+j.data.episode+'  server '+src.server+'/'+src.category+'  quality='+src.quality);
    log('proxy='+proxy);
    if(window.Hls && Hls.isSupported()){
      if(window.__hls) window.__hls.destroy();
      const hls=new Hls();
      window.__hls=hls;
      hls.on(Hls.Events.ERROR,(e,d)=>{log((d.fatal?'FATAL ':'err ')+d.type+' -> '+(d.details||''));});
      hls.on(Hls.Events.MANIFEST_PARSED,()=>{log('MANIFEST PARSED — playing');video.play().catch(()=>{});});
      hls.loadSource(proxy);
      hls.attachMedia(video);
      log('hls.js attached (MSE)');
    } else if(video.canPlayType('application/vnd.apple.mpegurl')){
      video.src=proxy; log('native HLS (Safari)');
    } else {
      log('ERROR: no HLS support in this browser');
    }
  }catch(e){log('FAILED: '+e.message);}
}
document.getElementById('load').onclick=play;
document.getElementById('mute').onchange=e=>{video.muted=e.target.checked;};
play();
</script>
</body>
</html>`;

export const createPlayPage = (apiPath) => {
  const router = new Hono();
  const full = apiPath.replace(/\/+$/, '');
  router.get('/', (c) => {
    const animeEpisodeId = c.req.query('animeEpisodeId') || 'one-piece-ewc5jc';
    const ep = c.req.query('ep') || '1';
    const server = c.req.query('server') || 'ani-hd';
    const category = c.req.query('category') || 'sub';
    c.header('Cache-Control', 'no-store');
    return c.html(PLAY_PAGE({ apiPath: full, animeEpisodeId, ep, server, category }));
  });
  return router;
};
