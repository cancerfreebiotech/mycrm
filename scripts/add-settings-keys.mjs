import fs from 'fs';

const additions = {
  settings: {
    addFailed: { 'zh-TW': '新增失敗', en: 'Add failed', ja: '追加に失敗しました' },
    telegramIdNumeric: {
      'zh-TW': 'Telegram ID 必須為數字',
      en: 'Telegram ID must be numeric',
      ja: 'Telegram IDは数値である必要があります',
    },
    telegramIdPlaceholder: {
      'zh-TW': '例：123456789',
      en: 'e.g. 123456789',
      ja: '例：123456789',
    },
    remove: { 'zh-TW': '移除', en: 'Remove', ja: '削除' },
    resetToDefault: {
      'zh-TW': '還原為組織預設',
      en: 'Reset to org default',
      ja: '組織のデフォルトに戻す',
    },
    emailPromptPlaceholder: {
      'zh-TW': '留空則使用組織/系統預設',
      en: 'Leave blank to use org/system default',
      ja: '空欄の場合は組織/システムのデフォルトを使用',
    },
    systemDefaultInEffect: {
      'zh-TW': '目前生效的系統預設：',
      en: 'Currently active system default:',
      ja: '現在有効なシステムのデフォルト：',
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
