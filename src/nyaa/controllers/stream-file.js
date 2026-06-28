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
//
// The encoder flags below are tuned for *low-latency* output:
//
//   -tune zerolatency  — disable x264's rate-distortion lookahead, emit each
//                        frame as soon as it's encoded (no GOP buffer).
//   -g 30              — short GOP (1 keyframe/sec @ 30fps) so the stream is
//                        seekable in small chunks.
//   -keyint_min 30     — never place two keyframes closer than 30 frames.
//   -sc_threshold 0    — disable scene-cut detection so we never insert
//                        surprise keyframes that break the fixed GOP.
//   -bf 0              — no B-frames; lets the encoder pipeline be straight-through.
//   -flush_packets 1   — flush the muxer after every packet, so bytes leave
//                        ffmpeg's stdout immediately instead of batching up.
//   -analyzeduration 1 + -probesize 32768 — only the first 32 KB of the source
//                        is needed for ffmpeg to determine codec/framerate.
//                        Without these, ffmpeg blocks on the pipe for several
//                        seconds waiting for the demuxer to see enough header
//                        bytes to start producing output, which is the actual
//                        cause of the "buffers forever" symptom.
//
// Track selection: when `audio` and/or `subtitle` are provided (stream indices
// as listed by ffprobe, i.e. 0-based across all streams), we emit `-map 0:v:0`
// plus the requested audio/subtitle streams. Without selection we mirror the
// default behavior — first video, first audio, no subs.
//
// Returns both the readable stream of ffmpeg's output AND the spawned process
// handle, so the caller can SIGKILL the ffmpeg child when the HTTP response
// is aborted (browser closed the tab, navigated away, or paused for too long).
// Without explicit teardown, a disconnected client leaves ffmpeg blocked on
// its stdout pipe and eating a full CPU core indefinitely.
const transcodeToFragmentedMp4 = (sourceStream, { audio, subtitle } = {}) => {
  const mapArgs = ['-map', '0:v:0'];
  if (typeof audio === 'number' && Number.isInteger(audio) && audio >= 0) {
    mapArgs.push('-map', `0:a:${audio}`);
  } else {
    mapArgs.push('-map', '0:a:0?');
  }
  if (typeof subtitle === 'number' && Number.isInteger(subtitle) && subtitle >= 0) {
    mapArgs.push('-map', `0:s:${subtitle}`);
  }

  const ff = spawn('ffmpeg', [
    '-loglevel', 'error',
    '-fflags', '+genpts+nobuffer',
    '-flags', 'low_delay',
    '-analyzeduration', '1',
    '-probesize', '32768',
    '-i', 'pipe:0',
    ...mapArgs,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-tune', 'zerolatency',
    '-crf', '23',
    '-g', '30',
    '-keyint_min', '30',
    '-sc_threshold', '0',
    '-bf', '0',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ac', '2',
    ...(typeof subtitle === 'number' ? ['-c:s', 'mov_text'] : []),
    '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
    '-frag_size', '4096',
    '-flush_packets', '1',
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

  return { stdout: ff.stdout, process: ff };
};

// Kill the ffmpeg child + tear down the source/target streams. Used when the
// HTTP client disconnects mid-stream so we don't leak CPU + RAM. Tries SIGTERM
// first (lets ffmpeg flush its moov), then escalates to SIGKILL after 1s.
const teardownTranscode = ({ process: ff, sourceStream, mp4Stream }) => {
  try { mp4Stream?.destroy?.(); } catch { /* noop */ }
  try { sourceStream?.destroy?.(); } catch { /* noop */ }
  if (!ff || ff.killed) return;
  try { ff.stdin?.end?.(); } catch { /* noop */ }
  try { ff.kill('SIGTERM'); } catch { /* noop */ }
  setTimeout(() => {
    if (ff && !ff.killed) {
      try { ff.kill('SIGKILL'); } catch { /* noop */ }
    }
  }, 1000).unref?.();
};

export const nyaaStreamFileController = async (c) => {
  const hash = c.req.query('hash') || '';
  const fileIndex = Number(c.req.query('file') || '0');
  const rangeHeader = c.req.header('range');
  const transcode = c.req.query('transcode') === '1';

  // Track selection — stream indices from ffprobe's output (0-based within
  // audio / subtitle streams). `null`/missing means "use the default".
  const audioRaw = c.req.query('audio');
  const subtitleRaw = c.req.query('subtitle');
  const audio = audioRaw != null && audioRaw !== '' ? Number(audioRaw) : null;
  const subtitle = subtitleRaw != null && subtitleRaw !== '' ? Number(subtitleRaw) : null;
  const hasTrackSelection =
    (audio != null && Number.isInteger(audio) && audio >= 0) ||
    (subtitle != null && Number.isInteger(subtitle) && subtitle >= 0);

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

  // Mark this torrent as having an in-flight HTTP stream. The LRU evictor in
  // torrent-client.js skips torrents with liveStreams > 0 so the bytes we're
  // about to serve don't get yanked out from under the player. Released when
  // the underlying stream closes (browser disconnect, end-of-file, or error).
  const torrentKey = hash.toLowerCase();
  let streamReleased = false;
  const releaseOnce = () => {
    if (streamReleased) return;
    streamReleased = true;
    torrentClient.releaseStream(torrentKey);
  };
  torrentClient.acquireStream(torrentKey);

  const total = file.length;
  const range = parseRange(rangeHeader, total);
  const start = range?.start ?? 0;
  const end = range?.end ?? total - 1;
  const chunkSize = end - start + 1;

  const safeName = String(file.name).replace(/[\r\n"]/g, '');

  const headers = new Headers();
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Cache-Control', 'no-store');

  if (hasTrackSelection && !transcode) {
    // Track selection requires transcoding — we can't filter streams out of a
    // raw HTTP-range response without a re-mux. The client should either
    // pass ?transcode=1 alongside the track params, or use the browser's
    // native track selector on the raw stream.
    return c.json(
      {
        success: false,
        error: 'audio/subtitle selection requires transcode=1 — raw streams expose all tracks via the browser player',
      },
      400,
    );
  }

  if (transcode) {
    // Transcoded output is H.264/AAC fragmented MP4. Always start from the
    // beginning of the source — we ignore the Range header because ffmpeg
    // needs contiguous input from byte 0.
    //
    // highWaterMark is bumped to 1 MB so WebTorrent keeps feeding ffmpeg
    // without pausing on every read. The default 64 KB causes the piece
    // picker to alternate between downloading new pieces and serving
    // buffered ones, which serializes badly with the encoder.
    const wtStream = file.createReadStream({ start: 0, end: total - 1, highWaterMark: 1 << 20 });
    wtStream.on('error', (err) => {
      console.error(`[nyaa/stream/file] WebTorrent stream error for ${hash}:`, err.message);
      try { wtStream.destroy(); } catch { /* noop */ }
    });

    const { stdout: mp4Stream, process: ffProcess } = transcodeToFragmentedMp4(wtStream, { audio, subtitle });
    mp4Stream.on('error', (err) => {
      console.error('[nyaa/stream/file] ffmpeg stream error:', err.message);
      try { mp4Stream.destroy(); } catch { /* noop */ }
    });

    headers.set('Content-Type', 'video/mp4');
    // Fragmented MP4 length is unknown ahead of time — let the browser use
    // chunked transfer encoding.
    headers.set('Content-Disposition', `inline; filename="${safeName.replace(/\.[^.]+$/, '')}.mp4"`);
    const response = new Response(mp4Stream, { status: 200, headers });

    // When the browser closes the connection (tab navigated away, user hit
    // pause, range request canceled), tear down the ffmpeg child + WebTorrent
    // stream. Without this each aborted request leaks a 100%-CPU ffmpeg
    // process that lives until the server restarts.
    const abortHandler = () => {
      teardownTranscode({ process: ffProcess, sourceStream: wtStream, mp4Stream });
      releaseOnce();
    };
    c.req.raw?.signal?.addEventListener?.('abort', abortHandler);
    mp4Stream.on('close', abortHandler);

    return response;
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
  // Release the LRU stream slot when the read stream ends or the browser
  // disconnects, mirroring the transcode branch above.
  stream.on('close', releaseOnce);
  c.req.raw?.signal?.addEventListener?.('abort', releaseOnce);

  return new Response(stream, { status: range ? 206 : 200, headers });
};