import fs from 'fs';

const additions = {
  tiptap: {
    varName: { 'zh-TW': '姓名', en: 'Name', ja: '名前' },
    varCompany: { 'zh-TW': '公司', en: 'Company', ja: '会社' },
    varJobTitle: { 'zh-TW': '職稱', en: 'Job title', ja: '職位' },
    bodyPlaceholder: {
      'zh-TW': '撰寫郵件內容...',
      en: 'Write email content...',
      ja: 'メール本文を作成...',
    },
    unsubscribeText: {
      'zh-TW': '取消訂閱 | Unsubscribe',
      en: 'Unsubscribe',
      ja: '配信停止 | Unsubscribe',
    },
    edit: { 'zh-TW': '編輯', en: 'Edit', ja: '編集' },
    preview: { 'zh-TW': '預覽', en: 'Preview', ja: 'プレビュー' },
    bold: { 'zh-TW': '粗體', en: 'Bold', ja: '太字' },
    italic: { 'zh-TW': '斜體', en: 'Italic', ja: '斜体' },
    underline: { 'zh-TW': '底線', en: 'Underline', ja: '下線' },
    alignLeft: { 'zh-TW': '左對齊', en: 'Align left', ja: '左揃え' },
    alignCenter: { 'zh-TW': '置中', en: 'Center', ja: '中央揃え' },
    alignRight: { 'zh-TW': '右對齊', en: 'Align right', ja: '右揃え' },
    bulletList: { 'zh-TW': '無序清單', en: 'Bulleted list', ja: '箇条書き' },
    orderedList: { 'zh-TW': '有序清單', en: 'Numbered list', ja: '番号付きリスト' },
    divider: { 'zh-TW': '分隔線', en: 'Divider', ja: '区切り線' },
    clearFormat: { 'zh-TW': '清除格式', en: 'Clear formatting', ja: '書式をクリア' },
    autoFormatRule: {
      'zh-TW': '自動排版（規則）',
      en: 'Auto format (rule)',
      ja: '自動整形（ルール）',
    },
    autoFormatAi: {
      'zh-TW': 'AI 自動排版',
      en: 'AI auto format',
      ja: 'AI自動整形',
    },
    link: { 'zh-TW': '連結', en: 'Link', ja: 'リンク' },
    imageUrlPrompt: {
      'zh-TW': '圖片網址：',
      en: 'Image URL:',
      ja: '画像URL：',
    },
    insertImage: { 'zh-TW': '插入圖片', en: 'Insert image', ja: '画像を挿入' },
    insertVariable: {
      'zh-TW': '插入變數：',
      en: 'Insert variable: ',
      ja: '変数を挿入：',
    },
    uploading: { 'zh-TW': '上傳中...', en: 'Uploading...', ja: 'アップロード中...' },
    addAttachment: {
      'zh-TW': '新增附件',
      en: 'Add attachment',
      ja: '添付を追加',
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
