/**
 * Telegram Bot multi-language message pack.
 * Supported: zh (Chinese), en (English), ja (Japanese)
 *
 * Usage:
 *   const lang = await getBotLanguage(telegramUser, userId, supabase)
 *   const m = BOT_MESSAGES[lang]
 *   await sendMessage(chatId, m.help)
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type BotLang = 'zh' | 'en' | 'ja'

// ── Language detection ────────────────────────────────────────────────────────

/**
 * Detect bot language for a user.
 * Priority: users.language → Telegram language_code → fallback zh
 */
export async function getBotLanguage(
  telegramUser: { id: number; language_code?: string } | undefined,
  supabase: SupabaseClient,
): Promise<BotLang> {
  // 1. Check users.language in DB
  if (telegramUser?.id) {
    const { data } = await supabase
      .from('users')
      .select('language')
      .eq('telegram_id', telegramUser.id)
      .maybeSingle()
    if (data?.language) {
      if (data.language === 'japanese') return 'ja'
      if (data.language === 'english') return 'en'
      if (data.language === 'chinese') return 'zh'
    }
  }

  // 2. Telegram language_code
  const code = telegramUser?.language_code ?? ''
  if (code === 'ja') return 'ja'
  if (code.startsWith('en')) return 'en'

  // 3. Fallback
  return 'zh'
}

// ── Message definitions ───────────────────────────────────────────────────────

export interface BotMessages {
  // ── General ────────────────────────────────────────────────────────────────
  processing: string
  retrying: string
  error: string
  unauthorized: string
  adminOnly: string

  // ── /help ──────────────────────────────────────────────────────────────────
  help: string

  // ── Card scan ──────────────────────────────────────────────────────────────
  cardOcring: string
  cardOcrRetry: string
  cardPendingWarning: (count: number) => string
  cardConfirmPrompt: string
  cardSaved: (name: string, extra?: string) => string
  cardCancelled: string
  cardOcrFailed: string
  cardNoName: string

  // ── /search (/s) ───────────────────────────────────────────────────────────
  searchNotFound: (keyword: string) => string
  searchMultiple: string

  // ── /li (LinkedIn) ─────────────────────────────────────────────────────────
  liAnalyzing: string
  liNotLinkedIn: string
  liSaved: (name: string) => string
  liFailed: (msg: string) => string
  liNotFound: string

  // ── /n (note) ──────────────────────────────────────────────────────────────
  noteEnterContact: string
  noteContactNotFound: string
  noteContactFound: (name: string, company: string) => string
  noteContactMultiple: string
  noteEnterContent: (contactName: string | null) => string
  noteEnterContentUnassigned: string
  noteSaved: (contactName: string | null) => string
  noteSavedUnassigned: string

  // ── /v (visit) ─────────────────────────────────────────────────────────────
  visitEnterContact: string
  visitContactNotFound: string
  visitContactFound: (name: string, company: string) => string
  visitContactMultiple: string
  visitEnterDatetime: string
  visitDatetimeInvalid: string
  visitEnterLocation: string
  visitEnterContent: string
  visitSaved: (contactName: string | null) => string
  visitSavedUnassigned: string

  // ── /task ──────────────────────────────────────────────────────────────────
  taskParsing: string
  taskParseFailed: string
  taskSaveFailed: string

  // ── /meet ──────────────────────────────────────────────────────────────────
  meetUsage: string
  meetParsing: string
  meetParseFailed: string
  meetSaveFailed: string
  meetConfirmed: string
  meetCancelled: string

  // ── /members ───────────────────────────────────────────────────────────────
  membersEmpty: string
  membersHeader: (count: number) => string

  // ── /stop ──────────────────────────────────────────────────────────────────
  stopNoSession: string
  stopConfirm: (action: string) => string

  // ── /todos ─────────────────────────────────────────────────────────────────
  todosEmpty: string

  // ── Maintenance ────────────────────────────────────────────────────────────
  maintenanceOn: string
  maintenanceOff: string

  // ── /ai (email draft) ──────────────────────────────────────────────────────
  aiAnalyzing: string
  aiParseFailed: string
  aiNoRecent: string
  aiGenerating: string
  aiGenerateFailed: (msg: string) => string

