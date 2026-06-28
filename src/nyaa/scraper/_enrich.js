// Cross-reference a Nyaa torrent title with AniList so the Nyaa
// "anime details" endpoint can return HiAnime-style metadata
// (poster, cover, banner, genres, score, episode count, etc.)
// alongside the torrent info. The AniList helpers live in the anixo
// provider because they were built there first; we just reuse them.

import {
  anilistQuery,
  mapMedia,
  MEDIA_FRAGMENT,
} from '../../anixo/scraper/_anilist.js';

// Strip the noise from a Nyaa title to recover the canonical anime name.
// Nyaa titles look like:
//
//   [Group] Anime Name - 01 [1080p][HEVC][Multi-Audio]
//   Anime Name (2024) - 1080p BD x265 FLAC
//   [SubsPlease] Anime Name - 02 (1080p)
//
// We want a queryable substring ("Anime Name") that AniList search can match.
export const cleanTorrentTitle = (raw) => {
  if (!raw) return '';
  let t = String(raw);

  // Strip bracketed groups/tags first (e.g. "[SubsPlease]", "[1080p]").
  t = t.replace(/\[[^\]]*\]/g, ' ');
  // Strip parenthesized tags (year, codec, audio).
  t = t.replace(/\([^)]*\)/g, ' ');
  // Drop everything from the first " - " episode marker onward — everything
  // after that is episode number / quality / release group.
  let dashIdx = t.search(/\s+-\s+\d+\s*[\[(]/);
  if (dashIdx === -1) dashIdx = t.search(/\s-\s/);
  // SxxExx marker (e.g. "S01E10") — drop from the marker onward since the
  // anime name ends just before the season/episode token.
  const sIdx = t.search(/\bS\d{1,2}E\d{1,4}\b/i);
  if (sIdx > 0 && (dashIdx === -1 || sIdx < dashIdx)) dashIdx = sIdx;
  // Standalone "EP####" or "#EP####" markers (no preceding dash). These show
  // up on releases like "One Piece EP0001 ..." or "Title #EP123 - ..."
  const epIdx = t.search(/\s#?EP\d{1,5}\b/i);
  if (epIdx > 0 && (dashIdx === -1 || epIdx < dashIdx)) dashIdx = epIdx;
  // Batch episode range — "0747-0782", "001-100". Cut at the start of the
  // range so we don't ship "One Piece 0747-0782" to AniList (which won't
  // match). Triggers only when the range has 3+ digits on each side, which
  // avoids eating legitimate hyphens in titles like "Sakasa-senpai".
  const rangeIdx = t.search(/\b\d{3,}\s*-\s*\d{3,}\b/);
  if (rangeIdx > 0 && (dashIdx === -1 || rangeIdx < dashIdx)) dashIdx = rangeIdx;
  if (dashIdx > 0) t = t.slice(0, dashIdx);
  // Collapse whitespace and trim.
  t = t.replace(/\s+/g, ' ').trim();
  return t;
};

// Same GraphQL fragment anixo uses for suggestions: search by name,
// return the top hit sorted by relevance, scoped to ANIME type and
// excluding adult entries.
const ANIME_SEARCH_QUERY = `
  query NyaaEnrichSearch($search: String) {
    Page(page: 1, perPage: 1) {
      media(search: $search, sort: SEARCH_MATCH, type: ANIME, isAdult: false) {
        ...media
      }
    }
  }
  fragment media on Media { ${MEDIA_FRAGMENT} }
`;

// Look up an anime by name on AniList. Returns { matched, media }:
//   - { matched: true,  media } on success
//   - { matched: false, error } when AniList errors or finds nothing
export const enrichFromAniList = async (title) => {
  const cleaned = cleanTorrentTitle(title);
  if (!cleaned) {
    return { matched: false, error: 'empty title after cleanup' };
  }

  try {
    const data = await anilistQuery(ANIME_SEARCH_QUERY, { search: cleaned });
    const media = data?.Page?.media?.[0] || null;
    if (!media) {
      return { matched: false, error: `no AniList result for "${cleaned}"` };
    }
    const mapped = mapMedia(media);
    if (!mapped) {
      return { matched: false, error: 'AniList returned empty media' };
    }
    return { matched: true, media: mapped, matchedTitle: cleaned };
  } catch (err) {
    return { matched: false, error: err?.message || 'AniList lookup failed' };
  }
};