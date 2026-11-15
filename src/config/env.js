import 'dotenv/config';
import { cleanEnv, port, str, num } from 'envalid';

const env = cleanEnv(process.env, {
  PORT: port({ default: 4000 }),
  NODE_ENV: str({ default: 'development', choices: ['development', 'production', 'test'] }),

  // --- nyaa provider (API side) ---
  // Ordered, comma-separated failover list of Nyaa origins.
  NYAA_BASE_URLS: str({ default: 'https://nyaa.si' }),
  // Release groups ranked first when choosing a torrent (comma-separated).
  NYAA_PREFERRED_GROUPS: str({ default: 'SubsPlease,Erai-raws,EMBER,ASW,Judas' }),
  // Resolution ranked first (480/720/1080/2160). 1080p needs ~9 Mbit/s of torrent download
  // to play without stalling; 720p needs ~4.5.
  NYAA_PREFERRED_RESOLUTION: num({ default: 720, choices: [480, 720, 1080, 2160] }),
  // Public origin of the stream worker (stream.js); sourceUrl points here.
  // Plain str (validated where used) so a typo can't take down every provider at boot.
  STREAM_ORIGIN: str({ default: 'http://localhost:4100' }),
  // Shared HMAC secret between the API and the stream worker. Required in production.
  STREAM_SECRET: str({ default: '' }),
  // How long a signed stream URL stays valid.
  STREAM_TOKEN_TTL_SEC: num({ default: 6 * 60 * 60 }),

  // --- stream worker (stream.js) ---
  STREAM_PORT: port({ default: 4100 }),
  STREAM_CACHE_DIR: str({ default: '' }),
  STREAM_IDLE_MS: num({ default: 10 * 60 * 1000 }),
  STREAM_MAX_SESSIONS: num({ default: 3 }),
  // Bytes/sec; -1 = unlimited. A small upload keeps peers cooperative.
  STREAM_UPLOAD_LIMIT: num({ default: 50 * 1024 }),
  // Keep below the player's manifest timeout (hls.js is set to 60s in /play).
  STREAM_READY_TIMEOUT_MS: num({ default: 50000 }),
  // "auto" = copy H.264, transcode anything else; "always" / "never" force it.
  STREAM_TRANSCODE: str({ default: 'auto' }),
});

export default env;
