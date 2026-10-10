import { readFileSync } from 'fs';
const html = readFileSync('/tmp/hd3.html', 'utf8');
console.log('--- script srcs ---');
for (const m of html.matchAll(/<script[^>]*src="([^"]+)"/g)) console.log(m[1]);
console.log('--- inline scripts (first 2000 chars) ---');
let i = 0;
for (const m of html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)) {
  console.log('=== inline', ++i, 'len', m[1].length, '===');
  console.log(m[1].slice(0, 2000));
}
console.log('--- body attrs ---');
for (const m of html.matchAll(/data-([a-z-]+)="([^"]*)"/g)) console.log(m[1], '=', m[2]);
