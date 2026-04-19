import fs from 'fs';

const additions = {
  newsletter: {
    pageTitle: {
      'zh-TW': 'Newsletter 管理',
      en: 'Newsletter Management',
      ja: 'ニュースレター管理',
    },
    pageDesc: {
      'zh-TW': '建立、排程並追蹤電子報活動',
      en: 'Create, schedule, and track newsletter campaigns',
      ja: 'ニュースレター活動の作成・スケジュール・追跡',
    },
    unsubscribeManagement: {
      'zh-TW': '退訂管理',
      en: 'Unsubscribes',
      ja: '配信停止管理',
    },
    blacklistManagement: {
      'zh-TW': '黑名單',
      en: 'Blacklist',
      ja: 'ブラックリスト',
    },
    emptyCampaigns: {
      'zh-TW': '尚無 Campaign，點擊「新增 Campaign」開始',
      en: 'No campaigns yet. Click "New Campaign" to start.',
      ja: 'キャンペーンはありません。「新規キャンペーン」をクリックして開始',
    },
    statusDraft: { 'zh-TW': '草稿', en: 'Draft', ja: '下書き' },
    statusScheduled: { 'zh-TW': '已排程', en: 'Scheduled', ja: 'スケジュール済み' },
    statusSending: { 'zh-TW': '寄送中', en: 'Sending', ja: '送信中' },
    statusPaused: { 'zh-TW': '已暫停', en: 'Paused', ja: '一時停止' },
    statusSent: { 'zh-TW': '已完成', en: 'Sent', ja: '送信済み' },
    copyTitle: {
      'zh-TW': '{title}（複本）',
      en: '{title} (copy)',
      ja: '{title}（コピー）',
    },
    confirmDelete: {
      'zh-TW': '確定刪除此 Campaign？',
      en: 'Delete this campaign?',
      ja: 'このキャンペーンを削除しますか？',
    },
    resumeAction: { 'zh-TW': '繼續', en: 'Resume', ja: '再開' },
    pauseAction: { 'zh-TW': '暫停', en: 'Pause', ja: '一時停止' },

    // wizard
    stepBasic: { 'zh-TW': '基本設定', en: 'Basic', ja: '基本' },
    stepContent: { 'zh-TW': '編輯內容', en: 'Content', ja: 'コンテンツ' },
    stepRecipients: { 'zh-TW': '選擇收件人', en: 'Recipients', ja: '受信者' },
    stepSchedule: { 'zh-TW': '排程設定', en: 'Schedule', ja: 'スケジュール' },
    campaignName: { 'zh-TW': 'Campaign 名稱 *', en: 'Campaign name *', ja: 'キャンペーン名 *' },
    campaignNamePlaceholder: {
      'zh-TW': '內部識別用名稱',
      en: 'Internal name',
      ja: '内部識別用の名前',
    },
    emailSubjectLabel: { 'zh-TW': '郵件主旨 *', en: 'Email subject *', ja: 'メール件名 *' },
    emailSubjectPlaceholder: {
      'zh-TW': '收件人看到的主旨',
      en: 'Subject visible to recipients',
      ja: '受信者に表示される件名',
    },
    previewText: { 'zh-TW': '預覽文字', en: 'Preview text', ja: 'プレビューテキスト' },
    previewTextPlaceholder: {
      'zh-TW': '信箱收件匣顯示的摘要文字（選填）',
      en: 'Inbox preview summary (optional)',
      ja: '受信トレイに表示される要約文（任意）',
    },
    contentPlaceholder: {
      'zh-TW': '撰寫電子報內容...',
      en: 'Write your newsletter content...',
      ja: 'ニュースレターの内容を作成...',
    },
    testEmailPlaceholder: {
      'zh-TW': '寄測試信到...',
      en: 'Send test email to...',
      ja: 'テストメール送信先...',
    },
    testSending: { 'zh-TW': '寄送中...', en: 'Sending...', ja: '送信中...' },
    testAction: { 'zh-TW': '測試', en: 'Test', ja: 'テスト' },
    tagSelection: { 'zh-TW': '依 Tag 選取', en: 'Select by tag', ja: 'タグで選択' },
    manualSelection: {
      'zh-TW': '手動加選聯絡人',
      en: 'Manually add contacts',
      ja: '連絡先を手動で追加',
    },
    searchContactPlaceholder: {
      'zh-TW': '搜尋姓名或 email...',
      en: 'Search name or email...',
      ja: '名前またはメールで検索...',
    },
    calculatingCount: { 'zh-TW': '計算中...', en: 'Calculating...', ja: '計算中...' },
    estimatedRecipients: {
      'zh-TW': '預計寄送：<b>{count}</b> 人（已排除退訂與黑名單）',
      en: 'Estimated: <b>{count}</b> recipients (excluding unsubs and blacklist)',
      ja: '予定：<b>{count}</b> 件（配信停止・ブラックリスト除く）',
    },
    startTime: {
      'zh-TW': '開始寄送時間（台灣時間）',
      en: 'Start time (Taiwan time)',
      ja: '開始時刻（台湾時間）',
    },
    dailyLimit: {
      'zh-TW': '每天寄幾封（1–500）',
      en: 'Daily limit (1–500)',
      ja: '1日の送信数（1～500）',
    },
    sendHour: {
      'zh-TW': '每天幾點寄（UTC+8，0-23）',
      en: 'Send hour (UTC+8, 0-23)',
      ja: '送信時刻（UTC+8、0～23）',
    },
    scheduleSummary: {
      'zh-TW': '預計收件人 <b>{count}</b> 人，每天 <b>{limit}</b> 封 →',
      en: 'Estimated <b>{count}</b> recipients, <b>{limit}</b> per day →',
      ja: '予定受信者 <b>{count}</b> 件、1日 <b>{limit}</b> 件 →',
    },
    estimatedCompletionDate: {
      'zh-TW': '，預計完成日：{date}',
      en: ', estimated completion: {date}',
      ja: '、予定完了日：{date}',
    },
    previousStep: { 'zh-TW': '上一步', en: 'Previous', ja: '前へ' },
    errorFillRequired: {
      'zh-TW': '請填寫必要欄位',
      en: 'Please fill required fields',
      ja: '必須項目を入力してください',
    },
    errorFillNameSubject: {
      'zh-TW': '請填寫名稱與主旨',
      en: 'Please enter name and subject',
      ja: '名前と件名を入力してください',
    },
    errorSaveFailed: {
      'zh-TW': '儲存失敗',
      en: 'Save failed',
      ja: '保存に失敗しました',
    },
    saving: { 'zh-TW': '儲存中...', en: 'Saving...', ja: '保存中...' },
    confirmSchedule: {
      'zh-TW': '確認排程',
      en: 'Confirm schedule',
      ja: 'スケジュール確定',
    },

    // detail view
    backToList: { 'zh-TW': '返回列表', en: 'Back to list', ja: 'リストに戻る' },
    statSent: { 'zh-TW': '已寄送', en: 'Sent', ja: '送信済み' },
    statOpenRate: { 'zh-TW': '開信率', en: 'Open rate', ja: '開封率' },
    statClickRate: { 'zh-TW': '點擊率', en: 'Click rate', ja: 'クリック率' },
    statCompletedAt: { 'zh-TW': '完成時間', en: 'Completed at', ja: '完了時刻' },
    sendProgress: { 'zh-TW': '寄送進度', en: 'Send progress', ja: '送信進捗' },
    searchRecipientPlaceholder: {
      'zh-TW': '搜尋收件人...',
      en: 'Search recipient...',
      ja: '受信者を検索...',
    },
    recipientStatusSent: { 'zh-TW': '已寄', en: 'Sent', ja: '送信済み' },
    recipientStatusPending: { 'zh-TW': '待寄', en: 'Pending', ja: '送信予定' },
    recipientStatusFailed: { 'zh-TW': '失敗', en: 'Failed', ja: '失敗' },
    recipientOpened: { 'zh-TW': '已開信', en: 'Opened', ja: '開封済み' },
    recipientClicked: { 'zh-TW': '已點擊', en: 'Clicked', ja: 'クリック済み' },

    // unsubscribes view
    emptyUnsubs: {
      'zh-TW': '暫無退訂紀錄',
      en: 'No unsubscribes yet',
      ja: '配信停止の記録がありません',
    },
    noReason: { 'zh-TW': '未填原因', en: 'No reason', ja: '理由なし' },
    removeUnsub: {
      'zh-TW': '移除退訂（重新加回名單）',
      en: 'Remove unsubscribe (add back to list)',
      ja: '配信停止を解除（リストに戻す）',
    },
    prevPage: { 'zh-TW': '← 上一頁', en: '← Previous', ja: '← 前へ' },
    nextPage: { 'zh-TW': '下一頁 →', en: 'Next →', ja: '次へ →' },

    // blacklist view
    blacklistTitle: {
      'zh-TW': '黑名單管理',
      en: 'Blacklist Management',
      ja: 'ブラックリスト管理',
    },
    importFromSendgridTitle: {
      'zh-TW': '從 SendGrid 匯入 hard bounce、invalid email、全域退訂名單',
      en: 'Import hard bounces, invalid emails, and global unsubscribes from SendGrid',
      ja: 'SendGridからハードバウンス、無効メール、全体配信停止リストをインポート',
    },
    importing: { 'zh-TW': '匯入中...', en: 'Importing...', ja: 'インポート中...' },
    importFromSendgrid: {
      'zh-TW': '↓ 從 SendGrid 匯入抑制名單',
      en: '↓ Import SendGrid suppression list',
      ja: '↓ SendGrid抑制リストをインポート',
    },
    newBlacklistEmailPlaceholder: {
      'zh-TW': '新增 email 到黑名單...',
      en: 'Add email to blacklist...',
      ja: 'ブラックリストにメール追加...',
    },
    emptyBlacklist: {
      'zh-TW': '黑名單為空',
      en: 'Blacklist is empty',
      ja: 'ブラックリストは空です',
    },
    removeFromBlacklist: {
      'zh-TW': '移除黑名單',
      en: 'Remove from blacklist',
      ja: 'ブラックリストから削除',
    },
    importFailed: {
      'zh-TW': '匯入失敗',
      en: 'Import failed',
      ja: 'インポートに失敗しました',
    },
    importResultSuccess: {
      'zh-TW': '✅ 匯入完成：hard bounce {bounces} 筆、invalid email {invalid} 筆、退訂 {unsubs} 筆',
      en: '✅ Import complete: {bounces} hard bounces, {invalid} invalid emails, {unsubs} unsubscribes',
      ja: '✅ インポート完了：ハードバウンス {bounces} 件、無効メール {invalid} 件、配信停止 {unsubs} 件',
    },
    importResultError: {
      'zh-TW': '❌ {error}',
      en: '❌ {error}',
      ja: '❌ {error}',
    },
    searchEmailPlaceholder: {
      'zh-TW': '搜尋 email...',
      en: 'Search email...',
      ja: 'メールを検索...',
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
