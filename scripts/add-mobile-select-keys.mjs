import fs from 'fs';

const additions = {
  contacts: {
    selectAll: { 'zh-TW': '全選', en: 'Select all', ja: 'すべて選択' },
    selectedCount: {
      'zh-TW': '已選 {count} 人',
      en: '{count} selected',
      ja: '{count} 件選択',
    },
  },
};

for (const locale of ['zh-TW', 'en', 'ja']) {
  const p = `src/messages/${locale}.json`;
  const json = JSON.parse(fs.readFileSync(p, 'utf8'));
  let added = 0;
  for (const ns in additions) {
    if (!json[ns]) json[ns] = {};
    for (const k in additions[ns]) {
      if (json[ns][k] !== undefined) continue;
      json[ns][k] = additions[ns][k][locale];
      added++;
    }
  }
  fs.writeFileSync(p, JSON.stringify(json, null, 2) + '\n', 'utf8');
  console.log(`${locale}: added ${added}`);
}
