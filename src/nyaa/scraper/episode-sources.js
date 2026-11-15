import { axios } from '../../utils/scrapper-deps.js';
import env from '../../config/env.js';
import { getNyaaEpisodeServers } from './episode-servers.js';
import { signStreamToken, resolveStreamSecret, INFO_HASH_RE } from './stream-token.js';
import { httpError } from '../_shared.js';

const PREWARM_TIMEOUT_MS = 3000;

const streamOrigin = () => {
  const origin = String(env.STREAM_ORIGIN || '').replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s/]+$/i.test(origin)) {
    throw httpError('STREAM_ORIGIN is not a valid http(s) origin on this server', 503);
  }
  return origin;
};

/** Build every worker URL for one hash/selection, all carrying the same signed token. */
export const buildWorkerUrls = ({ hash, sel, origin = streamOrigin(), secret, ttlSec }) => {
  const t = encodeURIComponent(signStreamToken({ hash, sel, ttlSec, secret }));
  const base = `${origin}/stream/${hash}/${sel}`;
  return {
    sourceUrl: `${base}/index.m3u8?t=${t}`,
    subtitlesUrl: `${base}/subs.vtt?t=${t}`,
    prepareUrl: `${origin}/prepare/${hash}/${sel}?t=${t}`,
  };
};

export const pickServer = (servers, { server, category }) => {
  const list = category === 'dub' ? servers.dub : servers.sub;
  if (!list.length) {
    throw httpError(`No seeded ${category === 'dub' ? 'dual-audio ' : ''}torrent found for this episode`, 404);
  }
  const wanted = String(server || '').trim().toLowerCase();
  // hianime-style clients send names like "hd-1"; anything that isn't an info
  // hash (prefix) means "best available".
  if (!/^[a-f0-9]{6,40}$/.test(wanted)) return list[0];
  const found = list.find((s) => s.infoHash.startsWith(wanted));
  if (!found) throw httpError('Requested server is not available for this episode', 404);
  return found;
};

// Ask the worker to start fetching now, so the m3u8 is (nearly) ready when the
// player asks for it. Failure here never fails the sources response.
const prewarmWorker = async (prepareUrl) => {
  try {
    const res = await axios.post(prepareUrl, null, { timeout: PREWARM_TIMEOUT_MS, proxy: false });
    return { reachable: true, ...(res.data?.data || {}) };
  } catch (error) {
    return { reachable: false, error: error.response?.data?.error || error.code || error.message };
  }
};

/**
 * Resolve one episode to a playable stream on the worker.
 * @param {{ episodeId?: string, animeEpisodeId?: string, ep?: string, server?: string, category?: string }} params
 */
export const getNyaaEpisodeSources = async (params = {}) => {
  const category = params.category === 'dub' ? 'dub' : 'sub';
  const episodeData = await getNyaaEpisodeServers(params);
  const chosen = pickServer(episodeData.servers, { server: params.server, category });
  if (!INFO_HASH_RE.test(chosen.infoHash)) throw httpError('Invalid torrent hash from Nyaa', 502);

  const secret = resolveStreamSecret(env.STREAM_SECRET, env.NODE_ENV);
  const urls = buildWorkerUrls({
    hash: chosen.infoHash,
    sel: chosen.fileSelection,
    secret,
    ttlSec: env.STREAM_TOKEN_TTL_SEC,
  });
  const worker = await prewarmWorker(urls.prepareUrl);
  const alternatives = category === 'dub' ? episodeData.servers.dub : episodeData.servers.sub;

  return {
    animeId: episodeData.animeId,
    anilistId: episodeData.anilistId,
    episodeId: episodeData.episodeId,
    episode: episodeData.episode,
    category,
    server: {
      id: chosen.infoHash,
      name: chosen.name,
      title: chosen.title,
      size: chosen.size,
      seeders: chosen.seeders,
    },
    sources: [{ url: urls.sourceUrl, type: 'm3u8' }],
    tracks: [{ file: urls.subtitlesUrl, label: 'English', kind: 'captions', default: true }],
    worker,
    alternatives: alternatives
      .filter((s) => s.infoHash !== chosen.infoHash)
      .slice(0, 5)
      .map(({ infoHash, name, seeders, size }) => ({ id: infoHash, name, seeders, size })),
  };
};
