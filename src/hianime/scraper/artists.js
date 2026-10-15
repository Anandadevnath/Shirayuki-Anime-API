import { load } from '../../utils/scrapper-deps.js';
import {
  HIANIME_BASE_URL,
  pageGet,
  toAbsoluteUrl,
} from './_shared.js';

// Artists from the detail page `.anisc-info`. Studios and Producers rows are
// laid out as <div class="item item-title"> with <span class="item-head">
// and one or more <a class="name" href="/studios/toei-animation">…</a>.
// Re-used by the /art bundle so it only loads the page once.
export const parseAniscArtists = ($) => {
  const artists = [];
  let company = null;

  $('.anisc-info .item').each((_, el) => {
    const $item = $(el);
    const head = $item.find('.item-head').first().text().trim().replace(/:\s*$/, '');
    if (head !== 'Studios' && head !== 'Producers') return;
    const kind = head === 'Studios' ? 'studio' : 'producer';

    $item.find('a.name, a').each((__, a) => {
      const $a = $(a);
      const name = $a.text().replace(/\s+/g, ' ').trim();
      const href = $a.attr('href') || null;
      if (!name) return;
      const entry = {
        name,
        slug: href ? String(href).split('/').pop() || null : null,
        kind,
        url: href ? toAbsoluteUrl(href) : null,
      };
      artists.push(entry);
      if (kind === 'studio' && !company) company = entry;
    });
  });

  return { artists, company };
};

export const getHianimeArtists = async ({ animeId } = {}) => {
  const raw = String(animeId || '').trim();
  if (!raw) {
    const err = new Error('animeId path parameter is required (e.g. one-piece-1)');
    err.status = 400;
    throw err;
  }
  const clean = raw.replace(/^\/+|\/+$/g, '');
  const url = `${HIANIME_BASE_URL}/${clean}`;
  const html = await pageGet(url);
  const $ = load(html);
  const { artists, company } = parseAniscArtists($);

  return { source: url, total: artists.length, artists, company };
};
