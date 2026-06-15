import { ANIMEX_BASE_URL } from './_shared.js';
import { anilistQuery, jikanGet } from './_anilist.js';

const parseAnimeId = (animeId) => {
  const m = String(animeId || '').trim().match(/^(\d+)/);
  return m ? Number(m[1]) : null;
};

const ID_MAP_QUERY = `
  query AnimexIdMap($id: Int) {
    Media(id: $id, type: ANIME) {
      id
      idMal
      episodes
      title { romaji english userPreferred }
      nextAiringEpisode { episode }
    }
  }
`;

// AniList has no per-episode metadata; the Animex player itself pulls episode
// titles from Jikan (MAL). We do the same: AniList id -> idMal -> Jikan episodes.
export const getAnimexEpisodes = async ({ animeId, page } = {}) => {
  const id = parseAnimeId(animeId);
  if (!id) {
    const err = new Error('A numeric AniList animeId is required (e.g. 21)');
    err.status = 400;
    throw err;
  }

  const data = await anilistQuery(ID_MAP_QUERY, { id });
  const media = data?.Media;
  if (!media) {
    const err = new Error(`No anime found for id ${id}`);
    err.status = 404;
    throw err;
  }

  const title =
    media.title?.english || media.title?.romaji || media.title?.userPreferred || null;
  const totalKnown =
    media.episodes ??
    (media.nextAiringEpisode?.episode ? media.nextAiringEpisode.episode - 1 : null);

  // Without a MAL id we can only synthesize a plain numbered list.
  if (!media.idMal) {
    const count = totalKnown || 0;
    const episodes = Array.from({ length: count }, (_, i) => ({
      number: i + 1,
      title: `Episode ${i + 1}`,
      episodeId: `${id}:${i + 1}`,
      malId: null,
      filler: false,
      url: `${ANIMEX_BASE_URL}/watch/${id}?ep=${i + 1}`,
    }));

    return {
      source: `${ANIMEX_BASE_URL}/watch/${id}`,
      animeId: String(id),
      title,
      totalEpisodes: count,
      hasNextPage: false,
      episodes,
    };
  }

  const requestedPage = Number(page) > 0 ? Number(page) : 1;
  let jikan = null;
  try {
    jikan = await jikanGet(`/anime/${media.idMal}/episodes`, { page: requestedPage });
  } catch {
    jikan = null;
  }

  const episodes = (jikan?.data || []).map((ep) => ({
    number: ep.mal_id,
    title: ep.title || `Episode ${ep.mal_id}`,
    titleJapanese: ep.title_japanese || null,
    titleRomaji: ep.title_romanji || null,
    episodeId: `${id}:${ep.mal_id}`,
    malId: ep.mal_id,
    aired: ep.aired || null,
    filler: Boolean(ep.filler),
    recap: Boolean(ep.recap),
    url: `${ANIMEX_BASE_URL}/watch/${id}?ep=${ep.mal_id}`,
  }));

  return {
    source: `${ANIMEX_BASE_URL}/watch/${id}`,
    animeId: String(id),
    idMal: media.idMal,
    title,
    totalEpisodes: totalKnown ?? episodes.length,
    currentPage: requestedPage,
    hasNextPage: Boolean(jikan?.pagination?.has_next_page),
    lastPage: jikan?.pagination?.last_visible_page ?? null,
    episodes,
  };
};
