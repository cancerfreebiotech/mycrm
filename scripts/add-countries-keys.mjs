import fs from 'fs';

const additions = {
  countries: {
    colFlag: { 'zh-TW': '旗', en: 'Flag', ja: '旗' },
    nameJaPlaceholder: {
      'zh-TW': '例：台湾',
      en: 'e.g. Taiwan',
      ja: '例：台湾',
    },
  },
};

const locales = ['zh-TW', 'en', 'ja'];

for (const locale of locales) {
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
