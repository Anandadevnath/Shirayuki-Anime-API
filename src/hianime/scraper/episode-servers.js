import { fetchPage } from './_shared.js';

const CATEGORY_TAB = { sub: 'tab_1', dub: 'tab_2', hsub: 'tab_0' };

const parseServerListForCategory = ($, category) => {
  const block = $(`.player-servers .ps_-block[data-id="${category}"]`).first();
  if (!block.length) return [];

  const tab = CATEGORY_TAB[category] || null;

  return block
    .find('a.server-video')
    .map((_, el) => {
      const $el = $(el);
      const name = $el.text().trim() || null;
      const embed = $el.attr('data-video') || null;
      const dataTab = $el.attr('data-tab') || null;
      return {
        name,
        nameId: name ? name.toLowerCase().replace(/\s+/g, '-') : null,
        embed,
        tab: dataTab,
      };
    })
    .get()
    .filter((s) => s.embed && (!tab || s.tab === tab));
};

const parseAnimeEpisodeId = (animeEpisodeId) => {
  if (!animeEpisodeId) return { slug: null, ep: null };
  const clean = animeEpisodeId.split('#')[0].split('?')[0].replace(/^\/watch\//, '').replace(/\/$/, '');
  const epMatch = clean.match(/^([^/]+)\/ep-(\d+)$/i);
  if (epMatch) return { slug: epMatch[1], ep: Number(epMatch[2]) };

  return { slug: clean || null, ep: null };
};

export const getHianimeEpisodeServers = async ({ animeEpisodeId, ep } = {}) => {
  const { slug, ep: epFromId } = parseAnimeEpisodeId(animeEpisodeId);
  if (!slug) {
    throw new Error('animeEpisodeId query parameter is required');
  }

  const epNumber = Number(ep) > 0 ? Number(ep) : epFromId || 1;

  const { url, $ } = await fetchPage(`/watch/${slug}/ep-${epNumber}`, {
    referer: 'https://hianime.ad/',
  });

  return {
    source: url,
    animeId: slug,
    episode: epNumber,
    servers: {
      sub: parseServerListForCategory($, 'sub'),
      dub: parseServerListForCategory($, 'dub'),
      hsub: parseServerListForCategory($, 'hsub'),
    },
  };
};
