import { getNyaaEpisodeSources } from '../scraper/episode-sources.js';
import { lookupTorrentForEpisode, findLiveTorrentForEpisode, parseAnimeEpisodeId } from '../scraper/episode-resolver.js';
import { cleanTorrentTitle, enrichFromAniList } from '../scraper/_enrich.js';
import { resolveMalId, getSkipTimes } from '../../hianime/scraper/aniskip.js';
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
      // Use the leading chunk of the cleaned title — release groups often
      // tack the Japanese / romanized variant on with `|`, which doesn't
      // help the search and hides the canonical name. "Cursed One-Piece
      // Season 1 | Uchida ..." -> "Cursed One-Piece".
      const fullCleaned = cleanTorrentTitle(seedTitle);
      const animeQuery = (fullCleaned.split('|')[0] || fullCleaned)
        .replace(/\bseason\s+\d+\b/gi, '')
        .replace(/\bs\d{1,2}\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
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

    // Compute the trimmed response shape in parallel with what's already
    // been done. AniList enrichment powers `poster` + the canonical title;
    // aniskip (via MAL id) powers `intro`/`outro`. Both are best-effort —
    // a failure leaves the corresponding field null but doesn't kill the
    // stream.
    const cleanedTitle = cleanTorrentTitle(data?.title || '');
    const [enrichment, skipTimes] = await Promise.all([
      cleanedTitle
        ? enrichFromAniList(cleanedTitle).catch((err) => {
            console.warn('[nyaa/episode-sources] anilist enrichment failed:', err.message);
            return { matched: false };
          })
        : Promise.resolve({ matched: false }),
      cleanedTitle
        ? resolveMalId(cleanedTitle, cleanedTitle)
            .then((malId) => getSkipTimes(malId, Number(data?.episode) || 0))
            .catch((err) => {
              console.warn('[nyaa/episode-sources] skip-times lookup failed:', err.message);
              return { intro: null, outro: null };
            })
        : Promise.resolve({ intro: null, outro: null }),
    ]);

    const firstSource = Array.isArray(data?.sources) ? data.sources[0] : null;

    // Resolve `range` to {lo, hi} across all the places the scraper might
    // have surfaced it. Order of preference:
    //   1. resolvedFrom.range — only set when we auto-rerouted to a batch.
    //   2. data.allEpisodes — every distinct ep this torrent exposes.
    //      Prefers this over the picked file's coverage so callers see the
    //      full extent of a batch torrent (e.g. an S01-S12 batch returns
    //      {lo:1, hi:12}, not the 1-eps range of the single file we picked).
    //   3. data.episodeFile.coversEpisodes — eps the picked file serves.
    //   4. data.episode — single-ep fallback (lo == hi == the requested ep).
    // Returning null only when literally nothing is knowable about the
    // torrent's ep coverage (which is rare — the scraper always emits one
    // of the above).
    const resolveRange = () => {
      const r = data?.resolvedFrom?.range;
      if (r && Number.isFinite(r.lo) && Number.isFinite(r.hi)) {
        return { lo: r.lo, hi: r.hi };
      }
      const allEps = Array.isArray(data?.allEpisodes)
        ? data.allEpisodes.filter((n) => Number.isFinite(n))
        : [];
      if (allEps.length > 1) return { lo: Math.min(...allEps), hi: Math.max(...allEps) };
      const covers = Array.isArray(data?.episodeFile?.coversEpisodes)
        ? data.episodeFile.coversEpisodes.filter((n) => Number.isFinite(n))
        : [];
      if (covers.length > 1) return { lo: Math.min(...covers), hi: Math.max(...covers) };
      const single = Number(data?.episode);
      if (Number.isFinite(single) && single > 0) return { lo: single, hi: single };
      return null;
    };
    const range = resolveRange();

    // streamUrl: prefer the scraper's value (always set when fileIndex
    // resolved), but rebuild from the data we have if the scraper emitted
    // null. This is the safety net for torrents where the cached file list
    // didn't match `episodeFile.name` — without this fallback the response
    // would carry streamUrl=null even though the source torrent IS loaded
    // and the file IS playable.
    //
    // We can rebuild a working streamUrl whenever we have:
    //   - baseUrl
    //   - infoHash (resolved magnet hash, surfaced via firstSource.infoHash)
    //   - the 0-based file index inside the torrent's file list
    //
    // The file index lives on the parsed WebTorrent file object inside the
    // scraper — but the controller doesn't have that handle. So instead we
    // fall back to /stream?torrentId=...&ep=... when we can't reproduce the
    // exact file index. That endpoint goes through selectFile() and gets
    // the right file deterministically, so the client gets a playable URL
    // either way.
    const rebuildStreamUrl = () => {
      const origin = new URL(c.req.url).origin;
      if (!origin) return null;
      const infoHash = firstSource?.infoHash || data?.torrent?.infoHash || null;
      const transcode = wantsTranscode(c);
      if (infoHash && Number.isInteger(firstSource?.fileIndex) && firstSource.fileIndex >= 0) {
        const params = new URLSearchParams({ hash: infoHash.toLowerCase(), file: String(firstSource.fileIndex) });
        const audioIdx = data?.audioTrack?.index;
        if (audioIdx != null) params.set('audio', String(audioIdx));
        if (transcode) params.set('transcode', '1');
        return `${origin}/api/v2/nyaa/stream/file?${params.toString()}`;
      }
      // Last resort: redirect the client through /stream which goes through
      // selectFile() and re-emits a streamUrl from scratch. Cheap fallback
      // for torrents where the cached file list drifted out of sync with
      // the scraper's parsed episodeFile.
      const torrentId = data?.torrentId || data?.resolvedFrom?.torrentId;
      if (torrentId) {
        const ep = data?.episode || '';
        const params = new URLSearchParams({ torrentId: String(torrentId), ep: String(ep) });
        if (transcode) params.set('transcode', '1');
        return `${origin}/api/v2/nyaa/stream?${params.toString()}`;
      }
      return null;
    };

    return {
      title: enrichment?.matched ? enrichment.media?.title || data?.title : data?.title,
      poster: enrichment?.matched ? enrichment.media?.poster || null : null,
      animeepisodes: Array.isArray(data?.allEpisodes) ? data.allEpisodes : [],
      torrentid: data?.torrentId || null,
      url: data?.source || null,
      range,
      streamUrl: firstSource?.streamUrl || rebuildStreamUrl(),
      displayName: data?.episodeFile?.displayName || null,
      category: data?.category || null,
      server: data?.server || null,
      torrentUrl: data?.torrent?.torrentUrl || firstSource?.torrentUrl || null,
      track: data?.tracks || firstSource?.tracks || { audio: [], subtitle: [] },
      intro: skipTimes?.intro || null,
      outro: skipTimes?.outro || null,
    };
  },
});