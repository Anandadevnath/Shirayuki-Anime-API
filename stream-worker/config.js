import os from 'node:os';
import path from 'node:path';
import env from '../src/config/env.js';
import { resolveStreamSecret } from '../src/nyaa/scraper/stream-token.js';

const cacheRoot = env.STREAM_CACHE_DIR || path.join(os.tmpdir(), 'shirayuki-stream');

// Frozen once at boot; resolveStreamSecret throws in production without STREAM_SECRET.
const config = Object.freeze({
  // Embedded in the API, ffmpeg's internal /raw reads must hit the API's own port.
  port: env.STREAM_EMBED ? env.PORT : env.STREAM_PORT,
  secret: resolveStreamSecret(env.STREAM_SECRET, env.NODE_ENV),
  tokenTtlSec: env.STREAM_TOKEN_TTL_SEC,
  torrentDir: path.join(cacheRoot, 'torrents'),
  hlsDir: path.join(cacheRoot, 'hls'),
  idleMs: env.STREAM_IDLE_MS,
  maxSessions: Math.max(1, env.STREAM_MAX_SESSIONS),
  uploadLimit: env.STREAM_UPLOAD_LIMIT,
  readyTimeoutMs: env.STREAM_READY_TIMEOUT_MS,
  transcode: ['auto', 'always', 'never'].includes(env.STREAM_TRANSCODE) ? env.STREAM_TRANSCODE : 'auto',
  metadataTimeoutMs: 60000,
  // Short enough that an abandoned episode stops downloading soon after a switch.
  sweepIntervalMs: Math.max(1000, Math.min(5000, env.STREAM_IDLE_MS)),
});

export default config;