  // ── Photo ──────────────────────────────────────────────────────────────────
  photoSaved: (name: string, count: string, note: string) => string
  photoFailed: (msg: string) => string

  // ── Callback confirmations ─────────────────────────────────────────────────
  cbCardSaved: string
  cbCardCancelled: string
  cbMeetConfirmed: string
  cbMeetCancelled: string
}

// ── Chinese ───────────────────────────────────────────────────────────────────

const zh: BotMessages = {
  processing: '⏳ 處理中，請稍候...',
  retrying: '⏳ 辨識失敗，3 秒後自動重試...',
  error: '❌ 發生錯誤，請稍後再試。',
  unauthorized: '⛔ 你尚未獲得授權，請聯絡管理員。',
  adminOnly: '⛔ 此指令僅限管理員使用',

  help:
    '🤖 <b>myCRM Bot 指令列表</b>\n\n' +
    '📷 <b>傳送照片</b> — 掃描名片，AI 辨識後存入 CRM\n\n' +
    '/search [關鍵字]　/s — 搜尋聯絡人\n' +
    '/n [姓名]　　　　　　 — 新增筆記\n' +
    '/v [姓名]　　　　　　 — 記錄拜訪\n' +
    '/li　　　　　　　　　 — 傳送 LinkedIn 截圖解析\n' +
    '/ai　　　　　　　　　 — AI 生成拜訪信/感謝函\n' +
    '/task [任務內容]　　 — 新增任務\n' +
    '/meet [會議資訊]　　 — 新增行程\n' +
    '/members　　　　　　 — 查看組織成員\n' +
    '/todos　　　　　　　 — 查看我的任務\n' +
    '/stop　　　　　　　　 — 中止目前操作',

  cardOcring: '⏳ OCR 辨識中，請稍候...',
  cardOcrRetry: '⏳ 辨識失敗，3 秒後自動重試...',
  cardPendingWarning: (count) => `⚠️ 你目前有 ${count} 張名片待確認，請先處理後再傳新的`,
  cardConfirmPrompt: '\n\n請確認是否存檔？',
  cardSaved: (name, extra = '') => `✅ 已成功存檔！${extra}`,
  cardCancelled: '已取消，名片未存檔。',
  cardOcrFailed: '❌ 辨識失敗：無法識別姓名。\n\n照片已保留，已通知管理員查看。\n若需要，管理員可至後台手動建立聯絡人。',
  cardNoName: '❌ 辨識失敗：無法識別姓名。',

  searchNotFound: (kw) => `找不到符合「${kw}」的聯絡人`,
  searchMultiple: '找到多筆聯絡人，請選擇：',

  liAnalyzing: '⏳ AI 解析中，請稍候...',
  liNotLinkedIn: '❌ 無法識別為 LinkedIn 截圖，請確認截圖內容後重新傳送。',
  liSaved: (name) => `✅ 已新增聯絡人：<b>${name}</b>`,
  liFailed: (msg) => `❌ 解析失敗：${msg}`,
  liNotFound: '❌ 找不到解析資料，請重新傳送截圖。',

  noteEnterContact: '請輸入聯絡人姓名或公司關鍵字：',
  noteContactNotFound: '找不到此聯絡人，筆記將存為未歸類，可至網頁手動歸類。\n\n請輸入筆記內容：',
  noteContactFound: (name, company) => `找到：${name}（${company}）\n\n請輸入筆記內容：`,
  noteContactMultiple: '找到多筆聯絡人，請選擇：',
  noteEnterContent: (name) => name ? `請輸入 <b>${name}</b> 的筆記：` : '請輸入筆記內容：',
  noteEnterContentUnassigned: '找不到此聯絡人，請輸入筆記內容（將存為未歸類）：',
  noteSaved: (name) => name ? `✅ 已新增 <b>${name}</b> 的筆記` : '✅ 筆記已儲存',
  noteSavedUnassigned: '✅ 筆記已儲存（未歸類）',

  visitEnterContact: '請輸入聯絡人姓名或公司關鍵字：',
  visitContactNotFound: '找不到此聯絡人，拜訪紀錄將存為未歸類。\n\n請輸入拜訪日期時間（例：2026-03-29 14:00），或輸入「略過」：',
  visitContactFound: (name, company) => `找到：${name}（${company}）\n\n請輸入拜訪日期時間（例：2026-03-29 14:00），或輸入「略過」：`,
  visitContactMultiple: '找到多筆聯絡人，請選擇：',
  visitEnterDatetime: '請輸入拜訪日期時間（例：2026-03-29 14:00），或輸入「略過」：',
  visitDatetimeInvalid: '格式不正確，請輸入 YYYY-MM-DD 或 YYYY-MM-DD HH:MM，或輸入「略過」：',
  visitEnterLocation: '請輸入拜訪地點，或輸入「略過」：',
  visitEnterContent: '請輸入拜訪內容（筆記）：',
  visitSaved: (name) => name ? `✅ 已記錄拜訪：<b>${name}</b>` : '✅ 拜訪已記錄',
  visitSavedUnassigned: '✅ 拜訪已記錄（未歸類）',

  taskParsing: '⏳ AI 解析任務中，請稍候...',
  taskParseFailed: '❌ AI 解析失敗，請重試或換個說法。',
  taskSaveFailed: '❌ 建立任務失敗，請稍後再試。',

  meetUsage: '請提供會議資訊，例如：\n<code>/meet 3/25 下午1點 參訪 九州大學實驗室</code>\n<code>/meet 明天下午3點 和 Luna 開產品會議</code>',
  meetParsing: '⏳ AI 解析中...',
  meetParseFailed: '❌ AI 解析失敗，請確認格式後再試。',
  meetSaveFailed: '❌ 暫存行程失敗，請稍後再試。',
  meetConfirmed: '✅ 行程已建立',
  meetCancelled: '已取消行程建立',

  membersEmpty: '目前沒有成員資料。',
  membersHeader: (count) => `👥 <b>組織成員列表（共 ${count} 人）</b>`,

  stopNoSession: '目前沒有進行中的操作。',
  stopConfirm: (action) => `已中止：${action}`,

  todosEmpty: '✅ 你目前沒有待處理任務！',

  maintenanceOn: '🔧 維護模式已開啟。所有使用者將看到維護中提示。',
  maintenanceOff: '✅ 維護模式已關閉。系統恢復正常。',

  aiAnalyzing: '🤖 AI 分析中...',
  aiParseFailed: '❌ AI 解析失敗，請再試一次',
  aiNoRecent: '找不到最近的聯絡人記錄',
  aiGenerating: '⏳ AI 生成中，請稍候...',
  aiGenerateFailed: (msg) => `❌ AI 生成失敗：${msg}`,

  photoSaved: (name, count, note) => `✅ 合照${count}已存入 <b>${name}</b>${note}`,
  photoFailed: (msg) => `❌ 處理失敗：${msg}`,

  cbCardSaved: '✅ 已成功存檔！',
  cbCardCancelled: '已取消',
  cbMeetConfirmed: '✅ 行程已建立！',
  cbMeetCancelled: '已取消行程',
}

