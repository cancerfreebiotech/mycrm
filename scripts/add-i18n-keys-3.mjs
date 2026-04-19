import fs from 'fs';

const additions = {
  contacts: {
    logCardUpdated: {
      'zh-TW': '【名片新資料】\n{content}',
      en: '[New Card Data]\n{content}',
      ja: '【名刺の新情報】\n{content}',
    },
    logPhotoNote: {
      'zh-TW': '【合照附註】{content}',
      en: '[Group Photo Note] {content}',
      ja: '【集合写真メモ】{content}',
    },
    fileTooLarge5mb: {
      'zh-TW': '「{name}」超過 5MB 限制',
      en: '"{name}" exceeds the 5MB limit',
      ja: '「{name}」は5MBの上限を超えています',
    },
    logSentEmail: {
      'zh-TW': '寄送郵件：{subject}',
      en: 'Sent email: {subject}',
      ja: 'メール送信：{subject}',
    },
    confirmMergeContact: {
      'zh-TW': '確定要將「{source}」合併進「{target}」？\n\n來源聯絡人將被刪除，此操作無法復原。',
      en: 'Merge "{source}" into "{target}"?\n\nThe source contact will be deleted; this cannot be undone.',
      ja: '「{source}」を「{target}」に統合しますか？\n\n統合元の連絡先は削除され、元に戻せません。',
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
