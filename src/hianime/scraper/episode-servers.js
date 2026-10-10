import { load } from '../../utils/scrapper-deps.js';
import {
  HIANIME_BASE_URL,
  themeGet,
  parseAnimeSlug,
} from './_shared.js';
import { getHianimeEpisodes } from './anime.js';
import { decodeServerHash } from './megaplay.js';

const normalizeServerId = (name) =>
  String(name || 'HD-1').replace(/\s+/g, '').toUpperCase();

const mapServers = (list) =>
  list.map((s) => ({
    name: s.name,
    serverId: normalizeServerId(s.name),
    category: s.category,
    embed: s.embed,
    // raw fields
    hash: s.hash,
  }));

// Collect sub/dub servers from the decoded servers ajax html.
const parseServersHtml = (html) => {
  const $ = load(html);
  const pick = (type) =>
    $(`.server-item[data-type="${type}"]`)
      .map((_, el) => {
        const item = $(el);
        return {
          name: item.attr('data-server-name') || item.text().trim() || null,
          category: item.attr('data-type') || type,
          hash: item.attr('data-hash') || null,
          embed: decodeServerHash(item.attr('data-hash')),
        };
      })
      .get()
      .filter((s) => s.hash);
  return { sub: pick('sub'), dub: pick('dub') };
};

export const getHianimeEpisodeServers = async ({ episodeId, animeEpisodeId, ep } = {}) => {
  const rawEpisodeId = String(episodeId || '').trim();

  let resolvedId = rawEpisodeId;
  let animeRef = animeEpisodeId ? String(animeEpisodeId).trim() : null;
  let resolvedEp = Number(ep) > 0 ? Number(ep) : null;

  // If no episodeId was given, resolve it from the anime's episode list.
  if (!resolvedId) {
    if (!animeRef) {
      const err = new Error('episodeId (or animeEpisodeId + ep) is required');
      err.status = 400;
      throw err;
    }
    const parsed = parseAnimeSlug(animeRef);
    const list = await getHianimeEpisodes({ animeId: parsed?.slug ? `${parsed.slug}-${parsed.id}` : animeRef });
    const target = resolvedEp
      ? list.episodes.find((e) => e.episode === resolvedEp)
      : list.episodes[0];
    if (!target?.episodeId) {
      const err = new Error('Could not resolve an episodeId for this anime');
      err.status = 404;
      throw err;
    }
    resolvedId = target.episodeId;
    resolvedEp = target.episode;
  }

  const data = await themeGet(
    `/episode/servers?episodeId=${encodeURIComponent(resolvedId)}`,
    `${HIANIME_BASE_URL}/watch/${animeRef || resolvedId}`,
  );
  const { sub, dub } = parseServersHtml(data?.html || '');

  return {
    source: `${HIANIME_BASE_URL}/api/theme/episode/servers?episodeId=${resolvedId}`,
    episodeId: resolvedId,
    episode: resolvedEp || null,
    servers: {
      sub: mapServers(sub),
      dub: mapServers(dub),
    },
  };
};
