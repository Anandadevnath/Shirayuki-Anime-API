import { fetchPage, parseNumber, toAbsoluteUrl } from './_shared.js';

const stripLeadingNumber = (raw, number) => {
  if (!raw) return raw;
  const trimmed = raw.trim();
  const re = new RegExp(`^${number}\\s+`);
  return trimmed.replace(re, '').trim() || trimmed;
};

export const getHianimeEpisodes = async ({ animeId } = {}) => {
  const slug = String(animeId || '').trim();
  if (!slug) {
    throw new Error('animeId path parameter is required');
  }

  const { url, $ } = await fetchPage(`/watch/${slug}/ep-1`, {
    referer: 'https://hianime.ad/',
  });

  const ranges = $('#detail-ss-list .ss-list')
    .map((_, el) => $(el).attr('data-range') || null)
    .get()
    .filter(Boolean);

  const episodes = $('#detail-ss-list .ssl-item.ep-item')
    .map((_, el) => {
      const $a = $(el);
      const href = $a.attr('href')?.trim() || null;
      const number = parseNumber($a.attr('data-num')) || parseNumber(href);
      const rawName = $a.find('.ep-name').first().text().trim() || $a.attr('title')?.trim() || null;
      const name = number ? stripLeadingNumber(rawName, number) : rawName;

      return {
        number,
        title: name,
        href,
        url: toAbsoluteUrl(href),
        episodeId: href ? href.replace(/^\/watch\//, '') : null,
      };
    })
    .get()
    .filter((ep) => ep.number !== null);

  return {
    source: url,
    animeId: slug,
    totalEpisodes: episodes.length,
    ranges,
    episodes,
  };
};
