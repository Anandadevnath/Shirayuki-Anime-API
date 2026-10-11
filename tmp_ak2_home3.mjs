import fs from 'fs';
import { load } from 'cheerio';
const html = fs.readFileSync('./tmp_ak2_home.html', 'utf8');
const $ = load(html);
const dump = (label, sel) => {
  console.log('\n######## ' + label + ' ########');
  const el = $(sel).first();
  if (!el.length) { console.log('(none)'); return; }
  console.log($.html(el).slice(0, 3000));
};
dump('recent-update item', '#recent-update .item');
dump('upcoming item', '#upcoming-anime .item');
dump('top-table item', '.top-table .item');
dump('top-anime leader item', '#top-anime .item');
