import { spawn } from 'node:child_process';
import { torrentClient } from '../stream/torrent-client.js';

const guessMime = (name) => {
  const ext = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/i)?.[1];
  if (!ext) return 'application/octet-stream';
  const map = {
    mkv: 'video/x-matroska',
    mp4: 'video/mp4',
    m4v: 'video/mp4',
    webm: 'video/webm',
    avi: 'video/x-msvideo',
    ts: 'video/mp2t',
    m2ts: 'video/mp2t',
    mov: 'video/quicktime',
    flv: 'video/x-flv',
  };
  return map[ext] || 'application/octet-stream';
};

const parseRange = (rangeHeader, fileLength) => {
  if (!rangeHeader) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) return null;
  const startStr = match[1];
  const endStr = match[2];

  if (startStr === '' && endStr === '') return null;

  let start;
  let end;

  if (startStr === '') {
    // Suffix range: bytes=-N → last N bytes
    const n = Number(endStr);
    if (!Number.isFinite(n) || n <= 0) return null;
    start = Math.max(0, fileLength - n);
    end = fileLength - 1;
  } else {
    start = Number(startStr);
    end = endStr === '' ? fileLength - 1 : Number(endStr);
  }

  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start < 0 || end < start) return null;
  if (start >= fileLength) return null;
  end = Math.min(end, fileLength - 1);

  return { start, end };
};

// Pipe WebTorrent's lazy byte stream through ffmpeg to produce a fragmented
// MP4 in H.264/AAC. The fragmented-moov flags let the browser start playback
// before the file is fully downloaded — required for HTTP-range streaming of
// a transcoded source.
//
// Trade-offs vs the raw path:
//   + Plays in any browser (no HEVC/AV1 codec requirement).
//   - ~1 CPU core per active stream. Use only when needed (?transcode=1).
//   - The Content-Length / Content-Range no longer reflect the source bytes —
//     we set them to "unknown" so the client treats the response as a live
//     stream (browsers will still issue byte-range requests, but ffmpeg always
//     reads from the start of the source).
const transcodeToFragmentedMp4 = (sourceStream) => {
  const ff = spawn('ffmpeg', [
    '-loglevel', 'error',
    '-fflags', '+genpts',
    '-i', 'pipe:0',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ac', '2',
    '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
    '-f', 'mp4',
    'pipe:1',
  ], { stdio: ['pipe', 'pipe', 'pipe'] });

  sourceStream.pipe(ff.stdin);
  ff.stdin.on('error', () => { /* EPIPE if client disconnected */ });

  // ffmpeg writes to stderr — surface failures but don't crash the response.
  let stderrBuf = '';
  ff.stderr.on('data', (b) => {
    stderrBuf += b.toString();
    if (stderrBuf.length > 4096) stderrBuf = stderrBuf.slice(-4096);
  });
  ff.on('error', (err) => {
    console.error('[nyaa/stream/file] ffmpeg spawn error:', err.message);
  });
  ff.on('close', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`[nyaa/stream/file] ffmpeg exited ${code}:`, stderrBuf.trim());
    }
  });

  return ff.stdout;
};

export const nyaaStreamFileController = async (c) => {
  const hash = c.req.query('hash') || '';
  const fileIndex = Number(c.req.query('file') || '0');
  const rangeHeader = c.req.header('range');
  const transcode = c.req.query('transcode') === '1';

  if (!/^[a-f0-9]{40}$/i.test(hash)) {
    return c.json({ success: false, error: 'valid hash query parameter is required' }, 400);
  }
  const torrent = await torrentClient.lookupTorrent(hash.toLowerCase());
  if (!torrent) {
    return c.json(
      { success: false, error: 'torrent not loaded yet — call /api/v2/nyaa/stream first' },
      404,
    );
  }
  const file = torrent.files[fileIndex];
  if (!file) {
    return c.json({ success: false, error: `file index ${fileIndex} not found in torrent` }, 404);
  }

  const total = file.length;
  const range = parseRange(rangeHeader, total);
  const start = range?.start ?? 0;
  const end = range?.end ?? total - 1;
  const chunkSize = end - start + 1;

  const safeName = String(file.name).replace(/[\r\n"]/g, '');

  const headers = new Headers();
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Cache-Control', 'no-store');

  if (transcode) {
    // Transcoded output is H.264/AAC fragmented MP4. Always start from the
    // beginning of the source — we ignore the Range header because ffmpeg
    // needs contiguous input from byte 0.
    const wtStream = file.createReadStream({ start: 0, end: total - 1 });
    wtStream.on('error', (err) => {
      console.error(`[nyaa/stream/file] WebTorrent stream error for ${hash}:`, err.message);
      try { wtStream.destroy(); } catch { /* noop */ }
    });

    const mp4Stream = transcodeToFragmentedMp4(wtStream);
    mp4Stream.on('error', (err) => {
      console.error('[nyaa/stream/file] ffmpeg stream error:', err.message);
      try { mp4Stream.destroy(); } catch { /* noop */ }
    });

    headers.set('Content-Type', 'video/mp4');
    // Fragmented MP4 length is unknown ahead of time — let the browser use
    // chunked transfer encoding.
    headers.set('Content-Disposition', `inline; filename="${safeName.replace(/\.[^.]+$/, '')}.mp4"`);
    return new Response(mp4Stream, { status: 200, headers });
  }

  // Raw byte-range path — fast, no CPU cost, requires browser support for
  // the source codec (H.264, VP9, etc.). HEVC won't play in Chromium/Firefox.
  headers.set('Content-Type', guessMime(file.name));
  headers.set('Content-Length', String(chunkSize));
  headers.set('Content-Disposition', `inline; filename="${safeName}"`);
  if (range) {
    headers.set('Content-Range', `bytes ${start}-${end}/${total}`);
  }

  const stream = file.createReadStream({ start, end });
  stream.on('error', (err) => {
    console.error(`[nyaa/stream/file] stream error for ${hash}:`, err.message);
    try { stream.destroy(); } catch { /* noop */ }
  });

  return new Response(stream, { status: range ? 206 : 200, headers });
};