import fs from 'fs';

const additions = {
  camcard: {
    pageTitle: {
      'zh-TW': '名片王匯入審查',
      en: 'Card Import Review',
      ja: '名刺インポート審査',
    },
    pageDesc: {
      'zh-TW': '待審查：{count} 張 · 按公司分組顯示',
      en: 'Pending: {count} · Grouped by company',
      ja: '審査待ち：{count} 枚 · 会社ごとに表示',
    },
    unknownCompany: { 'zh-TW': '（未知公司）', en: '(Unknown company)', ja: '（不明な会社）' },
    operationFailed: { 'zh-TW': '操作失敗', en: 'Operation failed', ja: '操作に失敗しました' },
    mergeFailed: { 'zh-TW': '合併失敗', en: 'Merge failed', ja: '統合に失敗しました' },
    bulkNoConfirmable: {
      'zh-TW': '此群組無可直接確認的名片（重複聯絡人需手動處理）',
      en: 'No cards in this group can be confirmed directly (duplicates need manual handling)',
      ja: 'このグループには直接確認できる名刺がありません（重複する連絡先は手動処理が必要）',
    },
    saveFailed: { 'zh-TW': '儲存失敗', en: 'Save failed', ja: '保存に失敗しました' },
    loadFailed: { 'zh-TW': '載入失敗', en: 'Load failed', ja: '読み込みに失敗しました' },
    clickToEnlarge: {
      'zh-TW': '點擊放大 ({alt})',
      en: 'Click to enlarge ({alt})',
      ja: 'クリックで拡大 ({alt})',
    },
    noName: { 'zh-TW': '（無姓名）', en: '(No name)', ja: '（名前なし）' },
    sideFront: { 'zh-TW': '正面', en: 'Front', ja: '表面' },
    sideBack: { 'zh-TW': '背面', en: 'Back', ja: '裏面' },
    fieldNameEn: { 'zh-TW': '英文名', en: 'English name', ja: '英語名' },
    fieldNameLocal: { 'zh-TW': '日文名', en: 'Local name', ja: '日本語名' },
    fieldCompany: { 'zh-TW': '公司', en: 'Company', ja: '会社' },
    fieldDepartment: { 'zh-TW': '部門', en: 'Department', ja: '部門' },
    fieldPhone: { 'zh-TW': '電話', en: 'Phone', ja: '電話' },
    fieldFax: { 'zh-TW': '傳真', en: 'Fax', ja: 'FAX' },
    fieldAddress: { 'zh-TW': '地址', en: 'Address', ja: '住所' },
    fieldAddressEn: { 'zh-TW': '英文址', en: 'Address (EN)', ja: '住所（英）' },
    fieldWebsite: { 'zh-TW': '網站', en: 'Website', ja: 'ウェブサイト' },
    fieldCountry: { 'zh-TW': '國家', en: 'Country', ja: '国' },
    confirmAddTitle: { 'zh-TW': '確認新增', en: 'Confirm add', ja: '追加を確認' },
    hasDupWarn: {
      'zh-TW': '偵測到重複聯絡人，請先處理',
      en: 'Duplicate contact detected — resolve first',
      ja: '重複する連絡先があります。先に処理してください',
    },
    sameEmail: { 'zh-TW': '相同 Email：', en: 'Same email: ', ja: '同じメール：' },
    similarName: { 'zh-TW': '姓名相似：', en: 'Similar name: ', ja: '類似する名前：' },
    view: { 'zh-TW': '查看', en: 'View', ja: '表示' },
    importanceLabel: { 'zh-TW': '重要性：', en: 'Importance: ', ja: '重要度：' },
    languageLabel: { 'zh-TW': '語言：', en: 'Language: ', ja: '言語：' },
    langZh: { 'zh-TW': '中', en: 'ZH', ja: '中' },
    langJa: { 'zh-TW': '日', en: 'JA', ja: '日' },
    tagsLabel: { 'zh-TW': '標籤：', en: 'Tags: ', ja: 'タグ：' },
    addAction: { 'zh-TW': '新增', en: 'Add', ja: '追加' },
    editAction: { 'zh-TW': '編輯', en: 'Edit', ja: '編集' },
    mergeAction: { 'zh-TW': '合併', en: 'Merge', ja: '統合' },
    skipAction: { 'zh-TW': '略過', en: 'Skip', ja: 'スキップ' },
    jumpPlaceholder: { 'zh-TW': '跳至', en: 'Jump to', ja: '移動' },
    searchPlaceholder: {
      'zh-TW': '搜尋姓名、公司...',
      en: 'Search name, company...',
      ja: '名前・会社で検索...',
    },
    countryAll: { 'zh-TW': '全部', en: 'All', ja: 'すべて' },
    countryTW: { 'zh-TW': 'TW 台灣', en: 'TW Taiwan', ja: 'TW 台湾' },
    countryJP: { 'zh-TW': 'JP 日本', en: 'JP Japan', ja: 'JP 日本' },
    countrySG: { 'zh-TW': 'SG 新加坡', en: 'SG Singapore', ja: 'SG シンガポール' },
    countryHK: { 'zh-TW': 'HK 香港', en: 'HK Hong Kong', ja: 'HK 香港' },
    countryCN: { 'zh-TW': 'CN 中國', en: 'CN China', ja: 'CN 中国' },
    countryUS: { 'zh-TW': 'US 美國', en: 'US United States', ja: 'US アメリカ' },
    filterHasDup: { 'zh-TW': '⚠️ 有重複', en: '⚠️ Has duplicate', ja: '⚠️ 重複あり' },
    filterHasEmail: { 'zh-TW': '✉ 有 Email', en: '✉ Has email', ja: '✉ メールあり' },
    sortLabel: { 'zh-TW': '排序', en: 'Sort', ja: '並び替え' },
    sortNewest: { 'zh-TW': '最新優先', en: 'Newest first', ja: '新しい順' },
    sortOldest: { 'zh-TW': '最舊優先', en: 'Oldest first', ja: '古い順' },
    selectAll: { 'zh-TW': '全選', en: 'Select all', ja: 'すべて選択' },
    deselectAll: { 'zh-TW': '取消全選', en: 'Deselect all', ja: 'すべて解除' },
    clear: { 'zh-TW': '清除', en: 'Clear', ja: 'クリア' },
    emptyPending: {
      'zh-TW': '目前無待審查名片',
      en: 'No cards pending review',
      ja: '審査待ちの名刺はありません',
    },
    cardPreview: { 'zh-TW': '名片預覽', en: 'Card preview', ja: '名刺プレビュー' },
    editCardTitle: { 'zh-TW': '編輯名片資料', en: 'Edit card data', ja: '名刺データを編集' },
    fieldCnName: { 'zh-TW': '中文名', en: 'Chinese name', ja: '中国語名' },
    fieldCompanyZh: { 'zh-TW': '公司（中文）', en: 'Company (ZH)', ja: '会社（中文）' },
    fieldCompanyEn: { 'zh-TW': '公司（英文）', en: 'Company (EN)', ja: '会社（英）' },
    fieldJobTitle: { 'zh-TW': '職稱', en: 'Job title', ja: '職位' },
    fieldSecondPhone: { 'zh-TW': '電話 2', en: 'Phone 2', ja: '電話 2' },
    fieldCountryCode: { 'zh-TW': '國家碼', en: 'Country code', ja: '国コード' },
    fieldAddressZhLabel: { 'zh-TW': '地址（中文）', en: 'Address (ZH)', ja: '住所（中文）' },
    fieldAddressEnLabel: { 'zh-TW': '地址（英文）', en: 'Address (EN)', ja: '住所（英）' },
    mergeToExisting: {
      'zh-TW': '合併至現有聯絡人',
      en: 'Merge with existing contact',
      ja: '既存の連絡先に統合',
    },
    mergeSearchDesc: {
      'zh-TW': '搜尋要合併的現有聯絡人，名片中的空白欄位將補入此聯絡人：',
      en: 'Search an existing contact to merge. Blank fields on the card will fill into this contact:',
      ja: '統合する既存の連絡先を検索します。名刺の空欄はこの連絡先に補完されます：',
    },
    mergeSearchPlaceholder: {
      'zh-TW': '輸入姓名、公司或 Email...',
      en: 'Enter name, company, or email...',
      ja: '名前・会社・メールを入力...',
    },
    selected: { 'zh-TW': '已選擇：', en: 'Selected: ', ja: '選択済み：' },
    mergeRule1: {
      'zh-TW': '• 名片的空白欄位將補入所選聯絡人',
      en: "• Blank fields on the card will fill into the selected contact",
      ja: '• 名刺の空欄は選択した連絡先に補完されます',
    },
    mergeRule2: {
      'zh-TW': '• 名片圖片會加入聯絡人的名片圖庫',
      en: "• The card image will be added to the contact's gallery",
      ja: '• 名刺画像は連絡先のギャラリーに追加されます',
    },
    mergeRule3: {
      'zh-TW': '• 名片暫存記錄標記為已確認',
      en: '• The staged card record will be marked confirmed',
      ja: '• 名刺の仮記録は確認済みとしてマークされます',
    },
    bulkSelectedCount: {
      'zh-TW': '已選取 <b>{count}</b> 張',
      en: '<b>{count}</b> selected',
      ja: '<b>{count}</b> 枚選択中',
    },
    bulkConfirmSelected: {
      'zh-TW': '確認選取（{count}）張',
      en: 'Confirm selected ({count})',
      ja: '選択確認（{count}）枚',
    },
    bulkDeselect: { 'zh-TW': '取消選取', en: 'Deselect', ja: '選択解除' },
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
