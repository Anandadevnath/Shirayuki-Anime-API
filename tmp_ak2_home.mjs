import fs from 'fs';
import { load } from 'cheerio';

const html = fs.readFileSync(new URL('./tmp_ak2_home.html', import.meta.url), 'utf8');
const $ = load(html);

console.log('=== all h2 (max 90) ===');
$('h2').each((_, el) => {
  const t = $(el).text().trim().replace(/\s+/g, ' ');
  if (t) console.log(t.slice(0, 90));
});

console.log('\n=== .block_area sections ===');
$('.block_area').each((_, el) => {
  const $b = $(el);
  const head = $b.find('.block_area_head, .cat-heading').first().text().trim() || 'NO-HEAD';
  const cards = $b.find('.item').length;
  console.log(head.slice(0, 60), '=> cards:', cards, '| id:', $b.attr('id'), '| class:', $b.attr('class'));
});

console.log('\n=== .item count on page ===');
console.log($('.item').length);
console.log('=== .film-item count ===');
console.log($('.film-item').length);
