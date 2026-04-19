import fs from 'fs';

const additions = {
  contacts: {
    recognitionFailed: {
      'zh-TW': '辨識失敗',
      en: 'Recognition failed',
      ja: '認識に失敗しました',
    },
    notLoggedIn: {
      'zh-TW': '未登入',
      en: 'Not logged in',
      ja: '未ログイン',
    },
    userNotFound: {
      'zh-TW': '找不到使用者',
      en: 'User not found',
      ja: 'ユーザーが見つかりません',
    },
    saveFailed: {
      'zh-TW': '儲存失敗',
      en: 'Save failed',
      ja: '保存に失敗しました',
    },
    photoUploadFailed: {
      'zh-TW': '照片 {index} 上傳失敗：{error}',
      en: 'Photo {index} upload failed: {error}',
      ja: '写真 {index} のアップロードに失敗：{error}',
    },
    logManualAdd: {
      'zh-TW': '透過網頁手動新增聯絡人',
      en: 'Added manually via web',
      ja: 'Webから手動で連絡先を追加',
    },
    cardAlt: {
      'zh-TW': '名片',
      en: 'Business card',
      ja: '名刺',
    },
    maxSixPhotos: {
      'zh-TW': '最多 6 張',
      en: 'Up to 6 photos',
      ja: '最大6枚',
    },
    ocrResultConfirm: {
      'zh-TW': 'OCR 辨識結果確認',
      en: 'OCR Result Confirmation',
      ja: 'OCR認識結果の確認',
    },
    ocrFields: {
      'zh-TW': '辨識欄位',
      en: 'Recognized fields',
      ja: '認識されたフィールド',
    },
    noFieldsRecognized: {
      'zh-TW': '未辨識到任何欄位',
      en: 'No fields recognized',
      ja: '認識されたフィールドはありません',
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
