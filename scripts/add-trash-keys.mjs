import fs from 'fs';

const additions = {
  trash: {
    pageTitle: { 'zh-TW': '回收區', en: 'Trash', ja: 'ゴミ箱' },
    emptyTrash: { 'zh-TW': '回收區是空的', en: 'Trash is empty', ja: 'ゴミ箱は空です' },
    colDeletedBy: { 'zh-TW': '刪除者', en: 'Deleted by', ja: '削除者' },
    colDeletedAt: { 'zh-TW': '刪除時間', en: 'Deleted at', ja: '削除日時' },
    confirmRestore: {
      'zh-TW': '確定要還原此聯絡人？',
      en: 'Restore this contact?',
      ja: 'この連絡先を復元しますか？',
    },
    restoreFailed: {
      'zh-TW': '還原失敗',
      en: 'Restore failed',
      ja: '復元に失敗しました',
    },
    confirmPermanentDelete: {
      'zh-TW': '確定要永久刪除「{name}」？此操作無法復原，相關名片圖片也會一併刪除。',
      en: 'Permanently delete "{name}"? This cannot be undone; related card images will be removed as well.',
      ja: '「{name}」を完全に削除しますか？この操作は元に戻せず、関連する名刺画像も削除されます。',
    },
    permanentDeleteFailed: {
      'zh-TW': '永久刪除失敗',
      en: 'Permanent delete failed',
      ja: '完全削除に失敗しました',
    },
    sectionBasic: { 'zh-TW': '基本資料', en: 'Basic info', ja: '基本情報' },
    cardDefaultAlt: { 'zh-TW': '名片', en: 'Business card', ja: '名刺' },
    deletedAtLabel: {
      'zh-TW': '刪除時間：{date}',
      en: 'Deleted at: {date}',
      ja: '削除日時：{date}',
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
