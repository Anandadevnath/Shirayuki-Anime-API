import {
  fetchViewPage,
  walkFileTree,
  extractLabelValueMap,
  parseNumber,
  parseSizeToBytes,
  toAbsoluteUrl,
  parseMagnet,
  CATEGORIES,
  NYAA_BASE_URL,
} from './_shared.js';

const textOf = ($el) => $el?.text()?.trim().replace(/\s+/g, ' ') || null;

const extractCategory = ($, labels) => {
  const $v = labels['category'];
  if (!$v || !$v.length) return { name: null, code: null };

  const $link = $v.find('a').first();
  const name = textOf($link);
  const href = $link.attr('href') || '';
  const cMatch = href.match(/[?&]c=([0-9_]+)/);
  const code = cMatch ? cMatch[1] : null;
  return {
    name,
    code,
    label: code ? CATEGORIES[code] || null : null,
    url: href ? toAbsoluteUrl(href) : null,
  };
};

const extractSubmitter = ($, labels) => {
  const $v = labels['submitter'];
  if (!$v || !$v.length) return { name: null, url: null };
  const $link = $v.find('a').first();
  const name = $link.length ? textOf($link) : textOf($v);
  const href = $link.attr('href') || null;
  return { name, url: href ? toAbsoluteUrl(href) : null };
};

const extractInformation = ($, labels) => {
  const $v = labels['information'];
  if (!$v || !$v.length) return { label: null, url: null };
  const $link = $v.find('a').first();
  const label = $link.length ? textOf($link) : textOf($v);
  const href = $link.attr('href') || null;
  return { label, url: href ? toAbsoluteUrl(href) : null };
};

const extractDate = ($, labels) => {
  const $v = labels['date'];
  if (!$v || !$v.length) return { text: null, timestamp: null };
  const text = textOf($v);
  const tsAttr = $v.attr('data-timestamp');
  return { text, timestamp: tsAttr ? Number(tsAttr) || null : null };
};

const extractDownloads = ($) => {
  const $footer = $('.panel-footer').first();
  if (!$footer.length) return { torrentUrl: null, infoHash: null };
  const $torrentLink = $footer.find('a[href$=".torrent"]').first();
  const $magnetLink = $footer.find('a[href^="magnet:"]').first();

  const torrentHref = $torrentLink.attr('href') || null;
  const magnetHref = $magnetLink.attr('href') || null;
  const parsed = parseMagnet(magnetHref);

  return {
    torrentUrl: torrentHref ? toAbsoluteUrl(torrentHref) : null,
    infoHash: parsed?.infoHash || null,
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
  const labels = extractLabelValueMap($);

  const category = extractCategory($, labels);
  const submitter = extractSubmitter($, labels);
  const information = extractInformation($, labels);
  const date = extractDate($, labels);

  const sizeText = textOf(labels['file size']);
  const downloadLinks = extractDownloads($);

  const $desc = $('#torrent-description');
  const description = $desc.length ? $desc.text().trim() || null : null;

  const files = extractFileList($);

  return {
    source: url,
    id,
    title,
    description,
    category,
    submitter,
    date,
    size: sizeText,
    sizeBytes: parseSizeToBytes(sizeText),
    infoHash: downloadLinks.infoHash || textOf(labels['info hash']) || null,
    seeders: parseNumber(textOf(labels['seeders'])) || 0,
    leechers: parseNumber(textOf(labels['leechers'])) || 0,
    completed: parseNumber(textOf(labels['completed'])) || 0,
    information,
    fileCount: files.length,
    files,
  };
};