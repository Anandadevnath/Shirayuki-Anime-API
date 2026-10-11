import { load } from '../../utils/scrapper-deps.js';
import {
  ANIKOTO_BASE_URL,
  pageGet,
  ajaxGet,
} from '../_shared.js';
import { fetchEpisodeListHtml, parseEpisodes } from './anime.js';

// Parse the server-list ajax HTML (.servers .type[data-type] li).
const parseServersHtml = (html) => {
  const $ = load(html);
  const pick = (type) =>
    $(`.servers .type[data-type="${type}"] li`)
      .map((_, el) => {
        const li = $(el);
        return {
          name: li.text().trim() || null,
          linkId: li.attr('data-link-id') || null,
          cmid: li.attr('data-cmid') || null,
          serverId: li.attr('data-sv-id') || null,
          episodeId: li.attr('data-ep-id') || null,
        };
      })
      .get()
      .filter((s) => s.linkId);
  return { sub: pick('sub'), dub: pick('dub') };
};

// Resolve the target episode's token (data-ids) from the anime's episode list,
// then fetch its servers. Accepts episodeId OR (animeId + ep).
export const getAnikotoEpisodeServers = async ({ animeId, episodeId, ep } = {}) => {
  const cleanAnime = String(animeId || '').trim();
  if (!cleanAnime) {
    const err = new Error('animeId query parameter is required (e.g. naruto-eybxz)');
    err.status = 400;
    throw err;
  }

  const slug = cleanAnime.replace(/^\/+|^watch\//, '');
  const watchUrl = `${ANIKOTO_BASE_URL}/watch/${slug}`;
  const watchHtml = await pageGet(watchUrl, `${ANIKOTO_BASE_URL}/`);
  const $watch = load(watchHtml);
  const numericId = $watch('#watch-main').attr('data-id') || null;

  if (!numericId) {
    const err = new Error(`Anime not found or its id could not be determined (${slug})`);
    err.status = 404;
    throw err;
  }

  const episodeListHtml = await fetchEpisodeListHtml(numericId, watchUrl);
  const episodes = parseEpisodes(load(episodeListHtml), slug);

  let target = null;
  if (episodeId) target = episodes.find((e) => e.episodeId === String(episodeId));
  else if (Number(ep) > 0) target = episodes.find((e) => e.episode === Number(ep));
  else target = episodes[0];

  if (!target) {
    const err = new Error(`Episode ${episodeId ? `id ${episodeId}` : `number ${ep || 1}`} not found for this anime`);
    err.status = 404;
    throw err;
  }
  if (!target.token) {
    const err = new Error('Episode token (data-ids) missing from the episode list');
    err.status = 502;
    throw err;
  }

  const data = await ajaxGet(
    `/ajax/server/list?servers=${encodeURIComponent(target.token)}`,
    watchUrl,
  );
  const { sub, dub } = parseServersHtml(data?.result || '');

  return {
    source: `${ANIKOTO_BASE_URL}/ajax/server/list?servers=${target.token}`,
    animeId: slug,
    episode: target.episode,
    episodeId: target.episodeId,
    servers: { sub, dub },
  };
};