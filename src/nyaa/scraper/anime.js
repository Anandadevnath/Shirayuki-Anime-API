import { fetchViewPage, walkFileTree, extractLabelValueMap, parseNumber, parseSizeToBytes, toAbsoluteUrl, parseMagnet, NYAA_BASE_URL } from './_shared.js';

const textOf = ($el) => $el?.text()?.trim().replace(/\s+/g, ' ') || null;

const extractPanelInfo = ($) => {
  const labels = extractLabelValueMap($);
  const result = {};

  const pickText = (key) => {
    const $v = labels[key];
    return $v && $v.length ? textOf($v) : null;
  };

  const pickHtml = (key) => {
    const $v = labels[key];
    return $v && $v.length ? $v.html()?.trim() || null : null;
  };

  const categoryHtml = pickHtml('category');
  if (categoryHtml) {
    const categoryLinks = [];
    categoryHtml.replace(/<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g, (_, href, name) => {
      categoryLinks.push({
        name: name.trim(),
        href,
        url: toAbsoluteUrl(href),
      });
      return '';
    });
    result.category = {
      raw: pickText('category'),
      links: categoryLinks,
    };
    const cMatch = categoryLinks[0]?.href?.match(/[?&]c=([0-9_]+)/);
    if (cMatch) result.categoryCode = cMatch[1];
  }

  const $dateEl = labels['date'];
  result.date = {
    raw: pickText('date'),
    timestamp: $dateEl && $dateEl.length && $dateEl.attr('data-timestamp')
      ? Number($dateEl.attr('data-timestamp')) || null
      : null,
  };

  result.submitter = {
    name: pickText('submitter'),
  };
  const $submitterLink = labels['submitter']?.find('a').first();
  if ($submitterLink.length) {
    const href = $submitterLink.attr('href') || null;
    result.submitter.href = href;
    result.submitter.url = toAbsoluteUrl(href);
  }

  result.seeders = parseNumber(pickText('seeders')) || 0;
  result.leechers = parseNumber(pickText('leechers')) || 0;
  result.completed = parseNumber(pickText('completed')) || 0;

  result.size = {
    raw: pickText('file size'),
    bytes: parseSizeToBytes(pickText('file size')),
  };

  result.infoHash = pickText('info hash');

  const $infoLink = labels['information']?.find('a').first();
  if ($infoLink.length) {
    const href = $infoLink.attr('href') || null;
    result.information = {
      label: pickText('information'),
      href,
      url: toAbsoluteUrl(href),
    };
  } else {
    result.information = {
      label: pickText('information'),
    };
  }

  return result;
};

const extractDescription = ($) => {
  const $desc = $('#torrent-description');
  if (!$desc.length) return null;
  const text = $desc.text().trim();
  const html = $desc.html()?.trim() || null;
  return { text, html };
};

const extractDownloads = ($) => {
  const $footer = $('.panel-footer').first();
  if (!$footer.length) return { torrentUrl: null, magnetUrl: null };
  const $torrentLink = $footer.find('a[href$=".torrent"]').first();
  const $magnetLink = $footer.find('a[href^="magnet:"]').first();

  const torrentHref = $torrentLink.attr('href') || null;
  const magnetHref = $magnetLink.attr('href') || null;

  return {
    torrentUrl: torrentHref ? toAbsoluteUrl(torrentHref) : null,
    magnetUrl: magnetHref || null,
    magnet: parseMagnet(magnetHref),
  };
};

const extractFileList = ($) => {
  const $list = $('.torrent-file-list');
  if (!$list.length) return [];
  const $rootUl = $list.children('ul').first();
  if (!$rootUl.length) return [];
  return walkFileTree($, $rootUl);
};

export const getNyaaAnimeDetails = async ({ torrentId } = {}) => {
  const id = String(torrentId || '').trim();
  if (!id) {
    throw new Error('torrentId path parameter is required');
  }

  const { url, $ } = await fetchViewPage(id, `${NYAA_BASE_URL}/`);

  if (!$('.panel-title').first().length) {
    throw new Error('Torrent not found');
  }

  const title = textOf($('.panel-title').first());
  const info = extractPanelInfo($);
  const downloads = extractDownloads($);
  const description = extractDescription($);
  const files = extractFileList($);

  return {
    source: url,
    id,
    title,
    ...info,
    description,
    downloads,
    fileCount: files.length,
    files,
  };
};