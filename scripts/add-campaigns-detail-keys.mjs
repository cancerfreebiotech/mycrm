import fs from 'fs';

const additions = {
  campaigns: {
    errorWord: { 'zh-TW': '錯誤', en: 'Error', ja: 'エラー' },
    backfillError: {
      'zh-TW': '錯誤：{error}',
      en: 'Error: {error}',
      ja: 'エラー：{error}',
    },
    backfillErrorWithDetail: {
      'zh-TW': '錯誤：{error} — {detail}',
      en: 'Error: {error} — {detail}',
      ja: 'エラー：{error} — {detail}',
    },
    noNewEvents: {
      'zh-TW': '沒有新事件可補入',
      en: 'No new events to backfill',
      ja: '補完する新しいイベントはありません',
    },
    backfillSuccess: {
      'zh-TW': '成功補入 {inserted} 筆事件（共查到 {messages} 封郵件）',
      en: 'Backfilled {inserted} events ({messages} emails queried)',
      ja: '{inserted} 件のイベントを補完しました（{messages} 件のメールを確認）',
    },
    webhookOk: {
      'zh-TW': 'Webhook 正常運作！測試事件已寫入資料庫。',
      en: 'Webhook is working! Test event written to the database.',
      ja: 'Webhookは正常に動作しています！テストイベントがデータベースに書き込まれました。',
    },
    webhookError: {
      'zh-TW': 'Webhook 錯誤：{error}',
      en: 'Webhook error: {error}',
      ja: 'Webhookエラー：{error}',
    },
    bulkOcrTitle: {
      'zh-TW': '批量 OCR 重新掃描退信名單',
      en: 'Bulk OCR rescan of bounced list',
      ja: 'バウンスリストの一括OCR再スキャン',
    },
    ocrProcessing: {
      'zh-TW': '處理中 {done} / {total}…',
      en: 'Processing {done} / {total}…',
      ja: '処理中 {done} / {total}…',
    },
    ocrScanDone: {
      'zh-TW': '掃描完成 — {count} 人 email 與現有不同',
      en: 'Scan done — {count} contacts differ from existing email',
      ja: 'スキャン完了 — {count} 名のメールが既存と異なります',
    },
    colCurrentEmail: {
      'zh-TW': '現有 Email',
      en: 'Current email',
      ja: '現在のメール',
    },
    colOcrSuggest: {
      'zh-TW': 'OCR 建議',
      en: 'OCR suggestion',
      ja: 'OCR提案',
    },
    sameValue: { 'zh-TW': '(同)', en: '(same)', ja: '（同じ）' },
    noCardImage: {
      'zh-TW': '無名片圖片',
      en: 'No card image',
      ja: '名刺画像なし',
    },
    statusPending: { 'zh-TW': '待處理', en: 'Pending', ja: '保留中' },
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
