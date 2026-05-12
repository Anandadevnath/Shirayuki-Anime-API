import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import env from './src/config/env.js';
// animekai routes removed
import miruroHomeRouter from './src/miruro/router/home.js';
import miruroSearchRouter from './src/miruro/router/search.js';
import miruroAnimeRouter from './src/miruro/router/anime.js';
import miruroEpisodesRouter from './src/miruro/router/episodes.js';
import miruroEpisodeServersRouter from './src/miruro/router/episode-servers.js';
import miruroEpisodeSourcesRouter from './src/miruro/router/episode-sources.js';

const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', cors());

// Root
app.get('/', (c) => {
  return c.json({
    message: 'Shirayuki Scrapper API V2',
    version: '2.0.0',
    endpoints: {
      miruro: {
        home: '/api/v2/miruro/home',
        search: '/api/v2/miruro/search?q=one%20piece&genres=Adventure&genres=Action&tags=Acting&format=SPECIAL&status=FINISHED&year=2027&sort=POPULARITY_DESC',
        animeDetails: '/api/v2/miruro/anime/21',
        episodes: '/api/v2/miruro/anime/21/episodes',
        episode: {
          servers: '/api/v2/miruro/episode/servers?animeEpisodeId=21?ep=1',
          sources: '/api/v2/miruro/episode/sources?animeEpisodeId=21?ep=1&server=server-1&category=sub',
        },
      },
    },
  });
});

// animekai routes removed

// Miruro Routes
app.route('/api/v2/miruro/home', miruroHomeRouter);
app.route('/api/v2/miruro/search', miruroSearchRouter);
app.route('/api/v2/miruro/anime', miruroAnimeRouter);
app.route('/api/v2/miruro/anime', miruroEpisodesRouter);
app.route('/api/v2/miruro/episode', miruroEpisodeServersRouter);
app.route('/api/v2/miruro/episode', miruroEpisodeSourcesRouter);

// Compatibility alias: supports /api/v2/animekai/:animeId/episodes format.
// compatibility alias removed

app.notFound((c) => {
  return c.json({
    success: false,
    message: 'Endpoint not found',
  }, 404);
});

app.onError((err, c) => {
  console.error('Server error:', err);
  return c.json({
    success: false,
    error: err.message,
  }, 500);
});

const port = env.PORT;
console.log(`http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port,
});