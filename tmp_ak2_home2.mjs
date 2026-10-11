import fs from 'fs';
import { load } from 'cheerio';
const html = fs.readFileSync('./tmp_ak2_home.html', 'utf8');
const $ = load(html);
// walk up from each .item: parent chain classes
const sectionCounts = {};
$('.item').each((_, el) => {
  const chain = [];
  let node = $(el).parent();
  for (let i = 0; i < 6 && node.length; i++) {
    const cls = node.attr('class') || '';
    const id = node.attr('id') || '';
    chain.push((id ? '#'+id : '') + '.' + cls.split(/\s+/).join('.'));
    node = node.parent();
  }
  const key = chain.join('  >>  ');
  sectionCounts[key] = (sectionCounts[key] || 0) + 1;
});
const entries = Object.entries(sectionCounts).sort((a, b) => a[0].localeCompare(b[0]));
for (const [key, count] of entries) console.log(count + ' - ' + key);
