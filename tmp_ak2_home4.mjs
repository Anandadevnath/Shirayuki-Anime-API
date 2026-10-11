import fs from 'fs';
import { load } from 'cheerio';
const html = fs.readFileSync('./tmp_ak2_home.html', 'utf8');
const $ = load(html);

console.log('=== swiper slides / spotlight ===');
$('#slider .swiper-slide, .swiper-slide').each((_, el) => {
  const s = $(el);
  const text = s.text().trim().replace(/\s+/g, ' ').slice(0, 200);
  const img = s.find('img').first().attr('src') || '';
  const a = s.find('a').first().attr('href') || '';
  console.log('img:', img.slice(0, 120), '| href:', a.slice(0, 120), '| text:', text.slice(0, 200));
  console.log('--- html (first 700) ---');
  console.log($.html(s).slice(0, 700));
  console.log('=======\n');
});

console.log('\n=== #top-tables / .top-table section ===');
$('.top-table .tb-heading').each((_, el) => console.log('HEADING:', $(el).text().trim()));
