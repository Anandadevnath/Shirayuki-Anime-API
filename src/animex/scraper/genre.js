import { ANIMEX_BASE_URL } from './_shared.js';
import { normalizePage } from './_anilist.js';
import { queryMediaPage } from './_list-query.js';

// Turn a slug like "slice-of-life" into AniList's "Slice of Life".
const slugToGenre = (slug) =>
  String(slug || '')
    .trim()
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
    // AniList genres keep "of"/"and" lowercase ("Slice of Life", "Mahou Shoujo")
    .replace(/\bOf\b/g, 'of')
    .replace(/\bAnd\b/g, 'and');

export const getAnimexGenre = async ({ genre, page } = {}) => {
  const slug = String(genre || '').trim();
  if (!slug) {
    const err = new Error('genre path parameter is required');
    err.status = 400;
    throw err;
  }

  const genreName = slugToGenre(slug);
  const normalizedPage = normalizePage(page);

  const { pagination, results } = await queryMediaPage({
    filter: 'genre: $genre, sort: POPULARITY_DESC, type: ANIME, isAdult: false',
    varDefs: '$genre: String',
    variables: { page: normalizedPage, genre: genreName },
  });

  return {
    source: `${ANIMEX_BASE_URL}/genre/${slug}`,
    genre: genreName,
    slug,
    pagination,
    results,
  };
};
