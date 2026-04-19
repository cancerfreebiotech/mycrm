import fs from 'fs';

const additions = {
  newsletter: {
    newCampaign: {
      'zh-TW': '新增 Campaign',
      en: 'New Campaign',
      ja: '新規キャンペーン',
    },
    nextStep: { 'zh-TW': '下一步', en: 'Next', ja: '次へ' },
    daysToComplete: {
      'zh-TW': '約 <b>{days}</b> 天完成',
      en: '~<b>{days}</b> days to complete',
      ja: '約 <b>{days}</b> 日で完了',
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
