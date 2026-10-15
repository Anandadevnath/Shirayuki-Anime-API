import { load } from '../../utils/scrapper-deps.js';
import {
  HIANIME_BASE_URL,
  pageGet,
  themeGet,
  toAbsoluteUrl,
  parseAnimeSlug,
} from './_shared.js';

// Parse a single character/voice-actor card from the characters/people theme
// payload. Each item is one <div class="bac-item"> carrying two .per-info
// blocks — the character (.per-info.ltr) and its voice actor (.per-info.rtl):
//
//   <div class="bac-item">
//     <div class="per-info ltr">                          ← character
//       <a href="/character/usopp-12053" class="pi-avatar"><img src=... alt="Usopp"></a>
//       <div class="pi-detail"><h4 class="pi-name"><a href>Usopp</a></h4>
//         <span class="pi-cast">Main</span></div>
//     </div>
//     <div class="per-info rtl">                          ← voice actor
//       <a href="/people/kappei-yamaguchi-2349" class="pi-avatar"><img src=... alt="Kappei Yamaguchi"></a>
//       <div class="pi-detail"><h4 class="pi-name"><a href>Kappei Yamaguchi</a></h4>
//         <span class="pi-cast">Japanese</span></div>
//     </div>
//     <div class="clearfix"></div>
//   </div>
const parseItem = ($) => {
  const parsePerson = (selector) => {
    const $wrap = $(selector).first();
    if (!$wrap.length) return null;
    const $link = $wrap.find('.pi-avatar').first();
    const $img = $link.find('img').first();
    const href = $link.attr('href') || null;
    const parsed = parseAnimeSlug(href) || {};
    return {
      id: parsed.id || null,
      slug: parsed.slug || null,
      name: $wrap.find('.pi-name').first().text().trim() || $img.attr('alt') || null,
      poster: toAbsoluteUrl($img.attr('src') || $img.attr('data-src')),
      role: $wrap.find('.pi-cast').first().text().trim() || null,
      url: href ? toAbsoluteUrl(href) : null,
    };
  };

  const character = parsePerson('.per-info.ltr');
  const voiceActor = parsePerson('.per-info.rtl');
  if (!character && !voiceActor) return null;
  if (voiceActor) {
    voiceActor.language = voiceActor.role; // .pi-cast on the rtl block = dub language (e.g. "Japanese")
    delete voiceActor.role;
  }
  return { ...(character || {}), ...(voiceActor ? { voiceActor } : {}) };
};

export const getHianimeCharacters = async ({ animeId, limit } = {}) => {
  const raw = String(animeId || '').trim();
  if (!raw) {
    const err = new Error('animeId path parameter is required (e.g. one-piece-1)');
    err.status = 400;
    throw err;
  }

  const parsed = parseAnimeSlug(raw);
  const detailUrl = `${HIANIME_BASE_URL}/${parsed?.slug || raw.replace(/^\/+|\/+$/g, '')}`;
  let id = parsed?.id;
  if (!id) {
    // Resolve the numeric id from the detail page when only a bare slug was passed.
    const html = await pageGet(detailUrl);
    id = load(html)('meta[name="hi-anime-id"]').attr('content');
  }
  if (!id) {
    const err = new Error(`Could not resolve numeric anime id from "${raw}"`);
    err.status = 400;
    throw err;
  }

  const data = await themeGet(`/anime/${id}/characters`, detailUrl);
  const characters = (Array.isArray(data?.items) ? data.items : [])
    .map((html) => parseItem(load(String(html || ''))))
    .filter((r) => r && (r.name || r.id));

  const capped = Number.isFinite(Number(limit)) && Number(limit) > 0 ? characters.slice(0, Number(limit)) : characters;

  return {
    source: `${HIANIME_BASE_URL}/api/theme/anime/${id}/characters`,
    id: String(id),
    slug: parsed?.slug || null,
    total: typeof data?.total === 'number' ? data.total : characters.length,
    characters: capped,
  };
};
