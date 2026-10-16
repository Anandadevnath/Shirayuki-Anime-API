import { Hono } from 'hono';

// reanime's streams are minted by flixcloud for the requesting browser's IP and
// the playlists are decrypted client-side, so the only way to play them is to
// load the flixcloud embed in a browser. This page wraps that embed in an
// iframe. It is the reanime analogue of the hianime /play page.
const PLAY_PAGE = ({ embedUrl }) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Shirayuki — Re:ANIME player</title>
<style>
html,body{margin:0;height:100%;background:#0d0d12;color:#e8e8f0;font-family:system-ui}
.bar{padding:.6rem 1rem;background:#17171f;border-bottom:1px solid #2a2a3a;display:flex;gap:.75rem;align-items:center;flex-wrap:wrap;font-size:13px}
.bar a{color:#9b9bff}
.wrap{position:absolute;inset:44px 0 0 0}
iframe{width:100%;height:100%;border:0;background:#000}
.note{color:#8a8a9a}
</style>
</head>
<body>
<div class="bar">
  <strong>Re:ANIME</strong>
  <span class="note">browser-only stream · served by flixcloud</span>
  <a href="${embedUrl}" target="_blank" rel="noopener">open embed ↗</a>
</div>
<div class="wrap">
  <iframe src="${embedUrl}" allow="autoplay; fullscreen; encrypted-media" allowfullscreen referrerpolicy="origin"></iframe>
</div>
</body>
</html>`;

export const createReanimePlayPage = (sourcesApiPath) => {
  const router = new Hono();
  const full = sourcesApiPath.replace(/\/+$/, '');

  router.get('/', async (c) => {
    const animeId = c.req.query('animeId') || c.req.query('animeEpisodeId');
    const ep = c.req.query('ep') || '1';
    const server = c.req.query('server');
    const category = c.req.query('category');

    c.header('Cache-Control', 'no-store');

    if (!animeId) {
      return c.html('<p style="font-family:system-ui;color:#eee">animeId query parameter is required</p>', 400);
    }

    // Resolve the embed URL for this episode/server by calling our own sources API.
    const qs = new URLSearchParams({ animeId, ep });
    if (server) qs.set('server', server);
    if (category) qs.set('category', category);
    const selfUrl = `${new URL(c.req.url).origin}${full}?${qs.toString()}`;

    try {
      const resp = await fetch(selfUrl, { headers: { accept: 'application/json' } });
      const json = await resp.json();
      const embedUrl = json?.data?.sources?.[0]?.embeddedUrl || json?.data?.sources?.[0]?.url;
      if (!embedUrl) {
        return c.html(
          `<p style="font-family:system-ui;color:#eee">No playable embed found for episode ${ep}.</p>`,
          404,
        );
      }
      return c.html(PLAY_PAGE({ embedUrl }));
    } catch (error) {
      return c.html(
        `<p style="font-family:system-ui;color:#eee">Failed to resolve stream: ${error.message}</p>`,
        502,
      );
    }
  });

  return router;
};