// ── English ───────────────────────────────────────────────────────────────────

const en: BotMessages = {
  processing: '⏳ Processing, please wait...',
  retrying: '⏳ Recognition failed, retrying in 3 seconds...',
  error: '❌ An error occurred. Please try again later.',
  unauthorized: '⛔ You are not authorized. Please contact an admin.',
  adminOnly: '⛔ This command is for admins only',

  help:
    '🤖 <b>myCRM Bot Commands</b>\n\n' +
    '📷 <b>Send a photo</b> — Scan business card, AI extracts info to CRM\n\n' +
    '/search [keyword]　/s — Search contacts\n' +
    '/n [name]　　　　　　　 — Add note\n' +
    '/v [name]　　　　　　　 — Log a visit\n' +
    '/li　　　　　　　　　　　 — Send LinkedIn screenshot to parse\n' +
    '/ai　　　　　　　　　　　 — AI generate follow-up / thank-you email\n' +
    '/task [task]　　　　　　 — Add task\n' +
    '/meet [meeting info]　 — Add schedule\n' +
    '/members　　　　　　　 — View team members\n' +
    '/todos　　　　　　　　　 — View my tasks\n' +
    '/stop　　　　　　　　　　 — Cancel current operation',

  cardOcring: '⏳ Recognizing card, please wait...',
  cardOcrRetry: '⏳ Recognition failed, retrying in 3 seconds...',
  cardPendingWarning: (count) => `⚠️ You have ${count} card(s) pending confirmation. Please handle them first.`,
  cardConfirmPrompt: '\n\nConfirm save?',
  cardSaved: (name, extra = '') => `✅ Saved successfully!${extra}`,
  cardCancelled: 'Cancelled. Card not saved.',
  cardOcrFailed: '❌ Recognition failed: could not identify name.\n\nPhoto retained and admin notified.\nAdmin can create contact manually from the dashboard.',
  cardNoName: '❌ Recognition failed: could not identify name.',

  searchNotFound: (kw) => `No contacts found matching "${kw}"`,
  searchMultiple: 'Multiple contacts found. Please select:',

  liAnalyzing: '⏳ AI analyzing, please wait...',
  liNotLinkedIn: '❌ Could not identify as LinkedIn screenshot. Please check and resend.',
  liSaved: (name) => `✅ Contact added: <b>${name}</b>`,
  liFailed: (msg) => `❌ Parse failed: ${msg}`,
  liNotFound: '❌ Parse data not found. Please resend the screenshot.',

  noteEnterContact: 'Enter a contact name or company keyword:',
  noteContactNotFound: 'Contact not found. Note will be saved as unassigned.\n\nEnter note content:',
  noteContactFound: (name, company) => `Found: ${name} (${company})\n\nEnter note content:`,
  noteContactMultiple: 'Multiple contacts found. Please select:',
  noteEnterContent: (name) => name ? `Enter note for <b>${name}</b>:` : 'Enter note content:',
  noteEnterContentUnassigned: 'Contact not found. Enter note (will be saved as unassigned):',
  noteSaved: (name) => name ? `✅ Note added for <b>${name}</b>` : '✅ Note saved',
  noteSavedUnassigned: '✅ Note saved (unassigned)',

  visitEnterContact: 'Enter a contact name or company keyword:',
  visitContactNotFound: 'Contact not found. Visit will be saved as unassigned.\n\nEnter visit datetime (e.g. 2026-03-29 14:00), or type "skip":',
  visitContactFound: (name, company) => `Found: ${name} (${company})\n\nEnter visit datetime (e.g. 2026-03-29 14:00), or type "skip":`,
  visitContactMultiple: 'Multiple contacts found. Please select:',
  visitEnterDatetime: 'Enter visit datetime (e.g. 2026-03-29 14:00), or type "skip":',
  visitDatetimeInvalid: 'Invalid format. Please enter YYYY-MM-DD or YYYY-MM-DD HH:MM, or type "skip":',
  visitEnterLocation: 'Enter visit location, or type "skip":',
  visitEnterContent: 'Enter visit notes:',
  visitSaved: (name) => name ? `✅ Visit logged: <b>${name}</b>` : '✅ Visit logged',
  visitSavedUnassigned: '✅ Visit logged (unassigned)',

  taskParsing: '⏳ AI parsing task, please wait...',
  taskParseFailed: '❌ AI parse failed. Please retry or rephrase.',
  taskSaveFailed: '❌ Failed to create task. Please try again.',

  meetUsage: 'Please provide meeting info, e.g.:\n<code>/meet 3/25 1pm Visit Kyushu Univ Lab</code>\n<code>/meet tomorrow 3pm Product meeting with Luna</code>',
  meetParsing: '⏳ AI parsing...',
  meetParseFailed: '❌ AI parse failed. Please check format and retry.',
  meetSaveFailed: '❌ Failed to save schedule. Please try again.',
  meetConfirmed: '✅ Schedule created',
  meetCancelled: 'Schedule creation cancelled',

  membersEmpty: 'No member data available.',
  membersHeader: (count) => `👥 <b>Team Members (${count} total)</b>`,

  stopNoSession: 'No active operation to cancel.',
  stopConfirm: (action) => `Cancelled: ${action}`,

  todosEmpty: '✅ You have no pending tasks!',

  maintenanceOn: '🔧 Maintenance mode enabled. All users will see a maintenance notice.',
  maintenanceOff: '✅ Maintenance mode disabled. System is back to normal.',

  aiAnalyzing: '🤖 AI analyzing...',
  aiParseFailed: '❌ AI parse failed. Please try again.',
  aiNoRecent: 'No recent contact records found.',
  aiGenerating: '⏳ AI generating, please wait...',
  aiGenerateFailed: (msg) => `❌ AI generation failed: ${msg}`,

  photoSaved: (name, count, note) => `✅ Photo(s)${count} saved to <b>${name}</b>${note}`,
  photoFailed: (msg) => `❌ Processing failed: ${msg}`,

  cbCardSaved: '✅ Saved successfully!',
  cbCardCancelled: 'Cancelled',
  cbMeetConfirmed: '✅ Schedule created!',
  cbMeetCancelled: 'Schedule cancelled',
}

