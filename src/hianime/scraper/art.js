import { load } from '../../utils/scrapper-deps.js';
import {
  HIANIME_BASE_URL,
  pageGet,
  toAbsoluteUrl,
  parseAnimeSlug,
} from './_shared.js';
import { searchFranchiseSeasons } from './seasons.js';
import { parseAniscArtists } from './artists.js';
import { getHianimeCharacters } from './characters.js';

// Stable hue derived from a company name — used as the fallback "logo" swatch.
const hueFromName = (name) => {
  let h = 0;
  for (const ch of String(name || 'lol')) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
};

const parseDetailArt = ($, clean) => {
  const titleEl = $('h2.film-name.dynamic-name, .anisc-detail h2').first();
  const poster = $('.anisc-poster .film-poster-img').first();
  const parsed = parseAnimeSlug(clean);
  return {
    id: parsed?.id || $('meta[name="hi-anime-id"]').attr('content') || null,
    slug: parsed?.slug || null,
    title: titleEl.text().trim() || titleEl.attr('data-jname') || null,
    jname: titleEl.attr('data-jname') || titleEl.attr('data-en') || null,
    poster: toAbsoluteUrl(poster.attr('data-src') || poster.attr('src')),
    description:
      $('.anisc-info .item-title .text').first().text().trim() ||
      $('.film-description .text').first().text().trim() ||
      null,
  };
};

/**
 * Fact sheet for "the anime I'm watching" — title art, studios/producers
 * artists, character cast and the lead animation company. All sub-sources
 * are probed and cached, so repeated hits stay well under a second.
 */
export const getHianimeArt = async ({ animeId, charactersLimit = 24, artLimit = 12 } = {}) => {
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

  const detail = parseDetailArt($, clean);
  const { artists, company } = parseAniscArtists($);

  // Characters + voice actors from the characters theme API.
  let characters = [];
  let total = 0;
  try {
    const res = await getHianimeCharacters({ animeId: clean });
    characters = res.characters;
    total = res.total;
  } catch {
    characters = [];
  }

  // "Art" = the anime's poster + all sibling franchise posters, deduped.
  // Shared search-based discovery so seasons stay in sync visually.
  let siblings = [];
  try {
    const res = await searchFranchiseSeasons({ fullTitle: detail.title, clean, detailUrl: url });
    siblings = res.seasons;
  } catch {
    siblings = [];
  }
  const seenArt = new Set();
  const art = [];
  const pushArt = (item) => {
    if (!item.poster || seenArt.has(item.poster)) return;
    seenArt.add(item.poster);
    art.push(item);
  };
  pushArt({ id: detail.id || clean, slug: detail.slug, poster: detail.poster, title: detail.title });
  siblings.forEach((s) =>
    pushArt({
      id: s.id,
      slug: parseAnimeSlug(s.id)?.slug || s.id,
      poster: s.poster,
      title: s.title,
    }),
  );

  const companyWithLogo = company
    ? { ...company, logo: null, logoColor: `hsl(${hueFromName(company.name)}, 65%, 56%)` }
    : null;

  return {
    source: url,
    anime: {
      id: detail.id,
      slug: detail.slug,
      title: detail.title,
      jname: detail.jname,
      poster: detail.poster,
      description: detail.description,
    },
    art: art.slice(0, Number.isFinite(Number(artLimit)) && Number(artLimit) > 0 ? Number(artLimit) : art.length),
    artists,
    characters: (Number.isFinite(Number(charactersLimit)) && Number(charactersLimit) > 0
      ? characters.slice(0, Number(charactersLimit))
      : characters),
    charactersTotal: total || characters.length,
    company: companyWithLogo,
  };
};
