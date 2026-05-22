import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import env from './src/config/env.js';
import animekaiHomeRouter from './src/animekai/router/home.js';
import animekaiAzlistRouter from './src/animekai/router/azlist.js';
import animekaiAnimeRouter from './src/animekai/router/anime.js';
import animekaiSearchRouter from './src/animekai/router/search.js';
import animekaiSearchAdvancedRouter from './src/animekai/router/search-advanced.js';
import animekaiSearchSuggestionRouter from './src/animekai/router/search-suggestion.js';
import animekaiProducerRouter from './src/animekai/router/producer.js';
import animekaiGenreRouter from './src/animekai/router/genre.js';
import animekaiCategoryRouter from './src/animekai/router/category.js';
import animekaiScheduleRouter from './src/animekai/router/schedule.js';
import animekaiEpisodesRouter from './src/animekai/router/episodes.js';
import animekaiNextEpisodeRouter from './src/animekai/router/next-episode.js';
import animekaiEpisodeServersRouter from './src/animekai/router/episode-servers.js';
import animekaiEpisodeSourcesRouter from './src/animekai/router/streaming-server.js';
import animekaiProxyRouter from './src/animekai/router/proxy.js';
import { animekaiEpisodesController } from './src/animekai/controllers/episodes.js';
import hianimeEpisodeSourcesRouter from './src/hianime/router/streaming-server.js';

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
      animekai: {
        home: '/api/v2/animekai/home',
        azlist: '/api/v2/animekai/azlist/0-9?page=1',
        animeDetails: '/api/v2/animekai/anime/one-piece-dk6r',
        animeEpisodes: '/api/v2/animekai/anime/one-piece-dk6r/episodes',
        search: {
          basic: '/api/v2/animekai/search?q=one%20piece&page=1',
          advanced: '/api/v2/animekai/search/advanced?q=one%20piece&page=1',
          suggestion: '/api/v2/animekai/search/suggestion?q=one',
        },
        discover: {
          producer: '/api/v2/animekai/producer/toei-animation?page=1',
          genre: '/api/v2/animekai/genre/action?page=1',
          category: '/api/v2/animekai/category/tv?page=1',
          schedule: '/api/v2/animekai/schedule?date=2026-01-01',
        },
        episode: {
          servers: '/api/v2/animekai/episode/servers?animeEpisodeId=example',
          sources:
            '/api/v2/animekai/episode/sources?animeEpisodeId=witch-hat-atelier-3e32&ep=1&server=server-1&category=sub',
        },
      },
      hianime: {
        episode: {
          sources:
            '/api/v2/hianime/episode/sources?animeEpisodeId=one-piece&ep=1&server=hd-1&category=sub',
        },
      },
    },
  });
});

// API Routes

app.route('/api/v2/animekai/home', animekaiHomeRouter);
app.route('/api/v2/animekai/azlist', animekaiAzlistRouter);
app.route('/api/v2/animekai/anime', animekaiAnimeRouter);
app.route('/api/v2/animekai/search', animekaiSearchRouter);
app.route('/api/v2/animekai/search/advanced', animekaiSearchAdvancedRouter);
app.route('/api/v2/animekai/search/suggestion', animekaiSearchSuggestionRouter);
app.route('/api/v2/animekai/producer', animekaiProducerRouter);
app.route('/api/v2/animekai/genre', animekaiGenreRouter);
app.route('/api/v2/animekai/category', animekaiCategoryRouter);
app.route('/api/v2/animekai/schedule', animekaiScheduleRouter);
app.route('/api/v2/animekai/anime', animekaiEpisodesRouter);
app.route('/api/v2/animekai/anime', animekaiNextEpisodeRouter);

app.route('/api/v2/animekai/episode', animekaiEpisodeServersRouter);
app.route('/api/v2/animekai/episode/sources', animekaiEpisodeSourcesRouter);
app.route('/api/v2/animekai/proxy', animekaiProxyRouter);
app.route('/api/v2/hianime/episode/sources', hianimeEpisodeSourcesRouter);

// Compatibility alias: supports /api/v2/animekai/:animeId/episodes format.
app.get('/api/v2/animekai/:animeId/episodes', animekaiEpisodesController);

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
