import fs from 'fs';

const additions = {
  contacts: {
    emailBlacklistBadge: {
      'zh-TW': '黑名單',
      en: 'Blacklisted',
      ja: 'ブラックリスト',
    },
    pendingUploadCount: {
      'zh-TW': '待上傳（{count} 張）',
      en: 'Pending upload ({count})',
      ja: 'アップロード待ち（{count}枚）',
    },
    stagedPreviewAlt: {
      'zh-TW': '待上傳-{index}',
      en: 'Pending-{index}',
      ja: 'アップロード待ち-{index}',
    },
    ocrExistingValue: {
      'zh-TW': '（現有：{value}）',
      en: '(current: {value})',
      ja: '（既存：{value}）',
    },
    photoCaptureDate: {
      'zh-TW': '拍攝日期：{date}',
      en: 'Captured: {date}',
      ja: '撮影日：{date}',
    },
    photoLocation: {
      'zh-TW': '地點：{location}',
      en: 'Location: {location}',
      ja: '場所：{location}',
    },
    clearStatusBadge: {
      'zh-TW': '清除標記',
      en: 'Clear status',
      ja: 'ステータスをクリア',
    },
    markAsBounced: {
      'zh-TW': '標記硬退信',
      en: 'Mark as bounced',
      ja: 'ハードバウンスとしてマーク',
    },
    markAsInvalid: {
      'zh-TW': '標記無效信箱',
      en: 'Mark as invalid',
      ja: '無効なメールとしてマーク',
    },
    generate: {
      'zh-TW': '生成',
      en: 'Generate',
      ja: '生成',
    },
    selectMergeContact: {
      'zh-TW': '選擇要合併的聯絡人',
      en: 'Select contact to merge',
      ja: '統合する連絡先を選択',
    },
    mergeSearchDesc: {
      'zh-TW': '搜尋要被合併（刪除）的聯絡人。目前聯絡人「<strong>{name}</strong>」將保留。',
      en: 'Search for the contact to be merged (and deleted). The current contact "<strong>{name}</strong>" will be kept.',
      ja: '統合（削除）する連絡先を検索します。現在の連絡先「<strong>{name}</strong>」は保持されます。',
    },
    reselect: {
      'zh-TW': '← 重新選擇',
      en: '← Reselect',
      ja: '← 再選択',
    },
  },
};

const locales = ['zh-TW', 'en', 'ja'];

for (const locale of locales) {
  const path = `src/messages/${locale}.json`;
  const json = JSON.parse(fs.readFileSync(path, 'utf8'));

  let added = 0;
  let skipped = 0;
  for (const namespace in additions) {
    if (!json[namespace]) json[namespace] = {};
    for (const key in additions[namespace]) {
      if (json[namespace][key] !== undefined) {
        skipped++;
        continue;
      }
      json[namespace][key] = additions[namespace][key][locale];
      added++;
    }
  }

  fs.writeFileSync(path, JSON.stringify(json, null, 2) + '\n', 'utf8');
  console.log(`${locale}: added ${added}, skipped ${skipped}`);
}
