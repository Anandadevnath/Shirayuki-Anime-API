import fs from 'fs';
import { load } from 'cheerio';
const html = fs.readFileSync('./tmp_ak2_home.html', 'utf8');
const $ = load(html);
console.log('=== top-tables blocks ===');
$('.top-tables').each((_, el) => {
  const $t = $(el);
  console.log('block class:', $t.attr('class'), '| id:', $t.attr('id'));
  $t.find('.tb-heading, .heading, h3').each((__, h) => console.log('  heading:', $(h).text().trim().slice(0, 60)));
});
console.log('=== #top-anime headings ===');
$('#top-anime').each((_, el) => {
  $(el).find('.heading, h3, h2, .tb-heading').each((__, h) => { const t = $(h).text().trim(); if (t && t.length < 60) console.log('  HEAD:', t); });
});
console.log('=== nav-type par ===');
$('.nav-type').each((_, el) => console.log('NAV-TYPE:', $(el).text().trim().replace(/\s+/g,' ').slice(0, 80)));
$('.tab-title').each((_, el) => console.log('TAB-TITLE:', $(el).text().trim().slice(0, 60)));
console.log('=== section wrapper headings ===');
$('.block-heading, .section-title, .sec-heading, .widget-title, .head-title').each((_, el) => console.log('WHEAD:', $(el).text().trim().slice(0, 60)));
