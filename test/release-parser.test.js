import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRelease, releaseCoversEpisode, stripSeason, parseSeason } from '../src/nyaa/scraper/release-parser.js';

test('parses a SubsPlease single episode with season marker', () => {
  const r = parseRelease('[SubsPlease] Sousou no Frieren S2 - 05 (1080p) [6AAEC79A].mkv');
  assert.equal(r.group, 'SubsPlease');
  assert.equal(r.title, 'Sousou no Frieren');
  assert.equal(r.season, 2);
  assert.equal(r.episode, 5);
  assert.equal(r.resolution, 1080);
  assert.equal(r.isBatch, false);
  assert.equal(r.extension, 'mkv');
});

test('parses Erai-raws "2nd Season" naming and codec', () => {
  const r = parseRelease('[Erai-raws] Sousou no Frieren 2nd Season - 10 [1080p CR WEBRip HEVC AAC][MultiSub][8DF1FC34]');
  assert.deepEqual([r.season, r.episode, r.codec], [2, 10, 'hevc']);
});

test('parses batch ranges with ~ and parenthesised dash', () => {
  const a = parseRelease('[Erai-raws] Sousou no Frieren - 01 ~ 28 [1080p][BATCH]');
  const b = parseRelease('[SubsPlease] Sousou no Frieren S2 (01-10) (1080p) [Batch]');
  assert.deepEqual(a.episodeRange, { from: 1, to: 28 });
  assert.equal(a.isBatch, true);
  assert.deepEqual(b.episodeRange, { from: 1, to: 10 });
  assert.equal(b.season, 2);
});

test('does not read "Season 2 - 10" as a 2-10 range', () => {
  const r = parseRelease('[ASW] Kimetsu no Yaiba Season 2 - 10 [1080p HEVC]');
  assert.equal(r.episodeRange, null);
  assert.deepEqual([r.season, r.episode], [2, 10]);
});

test('parses versions, SxxEyy, 3-4 digit episodes and dual audio', () => {
  assert.equal(parseRelease('[SubsPlease] Dandadan - 03v2 (720p) [ABC].mkv').version, 2);
  const s = parseRelease('Show.Name.S01E05.1080p.WEB.x264.mkv');
  assert.deepEqual([s.title, s.season, s.episode, s.codec], ['Show Name', 1, 5, 'h264']);
  assert.equal(parseRelease('[Judas] One Piece - 1100 [1080p][HEVC x265 10bit]').episode, 1100);
  const pack = parseRelease('[EMBER] Dandadan (2024) (Season 1) [1080p] [Dual Audio HEVC WEBRip]');
  assert.equal(pack.isDualAudio, true);
  assert.equal(pack.isBatch, true);
});

test('releaseCoversEpisode honours season, episode, range and season packs', () => {
  const single = parseRelease('[SubsPlease] Sousou no Frieren S2 - 05 (1080p).mkv');
  assert.equal(releaseCoversEpisode(single, { episode: 5, season: 2 }), true);
  assert.equal(releaseCoversEpisode(single, { episode: 5, season: 1 }), false);
  const batch = parseRelease('[Erai-raws] Sousou no Frieren - 01 ~ 28 [1080p][BATCH]');
  assert.equal(releaseCoversEpisode(batch, { episode: 12, season: 1 }), true);
  assert.equal(releaseCoversEpisode(batch, { episode: 29, season: 1 }), false);
  const pack = parseRelease('[EMBER] Dandadan (Season 1) [1080p]');
  assert.equal(releaseCoversEpisode(pack, { episode: 7, season: 1 }), true);
});

test('stripSeason / parseSeason on AniList titles', () => {
  assert.equal(stripSeason('Sousou no Frieren 2nd Season'), 'Sousou no Frieren');
  assert.equal(stripSeason('Shingeki no Kyojin: The Final Season Part 2'), 'Shingeki no Kyojin: The Final Season');
  assert.equal(parseSeason('Mushoku Tensei Season 2').season, 2);
  assert.equal(parseSeason('One Piece').season, null);
});
