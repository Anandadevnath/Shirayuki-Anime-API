import { load, axios } from '../../utils/scrapper-deps.js';

export const HIANIME_BASE_URL = 'https://hianime.ad';
export const DEFAULT_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export const parseNumber = (value) => {
  if (value === null || value === undefined) return null;
  const match = String(value).match(/\d+/);
  return match ? Number(match[0]) : null;
};

export const toAbsoluteUrl = (href) => {
  if (!href) return null;
  if (/^https?:\/\//i.test(href)) return href;
  return `${HIANIME_BASE_URL}${href.startsWith('/') ? '' : '/'}${href}`;
};

export const getAnimeId = (href) => {
  if (!href) return null;
  const clean = href.split('#')[0].split('?')[0].trim();

  const animeMatch = clean.match(/\/anime\/([^/]+)/i);
  if (animeMatch) return animeMatch[1];

  const watchMatch = clean.match(/\/watch\/([^/]+)/i);
  if (watchMatch) return watchMatch[1];

  return clean.replace(/^\//, '') || null;
};

export const getEpisodeNumber = (href) => {
  if (!href) return null;
  const match = href.match(/\/ep-(\d+)/i);
  return match ? Number(match[1]) : null;
};

export const pageHeaders = (referer) => ({
  'User-Agent': DEFAULT_UA,
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  Referer: referer || HIANIME_BASE_URL,
});

export const ajaxHeaders = (referer) => ({
  'User-Agent': DEFAULT_UA,
  Accept: 'application/json, text/html, */*',
  'X-Requested-With': 'XMLHttpRequest',
  Referer: referer || HIANIME_BASE_URL,
});

export const fetchPage = async (path, { searchParams, referer, xhr } = {}) => {
  const query = new URLSearchParams();
  if (searchParams) {
    for (const [k, v] of Object.entries(searchParams)) {
      if (v === undefined || v === null || v === '') continue;
      if (Array.isArray(v)) {
        for (const item of v) {
          if (item === undefined || item === null || item === '') continue;
          query.append(k, String(item));
        }
      } else {
        query.append(k, String(v));
      }
    }
  }
  const qs = query.toString();
  const url = `${HIANIME_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}${qs ? `?${qs}` : ''}`;

  const resp = await axios.get(url, {
    proxy: false,
    timeout: 20000,
    headers: xhr ? ajaxHeaders(referer) : pageHeaders(referer),
  });

  return {
    url,
    html: String(resp?.data ?? ''),
    $: load(String(resp?.data ?? '')),
  };
};

export const extractPosterFromImg = ($img) => {
  if (!$img || !$img.length) return null;
  return (
    $img.attr('data-src')?.trim() ||
    $img.attr('src')?.trim() ||
    null
  );
};

export const parseFlwItem = ($, el) => {
  const $item = $(el);
  const $detailAnchor = $item.find('.film-detail .film-name a').first();
  const $posterAnchor = $item.find('.film-poster a').first();
  const $img = $item.find('.film-poster img').first();

  const detailHref = $detailAnchor.attr('href')?.trim() || null;
  const posterHref = $posterAnchor.attr('href')?.trim() || null;

  const href = detailHref || posterHref;
  const animeId = getAnimeId(href);

  const title =
    $detailAnchor.text().trim() ||
    $detailAnchor.attr('data-en')?.trim() ||
    $posterAnchor.attr('title')?.trim() ||
    null;

  const jname =
    $detailAnchor.attr('data-jp')?.trim() ||
    $posterAnchor.attr('data-jp')?.trim() ||
    null;

  const ename =
    $detailAnchor.attr('data-en')?.trim() ||
    $posterAnchor.attr('data-en')?.trim() ||
    null;

  const $infor = $item.find('.fd-infor');
  const type = $infor.find('.fdi-item').first().text().trim() || null;
  const duration = $infor.find('.fdi-item.fdi-duration').first().text().trim() || null;

  const subText = $item.find('.tick-item.tick-sub').first().text().trim();
  const dubText = $item.find('.tick-item.tick-dub').first().text().trim();

  return {
    id: animeId,
    title,
    jname,
    ename,
    href,
    url: toAbsoluteUrl(href),
    poster: extractPosterFromImg($img),
    type,
    duration,
    episode: getEpisodeNumber(href),
    episodes: {
      sub: parseNumber(subText),
      dub: parseNumber(dubText),
    },
  };
};

export const extractFlwItems = ($, scope) => {
  const $scope = scope ? $(scope) : $.root();
  return $scope
    .find('.flw-item')
    .map((_, el) => parseFlwItem($, el))
    .get();
};

export const extractPagination = ($) => {
  const $pagination = $('.pagination').first();
  if (!$pagination.length) {
    return { currentPage: 1, totalPages: 1, hasNextPage: false };
  }

  const currentPage =
    parseNumber($pagination.find('.page-item.active a').first().text()) || 1;

  const lastHref =
    $pagination.find('.page-item.last a').attr('href') ||
    $pagination.find('.page-item').last().find('a').attr('href') ||
    '';
  const totalFromLast = (() => {
    const match = lastHref.match(/[?&]page=(\d+)/);
    return match ? Number(match[1]) : null;
  })();

  const pageNumbers = $pagination
    .find('.page-item a[data-page]')
    .map((_, el) => Number($(el).attr('data-page')))
    .get()
    .filter((n) => Number.isFinite(n));

  const totalPages = Math.max(totalFromLast || 0, ...pageNumbers, currentPage);
  const hasNextPage = $pagination.find('.page-item.next a').length > 0;

  return { currentPage, totalPages, hasNextPage };
};
