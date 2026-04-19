import fs from 'fs';

const additions = {
  contacts: {
    aiRecentInteractionPrefix: {
      'zh-TW': '最近互動：',
      en: 'Recent interaction: ',
      ja: '最近のやり取り：',
    },
  },
};

const locales = ['zh-TW', 'en', 'ja'];

for (const locale of locales) {
  const path = `src/messages/${locale}.json`;
  const json = JSON.parse(fs.readFileSync(path, 'utf8'));

  let added = 0;
  for (const namespace in additions) {
    if (!json[namespace]) json[namespace] = {};
    for (const key in additions[namespace]) {
      if (json[namespace][key] !== undefined) continue;
      json[namespace][key] = additions[namespace][key][locale];
      added++;
    }
  }

  fs.writeFileSync(path, JSON.stringify(json, null, 2) + '\n', 'utf8');
  console.log(`${locale}: added ${added}`);
}
