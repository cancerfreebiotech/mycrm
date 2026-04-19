import fs from 'fs';
import path from 'path';

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', '.next', 'dist', 'build', '.git'].includes(entry.name)) walk(full, files);
    } else if (/\.(tsx|ts|jsx|js)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

const bgWhiteViolations = [];
const hardcodedZh = [];

const files = walk('src');
// Public pages (accessed from email links without middleware locale context) bundle their
// own 3-language STRINGS dict and language switcher — a deliberate pattern, not a violation.
const IN_FILE_I18N_FILES = [
  'src/app/email-optout/',
  'src/app/unsubscribe/',
  'src/app/docs/',
];
const targetFiles = files.filter(f =>
  !f.includes('messages') &&
  !f.includes('.test.') &&
  !IN_FILE_I18N_FILES.some(p => f.replace(/\\/g, '/').includes(p))
);

for (const f of targetFiles) {
  const content = fs.readFileSync(f, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, i) => {
    const classMatches = line.match(/className=["`]([^"`]*)["`]/g) || [];
    for (const cm of classMatches) {
      if (/\bbg-white\b/.test(cm) && !/dark:bg-/.test(cm)) {
        bgWhiteViolations.push(f + ':' + (i + 1));
        break;
      }
    }
  });

  if (f.endsWith('.tsx') && !f.includes('src/app/api/')) {
    lines.forEach((line, i) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('import')) return;
      // Skip multilingual data lookup objects: lines where non-display keys carry
      // localised strings (name_zh/name_ja/...). These are DB seed data, not UI text.
      if (/\bname_(zh|ja|local|en)\s*:/.test(trimmed) && !/className=|placeholder=|alt=|title=/.test(trimmed)) return;
      // Skip locale-keyed dicts: `'zh-TW': '...'` / `'ja': '...'` style lines used for
      // self-identifying language labels and in-file multilingual LABELS maps.
      if (/^['"](zh-TW|zh|en|ja)['"]\s*:/.test(trimmed)) return;
      const jsxText = line.match(/>[^<>{}]*[\u4e00-\u9fa5][^<>{}]*</g);
      const strZh = line.match(/["'][^"']*[\u4e00-\u9fa5][^"']*["']/g);
      if (jsxText || strZh) {
        hardcodedZh.push({ file: f, line: i + 1, text: trimmed.slice(0, 120) });
      }
    });
  }
}

console.log('=== bg-white 無 dark: 對應 ===');
console.log('違規處: ' + bgWhiteViolations.length);
bgWhiteViolations.slice(0, 30).forEach(x => console.log('  ' + x));
if (bgWhiteViolations.length > 30) console.log('  ...還有 ' + (bgWhiteViolations.length - 30));

console.log('\n=== Hardcoded 中文（可能違反 i18n）===');
console.log('總行數: ' + hardcodedZh.length);
const byFile = {};
hardcodedZh.forEach(x => { byFile[x.file] = (byFile[x.file] || 0) + 1; });
const sorted = Object.entries(byFile).sort((a, b) => b[1] - a[1]);
console.log('\n共 ' + sorted.length + ' 個檔案有 hardcode 中文');
console.log('\nTop 30 檔案:');
sorted.slice(0, 30).forEach(([f, c]) => console.log('  ' + String(c).padStart(4) + '  ' + f));
