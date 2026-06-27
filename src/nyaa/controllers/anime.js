import { getNyaaAnimeDetails } from '../scraper/anime.js';
import { getNyaaSearch } from '../scraper/search.js';
import { enrichFromAniList } from '../scraper/_enrich.js';
import { wrapController } from './_cache.js';

const NUMERIC_ID = /^\d+$/;

const findFirstMatch = async (query) => {
  const result = await getNyaaSearch({ q: query });
  const first = result?.results?.[0];
  return first ? { id: first.id, title: first.title, matchedResult: first } : null;
};

// Reshape the raw Nyaa scraper output into a torrent sub-object that
// mirrors the way HiAnime groups its numeric metadata under `stats`.
const buildTorrentBlock = (details) => ({
  size: details.size,
  sizeBytes: details.sizeBytes,
  infoHash: details.infoHash,
  seeders: details.seeders,
  leechers: details.leechers,
  completed: details.completed,
  category: details.category,
  uploader: details.submitter,
  date: details.date,
  fileCount: details.fileCount,
  information: details.information,
});

// Build the HiAnime-style top-level fields. When AniList enrichment
// succeeded, we use that as the primary source of metadata and fall
// back to the torrent title / Nyaa description where it's missing.
const buildAnimeBlock = (enrichment, torrentTitle, torrentDescription) => {
  if (enrichment?.matched) {
    const m = enrichment.media;
    return {
      title: m.title,
      jname: m.jname,
      ename: m.ename,
      description: torrentDescription || null,
      poster: m.poster,
      cover: m.banner || m.poster,
      banner: m.banner,
      stats: {
        type: m.type,
        year: m.year,
        episodes: m.episodes,
        duration: m.duration,
        score: m.score,
        status: m.status,
      },
      genres: m.genres,
    };
  }
  // Fallback: only the torrent title is known. Everything else stays null.
  return {
    title: torrentTitle,
    jname: null,
    ename: null,
    description: torrentDescription || null,
    poster: null,
    cover: null,
    banner: null,
    stats: { type: null, year: null, episodes: null, duration: null, score: null, status: null },
    genres: [],
  };
};

export const nyaaAnimeController = wrapController({
  cacheKey: (c) => {
    const value = c.req.param('id') || '';
    return NUMERIC_ID.test(value) ? `anime:${value}` : `anime:q:${value.toLowerCase()}`;
  },
  handler: async (c) => {
    const raw = String(c.req.param('id') || '').trim();
    if (!raw) {
      throw new Error('id (numeric torrent id) or name path parameter is required');
    }

    // Branch 1: numeric ID — return Nyaa data only, skip enrichment.
    if (NUMERIC_ID.test(raw)) {
      const details = await getNyaaAnimeDetails({ torrentId: raw });
      return {
        source: details.source,
        id: details.id,
        torrentId: details.id,
        ...buildAnimeBlock(null, details.title, details.description),
        torrent: buildTorrentBlock(details),
        files: details.files,
        enrichment: { matched: false, skipped: true, reason: 'numeric-id path' },
      };
    }

    // Branch 2: slug / name — resolve via search, then enrich with AniList.
    const match = await findFirstMatch(raw);
    if (!match) {
      const err = new Error(`No Nyaa results found for "${raw}"`);
      err.statusCode = 404;
      throw err;
    }

    const details = await getNyaaAnimeDetails({ torrentId: match.id });
    const enrichment = await enrichFromAniList(details.title);

    const animeBlock = buildAnimeBlock(enrichment, details.title, details.description);

    return {
      source: details.source,
      id: raw,
      torrentId: match.id,
      ...animeBlock,
      torrent: buildTorrentBlock(details),
      files: details.files,
      enrichment: enrichment.matched
        ? {
            matched: true,
            source: 'anilist',
            anilistId: enrichment.media?.id ?? null,
            matchedTitle: enrichment.matchedTitle,
          }
        : { matched: false, source: 'anilist', error: enrichment.error },
      resolvedFrom: 'search',
      query: raw,
    };
  },
});