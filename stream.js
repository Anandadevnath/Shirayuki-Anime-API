// Stream worker entrypoint: turns Nyaa torrents into HLS (index.m3u8) + a raw
// range-capable file URL. Long-running process — NOT for Vercel. Run with
// `npm run stream` on a VPS / Railway / Fly / a PC behind Cloudflare Tunnel,
// and point the API's STREAM_ORIGIN at it (same STREAM_SECRET on both sides).
import { serve } from '@hono/node-server';
import { mkdir } from 'node:fs/promises';
import config from './stream-worker/config.js';
import { createWorkerApp } from './stream-worker/routes.js';
import { shutdown, log } from './stream-worker/torrent-manager.js';

await mkdir(config.torrentDir, { recursive: true });
await mkdir(config.hlsDir, { recursive: true });

const server = serve({ fetch: createWorkerApp().fetch, port: config.port });
log(`stream worker listening on http://localhost:${config.port}`);

const stop = async (signal) => {
  log(`${signal} received, shutting down`);
  server.close();
  await shutdown().catch((err) => log(`shutdown error: ${err.message}`));
  process.exit(0);
};
process.once('SIGINT', () => stop('SIGINT'));
process.once('SIGTERM', () => stop('SIGTERM'));
