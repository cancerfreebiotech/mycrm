import fs from 'fs';

const file = process.argv[2];
if (!file) { console.error('Usage: node extract-zh.mjs <file>'); process.exit(1); }

const content = fs.readFileSync(file, 'utf8');
const lines = content.split('\n');

const results = [];
lines.forEach((line, i) => {
  const trimmed = line.trim();
  if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('import')) return;
  const jsxText = line.match(/>[^<>{}]*[\u4e00-\u9fa5][^<>{}]*</g);
  const strZh = line.match(/["'][^"']*[\u4e00-\u9fa5][^"']*["']/g);
  const tmplZh = line.match(/`[^`]*[\u4e00-\u9fa5][^`]*`/g);
  if (jsxText || strZh || tmplZh) {
    results.push({ line: i + 1, raw: line, jsx: jsxText, str: strZh, tmpl: tmplZh });
  }
});

console.log('Total: ' + results.length + ' lines\n');
results.forEach(r => {
  console.log('L' + r.line + ':');
  console.log('  ' + r.raw.trim().slice(0, 200));
  if (r.jsx) r.jsx.forEach(t => console.log('  [JSX] ' + t));
  if (r.str) r.str.forEach(t => console.log('  [STR] ' + t));
  if (r.tmpl) r.tmpl.forEach(t => console.log('  [TMPL] ' + t));
  console.log('');
});
