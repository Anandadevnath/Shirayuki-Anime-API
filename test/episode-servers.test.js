import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseNyaaRss } from '../src/nyaa/scraper/rss.js';
import {
  rankTorrentsForEpisode,
  buildQueries,
  targetSeasonOf,
  resolveEpisodeRef,
  resolutionScore,
  showTitleKeys,
} from '../src/nyaa/scraper/episode-servers.js';

const torrents = parseNyaaRss(readFileSync(new URL('./fixtures/nyaa-rss.xml', import.meta.url), 'utf8'));

test('ranks only releases for the requested season/episode, single eps first', () => {
  const ranked = rankTorrentsForEpisode(torrents, { ep: 5, season: 2, preferredGroups: ['subsplease', 'erai-raws'] });
  assert.ok(ranked.length >= 3);
  ranked.forEach((s) => assert.equal(s.release.season, 2));
  assert.equal(ranked[0].release.episode, 5);
  assert.equal(ranked[0].fileSelection, 'auto');
  const batch = ranked.find((s) => s.release.isBatch);
  assert.ok(batch, 'S2 batch covering ep 5 is included');
  assert.equal(batch.fileSelection, 'e5');
  for (let i = 1; i < ranked.length; i += 1) assert.ok(ranked[i - 1].score >= ranked[i].score);
});

test('season 1 episode 28 excludes S2 releases', () => {
  const ranked = rankTorrentsForEpisode(torrents, { ep: 28, season: 1 });
  assert.ok(ranked.length > 0);
  ranked.forEach((s) => assert.equal(s.release.season ?? 1, 1));
});

test('drops unseeded torrents and remakes', () => {
  const fake = [{ ...torrents[3], seeders: 0 }, { ...torrents[3], infoHash: 'f'.repeat(40), remake: true }];
  assert.deepEqual(rankTorrentsForEpisode(fake, { ep: 10, season: 2 }), []);
});

test('builds sanitized nyaa queries and detects target season', () => {
  const media = {
    title: { romaji: 'Sousou no Frieren 2nd Season', english: 'Frieren: Beyond Journey’s End Season 2' },
    synonyms: ['葬送のフリーレン'],
  };
  const qs = buildQueries(media, 5);
  assert.deepEqual(qs, ['Sousou no Frieren 2nd Season 05', 'Frieren Beyond Journeys End Season 2 05', 'Sousou no Frieren']);
  qs.forEach((q) => assert.doesNotMatch(q, /[-|"]/));
  assert.equal(targetSeasonOf(media), 2);
});

test('resolveEpisodeRef accepts both id styles and rejects missing input', () => {
  assert.deepEqual(resolveEpisodeRef({ episodeId: '154587-ep-3' }), { animeRef: '154587', ep: 3 });
  assert.deepEqual(resolveEpisodeRef({ animeEpisodeId: 'sousou-no-frieren-154587', ep: '7' }), {
    animeRef: 'sousou-no-frieren-154587',
    ep: 7,
  });
  assert.throws(() => resolveEpisodeRef({}), /required/);
});

test('resolutionScore peaks at the preferred resolution and penalizes bigger files more', () => {
  assert.equal(resolutionScore(720, 720), 20);
  assert.equal(resolutionScore(1080, 720), 4);
  assert.equal(resolutionScore(480, 720), 12);
  assert.equal(resolutionScore(1080, 1080), 20);
  assert.equal(resolutionScore(null, 720), 6);
});

test('drops releases of other shows that share a title prefix', () => {
  const titleKeys = showTitleKeys({ title: { romaji: 'Sousou no Frieren', english: 'Frieren: Beyond Journey’s End' } });
  const spinoff = torrents.map((t) => ({ ...t, release: { ...t.release, title: `${t.release.title} Recap` } }));
  assert.deepEqual(rankTorrentsForEpisode(spinoff, { ep: 28, season: 1, titleKeys }), []);
  assert.ok(rankTorrentsForEpisode(torrents, { ep: 28, season: 1, titleKeys }).length > 0);
});

test('showTitleKeys includes season-stripped bases', () => {
  const keys = showTitleKeys({ title: { romaji: 'Jujutsu Kaisen 2nd Season' }, synonyms: ['JJK S2'] });
  assert.ok(keys.has('jujutsukaisen'));
  assert.ok(keys.has('jujutsukaisen2ndseason'));
});