// ── Japanese ──────────────────────────────────────────────────────────────────

const ja: BotMessages = {
  processing: '⏳ 処理中、少々お待ちください...',
  retrying: '⏳ 認識に失敗しました。3秒後に再試行します...',
  error: '❌ エラーが発生しました。しばらくしてから再試行してください。',
  unauthorized: '⛔ 権限がありません。管理者に連絡してください。',
  adminOnly: '⛔ このコマンドは管理者専用です',

  help:
    '🤖 <b>myCRM Bot コマンド一覧</b>\n\n' +
    '📷 <b>写真を送信</b> — 名刺をスキャン、AI解析してCRMに保存\n\n' +
    '/search [キーワード]　/s — 連絡先を検索\n' +
    '/n [名前]　　　　　　　　 — メモを追加\n' +
    '/v [名前]　　　　　　　　 — 訪問を記録\n' +
    '/li　　　　　　　　　　　　 — LinkedInスクショを解析\n' +
    '/ai　　　　　　　　　　　　 — AI でフォローアップメールを生成\n' +
    '/task [タスク内容]　　　 — タスクを追加\n' +
    '/meet [会議情報]　　　　 — スケジュールを追加\n' +
    '/members　　　　　　　　 — メンバー一覧を表示\n' +
    '/todos　　　　　　　　　　 — 自分のタスクを確認\n' +
    '/stop　　　　　　　　　　　 — 現在の操作をキャンセル',

  cardOcring: '⏳ 名刺を認識中、少々お待ちください...',
  cardOcrRetry: '⏳ 認識に失敗しました。3秒後に再試行します...',
  cardPendingWarning: (count) => `⚠️ 確認待ちの名刺が${count}枚あります。先に処理してください。`,
  cardConfirmPrompt: '\n\n保存しますか？',
  cardSaved: (name, extra = '') => `✅ 保存しました！${extra}`,
  cardCancelled: 'キャンセルしました。名刺は保存されませんでした。',
  cardOcrFailed: '❌ 認識失敗：名前を識別できませんでした。\n\n写真は保存され、管理者に通知しました。\n管理者がダッシュボードで手動作成できます。',
  cardNoName: '❌ 認識失敗：名前を識別できませんでした。',

  searchNotFound: (kw) => `「${kw}」に一致する連絡先が見つかりません`,
  searchMultiple: '複数の連絡先が見つかりました。選択してください：',

  liAnalyzing: '⏳ AI解析中、少々お待ちください...',
  liNotLinkedIn: '❌ LinkedInスクリーンショットとして認識できません。内容を確認して再送してください。',
  liSaved: (name) => `✅ 連絡先を追加しました：<b>${name}</b>`,
  liFailed: (msg) => `❌ 解析失敗：${msg}`,
  liNotFound: '❌ 解析データが見つかりません。スクリーンショットを再送してください。',

  noteEnterContact: '連絡先の名前または会社のキーワードを入力してください：',
  noteContactNotFound: '連絡先が見つかりません。メモは未分類として保存されます。\n\nメモ内容を入力してください：',
  noteContactFound: (name, company) => `見つかりました：${name}（${company}）\n\nメモ内容を入力してください：`,
  noteContactMultiple: '複数の連絡先が見つかりました。選択してください：',
  noteEnterContent: (name) => name ? `<b>${name}</b> へのメモを入力してください：` : 'メモ内容を入力してください：',
  noteEnterContentUnassigned: '連絡先が見つかりません。メモ内容を入力してください（未分類として保存）：',
  noteSaved: (name) => name ? `✅ <b>${name}</b> のメモを追加しました` : '✅ メモを保存しました',
  noteSavedUnassigned: '✅ メモを保存しました（未分類）',

  visitEnterContact: '連絡先の名前または会社のキーワードを入力してください：',
  visitContactNotFound: '連絡先が見つかりません。訪問記録は未分類として保存されます。\n\n訪問日時を入力してください（例：2026-03-29 14:00）、または「スキップ」と入力：',
  visitContactFound: (name, company) => `見つかりました：${name}（${company}）\n\n訪問日時を入力してください（例：2026-03-29 14:00）、または「スキップ」と入力：`,
  visitContactMultiple: '複数の連絡先が見つかりました。選択してください：',
  visitEnterDatetime: '訪問日時を入力してください（例：2026-03-29 14:00）、または「スキップ」と入力：',
  visitDatetimeInvalid: '形式が正しくありません。YYYY-MM-DD または YYYY-MM-DD HH:MM で入力するか、「スキップ」と入力してください：',
  visitEnterLocation: '訪問場所を入力してください、または「スキップ」と入力：',
  visitEnterContent: '訪問内容（メモ）を入力してください：',
  visitSaved: (name) => name ? `✅ 訪問を記録しました：<b>${name}</b>` : '✅ 訪問を記録しました',
  visitSavedUnassigned: '✅ 訪問を記録しました（未分類）',

  taskParsing: '⏳ AIがタスクを解析中、少々お待ちください...',
  taskParseFailed: '❌ AI解析失敗。再試行するか言い換えてください。',
  taskSaveFailed: '❌ タスクの作成に失敗しました。しばらくしてから再試行してください。',

  meetUsage: '会議情報を入力してください。例：\n<code>/meet 3/25 午後1時 九州大学研究室を訪問</code>\n<code>/meet 明日午後3時 Luna と製品会議</code>',
  meetParsing: '⏳ AI解析中...',
  meetParseFailed: '❌ AI解析失敗。フォーマットを確認して再試行してください。',
  meetSaveFailed: '❌ スケジュールの保存に失敗しました。',
  meetConfirmed: '✅ スケジュールを作成しました',
  meetCancelled: 'スケジュール作成をキャンセルしました',

  membersEmpty: 'メンバーデータがありません。',
  membersHeader: (count) => `👥 <b>組織メンバー一覧（計${count}名）</b>`,

  stopNoSession: '進行中の操作はありません。',
  stopConfirm: (action) => `キャンセルしました：${action}`,

  todosEmpty: '✅ 未処理のタスクはありません！',

  maintenanceOn: '🔧 メンテナンスモードを有効にしました。',
  maintenanceOff: '✅ メンテナンスモードを無効にしました。システムは通常運用に戻りました。',

  aiAnalyzing: '🤖 AI分析中...',
  aiParseFailed: '❌ AI解析失敗。もう一度お試しください。',
  aiNoRecent: '最近の連絡先記録が見つかりません。',
  aiGenerating: '⏳ AI生成中、少々お待ちください...',
  aiGenerateFailed: (msg) => `❌ AI生成失敗：${msg}`,

  photoSaved: (name, count, note) => `✅ 写真${count}を <b>${name}</b> に保存しました${note}`,
  photoFailed: (msg) => `❌ 処理失敗：${msg}`,

  cbCardSaved: '✅ 保存しました！',
  cbCardCancelled: 'キャンセルしました',
  cbMeetConfirmed: '✅ スケジュールを作成しました！',
  cbMeetCancelled: 'スケジュールをキャンセルしました',
}

// ── Export ────────────────────────────────────────────────────────────────────

export const BOT_MESSAGES: Record<BotLang, BotMessages> = { zh, en, ja }
