import { catalog, mapMedia, httpError } from '../_shared.js';

const PER_PAGE = 20;

const mapPage = (page) => ({
  results: (page?.media || []).map(mapMedia),
  pageInfo: page?.pageInfo || null,
});

export const getAnvHome = async () => {
  const data = await catalog('HomeAnime', {});
  // Every home section is { media: [...] } (hero, trending, ...).
  return Object.fromEntries(
    Object.entries(data).map(([section, value]) => [section, (value?.media || []).map(mapMedia)]),
  );
};

export const getAnvSearch = async ({ q, page = 1 }) =>
  mapPage((await catalog('SearchAnime', { search: q, page, perPage: PER_PAGE })).Page);

export const getAnvBrowse = async ({ page = 1 }) =>
  mapPage((await catalog('BrowseAnime', { page, perPage: PER_PAGE })).Page);

export const getAnvAnime = async (slug) => {
  const media = (await catalog('AnimeDetail', { slug }))?.Media;
  if (!media) throw httpError(`anime "${slug}" not found on anv`, 404);
  return {
    ...mapMedia(media),
    description: media.description || null,
    synonyms: media.synonyms || [],
    studios: (media.studios?.nodes || []).map((s) => s.name),
    // streamingEpisodes is ordered ep 1..N; anv's own /api/episode takes the number.
    episodesList: (media.streamingEpisodes || []).map((e, i) => ({
      number: i + 1,
      title: e.title || null,
      thumbnail: e.thumbnail || null,
      isFiller: Boolean(e.filler),
    })),
  };
};
