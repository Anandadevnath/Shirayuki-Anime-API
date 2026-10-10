import { readFileSync } from 'fs';
for (const file of ['/tmp/hd3.html', '/tmp/hd4.html']) {
  console.log('====================', file);
  const s = readFileSync(file, 'utf8');
  const start = s.indexOf('eval(function(p,a,c,k,e,d)');
  console.log('index', start);
  if (start !== -1) {
    console.log(s.slice(start, start + 3500));
  }
}
