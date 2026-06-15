import { ANIMEX_BASE_URL } from './_shared.js';
import { anilistQuery, mapMediaList } from './_anilist.js';

const parseAnimeId = (animeId) => {
  const raw = String(animeId || '').trim();
  // Accept "21" or "21-one-piece" style slugs -> take the leading numeric id.
  const m = raw.match(/^(\d+)/);
  return m ? Number(m[1]) : null;
};

const DETAILS_QUERY = `
  query AnimexDetails($id: Int) {
    Media(id: $id, type: ANIME) {
      id
      idMal
      title { romaji english native userPreferred }
      description(asHtml: false)
      coverImage { extraLarge large medium color }
      bannerImage
      format
      type
      status
      episodes
      duration
      chapters
      averageScore
      meanScore
      popularity
      favourites
      genres
      synonyms
      season
      seasonYear
      countryOfOrigin
      isAdult
      source
      hashtag
      startDate { year month day }
      endDate { year month day }
      nextAiringEpisode { episode airingAt timeUntilAiring }
      trailer { id site thumbnail }
      studios(isMain: true) { nodes { id name } }
      tags { id name rank isMediaSpoiler }
      relations {
        edges {
          relationType
          node {
            id type format title { romaji english } coverImage { large } status
          }
        }
      }
      characters(sort: ROLE, perPage: 12) {
        edges {
          role
          node { id name { full } image { large } }
          voiceActors(language: JAPANESE) { id name { full } image { large } }
        }
      }
      recommendations(sort: RATING_DESC, perPage: 12) {
        nodes {
          mediaRecommendation {
            id type format title { romaji english native userPreferred }
            coverImage { large medium color } bannerImage episodes averageScore
            format status genres seasonYear duration popularity favourites idMal
            nextAiringEpisode { episode }
          }
        }
      }
    }
  }
`;

const pickTitle = (t = {}) => t.english || t.romaji || t.userPreferred || t.native || null;

export const getAnimexAnimeDetails = async ({ animeId } = {}) => {
  const id = parseAnimeId(animeId);
  if (!id) {
    const err = new Error('A numeric AniList animeId is required (e.g. 21)');
    err.status = 400;
    throw err;
  }

  const data = await anilistQuery(DETAILS_QUERY, { id });
  const media = data?.Media;
  if (!media) {
    const err = new Error(`No anime found for id ${id}`);
    err.status = 404;
    throw err;
  }

  const aired = media.nextAiringEpisode?.episode
    ? media.nextAiringEpisode.episode - 1
    : null;

  const relations = (media.relations?.edges || []).map((edge) => ({
    relationType: edge.relationType,
    id: edge.node?.id,
    title: pickTitle(edge.node?.title),
    type: edge.node?.format || edge.node?.type || null,
    status: edge.node?.status || null,
    poster: edge.node?.coverImage?.large || null,
  }));

  const characters = (media.characters?.edges || []).map((edge) => ({
    role: edge.role,
    id: edge.node?.id,
    name: edge.node?.name?.full || null,
    image: edge.node?.image?.large || null,
    voiceActor: edge.voiceActors?.[0]
      ? {
          id: edge.voiceActors[0].id,
          name: edge.voiceActors[0].name?.full || null,
          image: edge.voiceActors[0].image?.large || null,
        }
      : null,
  }));

  const recommendations = mapMediaList(
    (media.recommendations?.nodes || [])
      .map((n) => n.mediaRecommendation)
      .filter(Boolean),
  );

  return {
    source: `${ANIMEX_BASE_URL}/watch/${media.id}`,
    anime: {
      id: media.id,
      idMal: media.idMal ?? null,
      title: pickTitle(media.title),
      jname: media.title?.native || media.title?.romaji || null,
      ename: media.title?.english || null,
      romaji: media.title?.romaji || null,
      synonyms: media.synonyms || [],
      description: media.description || null,
      poster:
        media.coverImage?.extraLarge ||
        media.coverImage?.large ||
        media.coverImage?.medium ||
        null,
      banner: media.bannerImage || null,
      color: media.coverImage?.color || null,
      type: media.format || media.type || null,
      status: media.status || null,
      episodes: { sub: media.episodes ?? aired ?? null, dub: null },
      duration: media.duration ?? null,
      score: media.averageScore ?? media.meanScore ?? null,
      popularity: media.popularity ?? null,
      favourites: media.favourites ?? null,
      genres: media.genres || [],
      season: media.season || null,
      year: media.seasonYear ?? media.startDate?.year ?? null,
      countryOfOrigin: media.countryOfOrigin || null,
      source: media.source || null,
      isAdult: Boolean(media.isAdult),
      startDate: media.startDate || null,
      endDate: media.endDate || null,
      nextAiringEpisode: media.nextAiringEpisode || null,
      trailer: media.trailer
        ? {
            id: media.trailer.id,
            site: media.trailer.site,
            thumbnail: media.trailer.thumbnail,
            url:
              media.trailer.site === 'youtube'
                ? `https://www.youtube.com/watch?v=${media.trailer.id}`
                : media.trailer.site === 'dailymotion'
                  ? `https://www.dailymotion.com/video/${media.trailer.id}`
                  : null,
          }
        : null,
      studios: (media.studios?.nodes || []).map((s) => ({ id: s.id, name: s.name })),
      tags: (media.tags || [])
        .filter((t) => !t.isMediaSpoiler)
        .map((t) => ({ id: t.id, name: t.name, rank: t.rank })),
    },
    relations,
    characters,
    recommendations,
  };
};
