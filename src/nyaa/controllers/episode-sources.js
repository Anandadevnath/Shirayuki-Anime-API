import { getNyaaEpisodeSources } from '../scraper/episode-sources.js';
import { lookupTorrentForEpisode, findLiveTorrentForEpisode, parseAnimeEpisodeId } from '../scraper/episode-resolver.js';
import { cleanTorrentTitle } from '../scraper/_enrich.js';
import { wrapController } from './_cache.js';

// Default to transcoding so HEVC/AV1 sources play in any browser. Opt out
// with ?transcode=0 for clients that want the raw byte-range stream.
const wantsTranscode = (c) => c.req.query('transcode') !== '0';

export const nyaaEpisodeSourcesController = wrapController({
  cacheKey: (c) => {
    // The cache key has to be stable for every call style. We always derive
    // it from the canonical inputs: the torrent id we ultimately resolve to
    // (or `pending` if it has to look one up) plus the requested episode.
    const torrentId = c.req.query('torrentId') || '';
    const animeEpisodeId = c.req.query('animeEpisodeId') || '';
    const animeName = c.req.query('animeName') || '';
    const ep = c.req.query('ep') || '1';
    const category = c.req.query('category') || 'sub';
    const server = c.req.query('server') || '';
    const transcodeKey = wantsTranscode(c) ? 'tc' : 'raw';
    return `episode-sources:${torrentId || animeEpisodeId || animeName || 'pending'}:${ep}:${category}:${server}:${transcodeKey}`;
  },
  handler: async (c) => {
    const requestedTorrentId = c.req.query('torrentId') || null;
    const animeEpisodeId = c.req.query('animeEpisodeId') || null;
    const animeName = c.req.query('animeName') || null;
    let ep = c.req.query('ep');

    // If the caller passed only `animeEpisodeId` (e.g. "one-piece/ep-1158")
    // without a separate `ep` query, pull the episode number out of the id
    // so the downstream scraper doesn't default to 1.
    if ((ep === undefined || ep === null || ep === '') && animeEpisodeId) {
      const { embeddedEp } = parseAnimeEpisodeId(animeEpisodeId);
      if (Number.isFinite(embeddedEp)) ep = String(embeddedEp);
    }

    let torrentId = requestedTorrentId;
    let resolvedFrom = null;

    // Resolve the working torrentId in order of precedence:
    //   1. Caller-supplied torrentId (try as-is first).
    //   2. animeEpisodeId → slug-based lookup via /anime/:id/episodes.
    //   3. animeName → direct nyaa search.
    //
    // For (1) we still validate against `ep` below — if the torrent doesn't
    // contain the requested episode, we transparently search nyaa for one
    // that does, so callers can pass any torrent from the same franchise and
    // still get the right file.

    if (!torrentId) {
      // First try the cheap slug-based lookup (cached, no network probes).
      let resolved = await lookupTorrentForEpisode({ animeEpisodeId, animeName, ep });

      // When the user gave an anime name (or the slug lookup failed) we want
      // to verify the torrent is actually streamable. Probe candidates via
      // WebTorrent and pick the one with the most productive peers.
      const needsLiveProbe = animeName
        || (resolved && !resolved.error && resolved.source === 'slug')
        || (resolved && resolved.error);
      if (needsLiveProbe) {
        const live = await findLiveTorrentForEpisode({
          animeName: animeName || (resolved?.slug ? resolved.slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : null),
          episodeNumber: parseInt(ep, 10) || 1,
        }).catch((err) => {
          console.warn('[nyaa/episode-sources] live probe failed:', err.message);
          return null;
        });
        if (live && live.torrentId) {
          resolved = {
            source: 'live',
            torrentId: live.torrentId,
            title: live.title,
            url: live.url,
            size: live.size,
            matchType: live.matchType,
            range: live.range,
            health: live.health,
            animeName: animeName || resolved?.slug,
            episode: live.episode || parseInt(ep, 10) || 1,
          };
        } else if (resolved && resolved.error) {
          // Slug lookup failed AND live probe found nothing — surface 404.
          const err = new Error(resolved.error);
          err.statusCode = 404;
          throw err;
        }
      }

      if (!resolved || resolved.error) {
        const err = new Error(resolved?.error || 'No torrent could be resolved for this episode');
        err.statusCode = 404;
        throw err;
      }
      torrentId = resolved.torrentId;
      resolvedFrom = resolved;
    }

    let data = await getNyaaEpisodeSources({
      torrentId,
      ep,
      category: c.req.query('category'),
      server: c.req.query('server'),
      baseUrl: new URL(c.req.url).origin,
      transcode: wantsTranscode(c),
    });

    // Fallback flow: caller passed a torrentId that doesn't contain the
    // requested episode. Look at its title to figure out the anime, then
    // search nyaa for a torrent that DOES contain that episode. This means
    // `?torrentId=<any-of-the-franchise>&ep=20` always lands on the right
    // file without the client having to know the exact torrent map.
    const requestedEp = data?.episode;
    const isFallbackNeeded = data && data.episodeFound === false;

    if (isFallbackNeeded && requestedEp) {
      const seedTitle = data?.title || '';
      const animeQuery = cleanTorrentTitle(seedTitle);
      if (animeQuery) {
        // Live-aware lookup: probe each candidate via WebTorrent and pick the
        // one with the most peers (and ideally confirmed bytes). This is the
        // path that prevents dead torrents from being chosen just because
        // they happen to be the smallest batch on nyaa.
        const rerouted = await findLiveTorrentForEpisode({
          animeName: animeQuery,
          episodeNumber: requestedEp,
        }).catch((err) => {
          console.warn('[nyaa/episode-sources] live probe failed:', err.message);
          return null;
        });

        if (rerouted && rerouted.torrentId && rerouted.torrentId !== torrentId) {
          const retried = await getNyaaEpisodeSources({
            torrentId: rerouted.torrentId,
            ep: requestedEp,
            category: c.req.query('category'),
            server: c.req.query('server'),
            baseUrl: new URL(c.req.url).origin,
            transcode: wantsTranscode(c),
          });
          if (retried?.episodeFound) {
            data = retried;
            torrentId = rerouted.torrentId;
            resolvedFrom = {
              source: 'auto-reroute',
              originalTorrentId: requestedTorrentId,
              seedTitle,
              animeName: animeQuery,
              episode: requestedEp,
              torrentId: rerouted.torrentId,
              title: rerouted.title,
              url: rerouted.url,
              matchType: rerouted.matchType || null,   // 'single' or 'batch'
              range: rerouted.range || null,           // { lo, hi } when batch
              health: rerouted.health || null,         // peers / bytes / latency
            };
          }
        } else if (rerouted && rerouted.torrentId === torrentId) {
          // Search confirmed this torrent is the best available — no reroute
          // possible. Mark that explicitly so the client knows.
          data.fallbackSearch = {
            searched: true,
            animeName: animeQuery,
            episode: requestedEp,
            foundTorrentId: rerouted.torrentId,
            health: rerouted.health || null,
            message: 'No better torrent available on nyaa for this episode; using best file from supplied torrent.',
          };
        } else if (!rerouted) {
          data.fallbackSearch = {
            searched: true,
            animeName: animeQuery,
            episode: requestedEp,
            foundTorrentId: null,
            message: 'No matching nyaa torrent could be probed successfully.',
          };
        }
      }
    }

    if (resolvedFrom) {
      data.resolvedFrom = resolvedFrom;
    }

    return data;
  },
});