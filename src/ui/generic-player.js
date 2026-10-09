import { Hono } from 'hono';

// Generic "paste this URL into a browser and it plays" player.
// /player?url=<proxyM3u8>&ref=<referer>  -> HTML page with hls.js auto-start.
export const PLAYER_PAGE_HTML = (proxyUrl) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Shirayuki · HLS player</title>
<style>body{background:#000;margin:0}video{width:100vw;height:auto;max-height:100vh}#log{position:fixed;bottom:0;left:0;right:0;background:rgba(0,0,0,.8);color:#7dff9b;font:11px ui-monospace;padding:6px 10px;white-space:pre-wrap;max-height:180px;overflow:auto}#log.errs{color:#ff8d8d}</style>
</head>
<body>
<video id="v" controls autoplay muted playsinline></video>
<div id="log">loading…</div>
<script src="https://cdn.jsdelivr.net/npm/hls.js@1"></script>
<script>
const video=document.getElementById('v');
const log=m=>{document.getElementById('log').textContent+=m+'\\n';console.log(m);};
const proxy=${JSON.stringify(proxyUrl)};
log('proxy='+proxy);
if(window.Hls && Hls.isSupported()){
  const hls=new Hls();
  window.__hls=hls;
  hls.on(Hls.Events.ERROR, (e, d) => {
    log((d.fatal ? 'FATAL ' : 'err ') + d.type + ' -> ' + (d.details || '') + (d.fatal ? '  (link may be expired or corrupted — re-fetch sources for a fresh URL)' : ''));
    if (d.fatal) {
      const box = document.getElementById('log');
      box.textContent += (box.textContent ? '\n' : '') + '\n[STUCK] The stream could not start. This almost always means the /uwu/ token expired or the URL was corrupted on copy.';
      box.classList.add('errs');
    }
  });
  hls.on(Hls.Events.MANIFEST_PARSED,()=>{log('MANIFEST PARSED — playing');video.play().catch(()=>{});});
  hls.loadSource(proxy);
  hls.attachMedia(video);
} else if(video.canPlayType('application/vnd.apple.mpegurl')){video.src=proxy;}
</script>
</body>
</html>`;

export const createGenericPlayer = () => {
  const router = new Hono();
  router.get('/', (c) => {
    const raw = c.req.query('url') || '';
    // If the caller pasted the raw CDN url (no prefix), we proxy it too.
    const isCustom = !raw.includes('/proxy?') && !raw.includes('/proxy/');
    const target = isCustom
      ? `${new URL(c.req.url).protocol}//${c.req.url ? new URL(c.req.url).host : 'localhost:3000'}/api/v2/animekai/proxy?url=${encodeURIComponent(raw)}&ref=${encodeURIComponent(c.req.query('ref') || 'https://megavid.buzz/')}`
      : raw;
    c.header('Cache-Control', 'no-store');
    return c.html(PLAYER_PAGE_HTML(target));
  });
  return router;
};
