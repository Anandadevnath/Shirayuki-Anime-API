import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const PROBE_TIMEOUT_MS = 90000;
const STDERR_TAIL_LINES = 15;
// Short segments: playback starts once ~2s of video is fetched instead of 6s.
// (-hls_init_time is ignored for event playlists with hls_list_size 0.)
const HLS_SEGMENT_SEC = '2';
// Read the torrent-backed input linearly. With a seekable HTTP input the Matroska
// demuxer jumps to the end for its Cues index, which on a cold torrent means waiting
// for the last pieces from the swarm (observed: ~60s before the first segment).
const LINEAR_INPUT = Object.freeze(['-seekable', '0']);
const TEXT_SUB_CODECS = new Set(['ass', 'ssa', 'subrip', 'srt', 'webvtt', 'mov_text', 'text']);

/**
 * Parse ffprobe JSON into streams + total duration (seconds, null if unknown). Pure.
 * @param {string} text
 * @returns {{ streams: Array, duration: number|null }}
 */
export const parseProbeOutput = (text) => {
  const json = JSON.parse(text);
  const duration = Number(json.format?.duration);
  return { streams: json.streams || [], duration: Number.isFinite(duration) && duration > 0 ? duration : null };
};

/** Run ffprobe on a URL and return { streams, duration }. Args array, never a shell. */
export const probe = (inputUrl) =>
  new Promise((resolve, reject) => {
    const args = ['-v', 'error', ...LINEAR_INPUT, '-print_format', 'json', '-show_streams', '-show_format', inputUrl];
    const proc = spawn('ffprobe', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    const timer = setTimeout(() => proc.kill('SIGKILL'), PROBE_TIMEOUT_MS);
    proc.stdout.on('data', (d) => {
      out += d;
    });
    proc.stderr.on('data', (d) => {
      err += d;
    });
    proc.on('error', (e) => {
      clearTimeout(timer);
      reject(new Error(`ffprobe failed to start: ${e.message}`));
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`ffprobe exited ${code}: ${err.trim().slice(-300)}`));
      try {
        resolve(parseProbeOutput(out));
      } catch (e) {
        reject(new Error(`ffprobe returned invalid JSON: ${e.message}`));
      }
    });
  });

const lang = (s) => String(s.tags?.language || '').toLowerCase();

/**
 * Decide stream mapping and codecs from ffprobe output (pure).
 * @param {Array} streams
 * @param {'auto'|'always'|'never'} transcodeMode
 */
export const planTranscode = (streams, transcodeMode = 'auto') => {
  const video = streams.find((s) => s.codec_type === 'video' && !s.disposition?.attached_pic);
  if (!video) throw new Error('No video stream found');
  const audios = streams.filter((s) => s.codec_type === 'audio');
  const audio = audios.find((s) => s.disposition?.default) || audios[0] || null;
  const textSubs = streams.filter((s) => s.codec_type === 'subtitle' && TEXT_SUB_CODECS.has(s.codec_name));
  const subtitle =
    textSubs.find((s) => ['eng', 'en'].includes(lang(s)) && !/sign|song/i.test(s.tags?.title || '')) ||
    textSubs.find((s) => s.disposition?.default) ||
    textSubs[0] ||
    null;

  const browserSafeVideo = video.codec_name === 'h264' && ['yuv420p', 'yuvj420p'].includes(video.pix_fmt);
  const copyVideo = transcodeMode === 'never' || (transcodeMode === 'auto' && browserSafeVideo);
  const copyAudio = audio && audio.codec_name === 'aac' && (audio.channels || 2) <= 2;

  return {
    videoIndex: video.index,
    audioIndex: audio ? audio.index : null,
    subtitleIndex: subtitle ? subtitle.index : null,
    copyVideo,
    copyAudio: Boolean(copyAudio),
    videoCodec: video.codec_name,
    audioCodec: audio?.codec_name || null,
  };
};

/** Build the ffmpeg argument list (pure, easy to unit test). */
export const buildFfmpegArgs = (inputUrl, outDir, plan) => {
  const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', ...LINEAR_INPUT, '-i', inputUrl, '-map', `0:${plan.videoIndex}`];
  if (plan.audioIndex != null) args.push('-map', `0:${plan.audioIndex}`);

  if (plan.copyVideo) args.push('-c:v', 'copy');
  else {
    args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p', '-profile:v', 'high');
    args.push('-force_key_frames', `expr:gte(t,n_forced*${HLS_SEGMENT_SEC})`);
  }
  if (plan.audioIndex != null) {
    if (plan.copyAudio) args.push('-c:a', 'copy');
    else args.push('-c:a', 'aac', '-b:a', '160k', '-ac', '2');
  }

  args.push(
    '-f', 'hls',
    '-hls_time', HLS_SEGMENT_SEC,
    '-hls_list_size', '0',
    '-hls_playlist_type', 'event',
    '-hls_flags', 'independent_segments+temp_file',
    '-start_number', '0',
    '-hls_segment_filename', path.join(outDir, 'seg_%05d.ts'),
    path.join(outDir, 'index.m3u8'),
  );

  if (plan.subtitleIndex != null) {
    // flush_packets: write cues as they arrive instead of buffering the whole file.
    args.push(
      '-map', `0:${plan.subtitleIndex}`,
      '-c:s', 'webvtt',
      '-flush_packets', '1',
      '-f', 'webvtt',
      path.join(outDir, 'subs.vtt'),
    );
  }
  return args;
};

/**
 * Start ffmpeg producing HLS into outDir. Returns a handle with state + stop().
 * @param {{ inputUrl: string, outDir: string, transcodeMode: string, log?: (m: string) => void }} p
 */
export const startHls = async ({ inputUrl, outDir, transcodeMode, log = () => {} }) => {
  await mkdir(outDir, { recursive: true });
  const { streams, duration } = await probe(inputUrl);
  const plan = planTranscode(streams, transcodeMode);
  log(`hls plan ${JSON.stringify(plan)}`);

  const proc = spawn('ffmpeg', buildFfmpegArgs(inputUrl, outDir, plan), { stdio: ['ignore', 'ignore', 'pipe'] });
  const handle = { plan, duration, state: 'running', error: null, stderrTail: [], stop: () => {} };

  proc.stderr.on('data', (d) => {
    const lines = String(d).split('\n').filter(Boolean);
    handle.stderrTail = [...handle.stderrTail, ...lines].slice(-STDERR_TAIL_LINES);
  });
  proc.on('error', (e) => {
    handle.state = 'failed';
    handle.error = `ffmpeg failed to start: ${e.message}`;
  });
  proc.on('close', (code, signal) => {
    if (handle.state === 'stopped') return;
    handle.state = code === 0 ? 'complete' : 'failed';
    if (code !== 0) handle.error = `ffmpeg exited ${code ?? signal}: ${handle.stderrTail.join(' | ').slice(-500)}`;
  });

  handle.stop = () => {
    if (handle.state !== 'running') return;
    handle.state = 'stopped';
    proc.kill('SIGTERM');
    setTimeout(() => proc.kill('SIGKILL'), 5000).unref();
  };
  return handle;
};
