import fs from 'fs';

const additions = {
  contacts: {
    batchLogMet: {
      'zh-TW': '認識於：{at}（{date}）',
      en: 'Met at: {at} ({date})',
      ja: '出会い：{at}（{date}）',
    },
    batchLogReferredBy: {
      'zh-TW': '，介紹人：{name}',
      en: ', referred by: {name}',
      ja: '、紹介者：{name}',
    },
    parseFailed: { 'zh-TW': '解析失敗', en: 'Parse failed', ja: '解析に失敗しました' },
    linkedinParseFailed: {
      'zh-TW': 'LinkedIn 截圖解析失敗：',
      en: 'LinkedIn screenshot parse failed: ',
      ja: 'LinkedInスクリーンショットの解析に失敗：',
    },
    parsing: { 'zh-TW': '解析中...', en: 'Parsing...', ja: '解析中...' },
    copyEmail: { 'zh-TW': '複製 Email', en: 'Copy email', ja: 'メールをコピー' },
  },
  reports: {
    interactionType: { 'zh-TW': '互動類型', en: 'Interaction type', ja: 'やり取り種別' },
  },
  batchUpload: {
    ocrFailed: { 'zh-TW': 'OCR 失敗', en: 'OCR failed', ja: 'OCRに失敗しました' },
    processFailed: { 'zh-TW': '處理失敗', en: 'Processing failed', ja: '処理に失敗しました' },
  },
  notes: {
    jumpPlaceholder: { 'zh-TW': '跳至', en: 'Jump to', ja: '移動' },
  },
  models: {
    endpointPlaceholder: {
      'zh-TW': '例：Google Gemini',
      en: 'e.g. Google Gemini',
      ja: '例：Google Gemini',
    },
    newApiKey: { 'zh-TW': '新 API Key', en: 'New API key', ja: '新しいAPIキー' },
    modelIdPlaceholder: {
      'zh-TW': '例：gemini-2.5-flash',
      en: 'e.g. gemini-2.5-flash',
      ja: '例：gemini-2.5-flash',
    },
    modelNamePlaceholder: {
      'zh-TW': '例：Gemini 2.5 Flash',
      en: 'e.g. Gemini 2.5 Flash',
      ja: '例：Gemini 2.5 Flash',
    },
  },
  users: {
    confirmResetMfa: {
      'zh-TW': '確定要重設「{name}」的 MFA？該用戶下次登入時需重新設置。',
      en: 'Reset MFA for "{name}"? The user will need to set it up again on next login.',
      ja: '「{name}」のMFAをリセットしますか？次回ログイン時に再設定が必要です。',
    },
    mfaDeleted: {
      'zh-TW': '已刪除 {count} 個 MFA 驗證器',
      en: 'Deleted {count} MFA authenticator(s)',
      ja: '{count} 件のMFA認証器を削除しました',
    },
    resetFailedWithError: {
      'zh-TW': '重設失敗：{error}',
      en: 'Reset failed: {error}',
      ja: 'リセットに失敗：{error}',
    },
    resetFailed: {
      'zh-TW': '重設失敗，請稍後再試',
      en: 'Reset failed. Please try again later.',
      ja: 'リセットに失敗しました。後ほど再試行してください。',
    },
    mfaSet: { 'zh-TW': '已設定', en: 'Set', ja: '設定済み' },
    mfaNotSet: { 'zh-TW': '未設定', en: 'Not set', ja: '未設定' },
    resetting: { 'zh-TW': '重設中...', en: 'Resetting...', ja: 'リセット中...' },
    reset: { 'zh-TW': '重設', en: 'Reset', ja: 'リセット' },
  },
  tasks: {
    assignedAt: { 'zh-TW': '指派時間', en: 'Assigned at', ja: '割り当て日時' },
    assignedBy: { 'zh-TW': '指派人', en: 'Assigned by', ja: '割り当て者' },
  },
  permission: {
    noPermission: { 'zh-TW': '沒有權限', en: 'No permission', ja: '権限がありません' },
    contactAdmin: {
      'zh-TW': '請聯絡管理員開通此功能',
      en: 'Please contact an admin to enable this feature',
      ja: 'この機能を有効化するには管理者にお問い合わせください',
    },
  },
  emailCompose: {
    meLabel: { 'zh-TW': '我', en: 'Me', ja: '自分' },
  },
  feedback: {
    uploadScreenshot: {
      'zh-TW': '上傳截圖',
      en: 'Upload screenshot',
      ja: 'スクリーンショットをアップロード',
    },
  },
  unassignedNotes: {
    emptyContent: { 'zh-TW': '（空白）', en: '(empty)', ja: '（空白）' },
  },
  app: {
    description: {
      'zh-TW': 'Telegram 名片辨識 CRM 系統',
      en: 'Telegram business-card CRM system',
      ja: 'Telegram名刺認識CRMシステム',
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
