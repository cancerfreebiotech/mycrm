import fs from 'fs';

const additions = {
  common: {
    copy: {
      'zh-TW': '複製',
      en: 'Copy',
      ja: 'コピー',
    },
  },
  contacts: {
    confirmDeletePhoto: {
      'zh-TW': '確定要刪除此照片？',
      en: 'Delete this photo?',
      ja: 'この写真を削除しますか？',
    },
    confirmDeleteCard: {
      'zh-TW': '確定要刪除此名片圖？',
      en: 'Delete this business card image?',
      ja: 'この名刺画像を削除しますか？',
    },
    confirmDeleteLog: {
      'zh-TW': '確定刪除這筆互動紀錄？',
      en: 'Delete this interaction log?',
      ja: 'このやり取り記録を削除しますか？',
    },
    confirmMoveToTrash: {
      'zh-TW': '確定要將「{name}」移至回收區？Super Admin 可在回收區還原或永久刪除。',
      en: 'Move "{name}" to trash? Super Admins can restore or permanently delete from the trash.',
      ja: '「{name}」をゴミ箱へ移動しますか？スーパー管理者はゴミ箱から復元または完全削除できます。',
    },
    unnamedContact: {
      'zh-TW': '此聯絡人',
      en: 'this contact',
      ja: 'この連絡先',
    },
    noName: {
      'zh-TW': '（無姓名）',
      en: '(No name)',
      ja: '（名前なし）',
    },
    rotateFailed: {
      'zh-TW': '旋轉失敗',
      en: 'Rotation failed',
      ja: '回転に失敗しました',
    },
    sendFailed: {
      'zh-TW': '寄送失敗，請稍後再試',
      en: 'Send failed. Please try again later.',
      ja: '送信に失敗しました。後ほど再試行してください。',
    },
    aiGenerateFailed: {
      'zh-TW': 'AI 生成失敗',
      en: 'AI generation failed',
      ja: 'AI生成に失敗しました',
    },
    noMicrosoftAuth: {
      'zh-TW': '找不到 Microsoft 存取權限，請重新登入',
      en: 'Microsoft access not found. Please sign in again.',
      ja: 'Microsoftのアクセス権限が見つかりません。再度サインインしてください。',
    },
    mergeFailed: {
      'zh-TW': '合併失敗',
      en: 'Merge failed',
      ja: '統合に失敗しました',
    },
    deleteFailed: {
      'zh-TW': '刪除失敗',
      en: 'Delete failed',
      ja: '削除に失敗しました',
    },
    emailBounceBadgeTitle: {
      'zh-TW': '此 Email 在黑名單中（hard bounce 或手動加入）',
      en: 'This email is on the blocklist (hard bounce or manual)',
      ja: 'このメールはブロックリストに登録されています（ハードバウンスまたは手動追加）',
    },
    emailUnsubBadgeTitle: {
      'zh-TW': '此 Email 已退訂 Newsletter',
      en: 'This email has unsubscribed from the newsletter',
      ja: 'このメールはニュースレターから退会済みです',
    },
    legacyCardFront: {
      'zh-TW': '正面',
      en: 'Front',
      ja: '表面',
    },
    backSuffix: {
      'zh-TW': '反面',
      en: 'Back',
      ja: '裏面',
    },
    searchTagPlaceholder: {
      'zh-TW': '搜尋 tag...',
      en: 'Search tag...',
      ja: 'タグを検索...',
    },
    rotate90cw: {
      'zh-TW': '順時針旋轉 90°',
      en: 'Rotate 90° clockwise',
      ja: '時計回りに90°回転',
    },
    ocrFillHint: {
      'zh-TW': '以下空白欄位將補上 OCR 識別結果：',
      en: 'The blank fields below will be filled with OCR results:',
      ja: '以下の空欄にOCR認識結果が追加されます：',
    },
    ocrNoFill: {
      'zh-TW': 'OCR 未找到可補充的空白欄位，仍可儲存名片圖',
      en: 'OCR found no blank fields to fill; the business card image can still be saved',
      ja: '補完可能な空欄は見つかりませんでした。名刺画像は保存できます',
    },
    ocrDiffWarn: {
      'zh-TW': '⚠️ 與現有資料不同（確認後存入備註）：',
      en: '⚠️ Differs from existing data (saved to notes after confirmation):',
      ja: '⚠️ 既存データと異なります（確認後メモに保存）：',
    },
    groupPhoto: {
      'zh-TW': '合照',
      en: 'Group Photo',
      ja: '集合写真',
    },
    photoNotePlaceholder: {
      'zh-TW': '附註...',
      en: 'Note...',
      ja: 'メモ...',
    },
    clickToAddNote: {
      'zh-TW': '點擊加入附註',
      en: 'Click to add a note',
      ja: 'クリックしてメモを追加',
    },
    addNote: {
      'zh-TW': '+ 附註',
      en: '+ Note',
      ja: '+ メモ',
    },
    uploading: {
      'zh-TW': '上傳中...',
      en: 'Uploading...',
      ja: 'アップロード中...',
    },
    addGroupPhoto: {
      'zh-TW': '新增合照',
      en: 'Add Group Photo',
      ja: '集合写真を追加',
    },
    emailStatusBouncedDesc: {
      'zh-TW': '此 Email 曾退信，群發郵件不會選到此人。',
      en: 'This email has bounced. Bulk mailings will skip this contact.',
      ja: 'このメールはバウンス歴があります。一括送信では除外されます。',
    },
    emailStatusUnsubscribedDesc: {
      'zh-TW': '此聯絡人已退訂，電子報不會發送。',
      en: 'This contact has unsubscribed. Newsletter will not be sent.',
      ja: 'この連絡先は退会済みのため、ニュースレターは送信されません。',
    },
    emailStatusInvalidDesc: {
      'zh-TW': '此 Email 格式或網域有誤，無法寄送。',
      en: 'This email format or domain is invalid. Cannot send.',
      ja: 'このメールアドレスの形式またはドメインが無効です。送信できません。',
    },
    collapse: {
      'zh-TW': '收起',
      en: 'Collapse',
      ja: '折りたたむ',
    },
    expand: {
      'zh-TW': '展開',
      en: 'Expand',
      ja: '展開',
    },
    meetingDateShort: {
      'zh-TW': '日期',
      en: 'Date',
      ja: '日付',
    },
    subject: {
      'zh-TW': '主旨',
      en: 'Subject',
      ja: '件名',
    },
    content: {
      'zh-TW': '內容',
      en: 'Content',
      ja: '内容',
    },
    zoomIn: {
      'zh-TW': '放大',
      en: 'Zoom in',
      ja: '拡大',
    },
    zoomOut: {
      'zh-TW': '縮小',
      en: 'Zoom out',
      ja: '縮小',
    },
    zoomReset: {
      'zh-TW': '重置',
      en: 'Reset',
      ja: 'リセット',
    },
    close: {
      'zh-TW': '關閉',
      en: 'Close',
      ja: '閉じる',
    },
    cardLargeAlt: {
      'zh-TW': '名片大圖',
      en: 'Business card (large)',
      ja: '名刺（大）',
    },
    metAtPlaceholder: {
      'zh-TW': 'e.g. 台北生技展 2026',
      en: 'e.g. BioTech Expo 2026',
      ja: '例：BioTech Expo 2026',
    },
    referredByPlaceholder: {
      'zh-TW': 'e.g. 王小明',
      en: 'e.g. John Doe',
      ja: '例：山田太郎',
    },
    mergeKeepLabel: {
      'zh-TW': '✅ 保留',
      en: '✅ Keep',
      ja: '✅ 保持',
    },
    mergeDeleteLabel: {
      'zh-TW': '🗑 刪除',
      en: '🗑 Delete',
      ja: '🗑 削除',
    },
    mergeRule1: {
      'zh-TW': '• 保留聯絡人的欄位優先，右側空白欄位才補入',
      en: "• Keep contact's fields take priority; blanks are filled from the other",
      ja: '• 保持する連絡先のフィールドを優先し、空欄のみ相手から補完',
    },
    mergeRule2: {
      'zh-TW': '• 名片、互動紀錄、Tag 全部合併到保留聯絡人',
      en: '• Business cards, logs, and tags all merge into the kept contact',
      ja: '• 名刺、やり取り記録、タグはすべて保持する連絡先に統合',
    },
    mergeRule3: {
      'zh-TW': '• 來源聯絡人刪除後無法復原',
      en: '• The source contact cannot be recovered after deletion',
      ja: '• 統合元の連絡先は削除後に復元できません',
    },
  },
  mail: {
    recipientHint: {
      'zh-TW': '（打名字或 email 搜尋聯絡人，或直接輸入 email 後按 Enter）',
      en: '(type a name or email to search contacts, or enter an email and press Enter)',
      ja: '（名前またはメールで連絡先を検索、あるいはメールを入力してEnter）',
    },
    searchContactPlaceholder: {
      'zh-TW': '搜尋聯絡人或輸入 email…',
      en: 'Search contact or type email…',
      ja: '連絡先を検索またはメールを入力…',
    },
    ccHint: {
      'zh-TW': '（副本）',
      en: '(CC)',
      ja: '（CC）',
    },
    bccHint: {
      'zh-TW': '（密件副本）',
      en: '(BCC)',
      ja: '（BCC）',
    },
    searchOrEmailPlaceholder: {
      'zh-TW': '搜尋或輸入 email…',
      en: 'Search or type email…',
      ja: '検索またはメールを入力…',
    },
    templateAttachments: {
      'zh-TW': '範本附件',
      en: 'Template attachments',
      ja: 'テンプレート添付',
    },
    aiGeneratedBody: {
      'zh-TW': 'AI 生成信件內文',
      en: 'AI-generated email body',
      ja: 'AI生成メール本文',
    },
    aiPromptPlaceholder: {
      'zh-TW': '描述信件目的（如：感謝上次會面，介紹新產品）',
      en: 'Describe the email purpose (e.g., thank you for the meeting, introduce a new product)',
      ja: 'メールの目的を記述（例：先日の打ち合わせへのお礼、新製品の紹介）',
    },
    extraAttachments: {
      'zh-TW': '額外附件（最大 5MB）',
      en: 'Extra attachments (max 5MB)',
      ja: '追加添付（最大5MB）',
    },
    searchContactsPlaceholder: {
      'zh-TW': '搜尋姓名、公司、Email...',
      en: 'Search name, company, email...',
      ja: '名前・会社・メールを検索...',
    },
    noContactFound: {
      'zh-TW': '找不到符合的聯絡人',
      en: 'No matching contact',
      ja: '一致する連絡先が見つかりません',
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
  console.log(`${locale}: added ${added}, skipped ${skipped} (already exist)`);
}
