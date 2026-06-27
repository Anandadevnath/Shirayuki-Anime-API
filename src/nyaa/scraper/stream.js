import {
  fetchViewPage,
  extractLabelValueMap,
  extractEpisodeFromName,
  parseSizeToBytes,
  parseMagnet,
  toAbsoluteUrl,
  NYAA_BASE_URL,
} from './_shared.js';
import { torrentClient } from '../stream/torrent-client.js';
import { axios } from '../../utils/scrapper-deps.js';

const textOf = ($el) => $el?.text()?.trim().replace(/\s+/g, ' ') || null;

const pickText = (map, key) => {
  const $v = map[key];
  return $v && $v.length ? textOf($v) : null;
};

const parseEpisodeNumber = (episodeParam) => {
  if (episodeParam !== undefined && episodeParam !== null && episodeParam !== '') {
    const n = Number(episodeParam);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
};

const buildStreamUrl = (infoHash, fileIndex, baseUrl, { transcode = false } = {}) => {
  const params = new URLSearchParams({ hash: infoHash, file: String(fileIndex) });
  if (transcode) params.set('transcode', '1');
  return `${baseUrl}/api/v2/nyaa/stream/file?${params.toString()}`;
};

const fetchTorrentFileBuffer = async (torrentId) => {
  const url = `${NYAA_BASE_URL}/download/${torrentId}.torrent`;
  const res = await axios.get(url, {
    proxy: false,
    timeout: 20000,
    responseType: 'arraybuffer',
    headers: {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: '*/*',
    },
  });
  return Buffer.from(res?.data || []);
};

export const getNyaaStreamInfo = async ({ torrentId, ep, baseUrl, transcode = false } = {}) => {
  const id = String(torrentId || '').trim().replace(/^\/+|\/+$/g, '');
  if (!/^\d+$/.test(id)) {
    throw new Error('torrentId must be a numeric Nyaa torrent id');
  }
  const episodeNumber = parseEpisodeNumber(ep);

  // Fetch the view page and the .torrent file in parallel — they're
  // independent reads against different nyaa.si endpoints.
  const [page, torrentBuf] = await Promise.all([
    fetchViewPage(id, `${NYAA_BASE_URL}/`),
    fetchTorrentFileBuffer(id).catch((err) => {
      console.warn('[nyaa/stream] .torrent fetch failed:', err.message);
      return null;
    }),
  ]);
  const { url: sourceUrl, $ } = page;

  const title = textOf($('.panel-title').first());
  if (!title) {
    throw new Error('Torrent not found');
  }

  const $footer = $('.panel-footer').first();
  const magnetHref = $footer.find('a[href^="magnet:"]').first().attr('href') || null;
  if (!magnetHref) {
    throw new Error('Torrent has no magnet link');
  }
  const magnetInfo = parseMagnet(magnetHref);
  if (!magnetInfo?.infoHash) {
    throw new Error('Failed to parse info hash from magnet');
  }

  const labels = extractLabelValueMap($);
  const sizeText = pickText(labels, 'file size');

  // Prefer the .torrent buffer (full bencoded metadata, no DHT needed); fall
  // back to the magnet if nyaa's CDN is unreachable. Trackers are pulled
  // from the magnet either way — without them WebTorrent falls back to DHT
  // only and ffprobe/ffmpeg can't read file bytes fast enough.
  const torrent = torrentBuf
    ? await torrentClient.addTorrentFile(torrentBuf, magnetInfo.infoHash, { trackers: magnetInfo.trackers })
    : await torrentClient.addMagnet(magnetHref, magnetInfo.infoHash);

  const selectedFile = torrentClient.selectFile(torrent, episodeNumber) || torrent.files[0];

  if (!selectedFile) {
    throw new Error('No playable file found in this torrent');
  }

  const fileIndex = torrent.files.indexOf(selectedFile);
  const selectedEpisode = extractEpisodeFromName(selectedFile.name);

  return {
    source: sourceUrl,
    torrentId: id,
    title,
    infoHash: magnetInfo.infoHash,
    torrentFileUrl: toAbsoluteUrl(`/download/${id}.torrent`),
    size: sizeText,
    sizeBytes: parseSizeToBytes(sizeText),
    fileCount: torrent.files.length,
    episode: episodeNumber,
    episodeFound: episodeNumber
      ? torrent.files.some((f) => extractEpisodeFromName(f.name) === episodeNumber)
      : false,
    files: torrent.files.map((f, i) => ({
      index: i,
      name: f.name,
      size: f.length,
      episode: extractEpisodeFromName(f.name),
    })),
    selectedFile: {
      index: fileIndex,
      name: selectedFile.name,
      size: selectedFile.length,
      episode: selectedEpisode,
    },
    sources: [
      {
        type: 'torrent',
        fileIndex,
        fileName: selectedFile.name,
        streamUrl: buildStreamUrl(magnetInfo.infoHash, fileIndex, baseUrl || '', { transcode }),
        streamType: 'http-range',
      },
    ],
    strategy: torrentBuf ? 'torrent-file' : 'magnet',
    status: torrent.ready ? 'ready' : 'metadata',
  };
};