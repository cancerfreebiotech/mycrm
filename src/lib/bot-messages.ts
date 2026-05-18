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
  unknownError: string
  tgBusy: string
  tgSendFailed: string
  maintenanceUserBlocked: string
  defaultPrompt: string
  aiModelDefault: string
  aiModelInfo: (displayName: string, modelId: string, endpoint: string) => string
  cbProcessing: string
  cbOpFailed: string
  cbCancelled: string
  processingFailed: (msg: string) => string

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
  cardThisContact: string
  cardFieldLabel: (key: string) => string
  cardEmptyValue: string
  cardOcrResultHeader: string
  cardFieldLine: (icon: string, label: string, value: string) => string
  cardResultName: string
  cardResultCompany: string
  cardResultJobTitle: string
  cardResultEmail: string
  cardResultPhone: string
  cardResultCountry: string
  cardDiffHeader: (displayName: string) => string
  cardDiffFillHeader: string
  cardDiffConflictHeader: string
  cardDiffFillRow: (label: string, value: string) => string
  cardDiffConflictRow: (label: string, newVal: string, oldVal: string) => string
  cardDiffNoChange: string
  cardDiffSessionMissing: string
  cardDiffAppliedSummary: (filled: number, conflicts: number) => string
  cardDiffNoFillSummary: string
  cardDiffSkippedSummary: string
  cardSavedWithApply: (displayName: string, applyMsg: string) => string
  cardDupEmailExists: (name: string, company: string) => string
  cardDupSimilar: (name: string, company: string) => string
  cardDupBouncedHint: (email: string, status: string) => string
  cardSavedWithLink: (link: string) => string
  cardViewContactLink: string
  cardReceivedAskAdd: (contactName: string) => string
  batchReceivedNth: (n: number) => string
  batchUploadFailed: (msg: string) => string
  batchPendingFallback: string
  newsPhotoAdded: (count: number) => string
  newsPhotoFailed: (msg: string) => string
  photoCountReceived: (count: number, displayName: string) => string
  photoDoneLabel: (count: number) => string
  photoNoteAsk: (countText: string) => string
  photoNoteAskSingle: string
  photoUploading: string
  photoMissing: string
  photoNoteAttached: string

  // ── /search (/s) ───────────────────────────────────────────────────────────
  searchNotFound: (keyword: string) => string
  searchMultiple: string
  searchNotFoundTry: string

  // ── /a add card flow ───────────────────────────────────────────────────────
  addCardLastContact: (name: string, company: string) => string
  addCardNoLast: string
  addCardNotFound: (name: string) => string
  addCardCreateLabel: (name: string, company: string) => string
  addCardFoundOne: (name: string) => string
  addCardMultipleSelect: string
  addCardCreateFailedPrompt: string
  addCardCreateFailed: (msg: string) => string
  addCardContactCreated: (displayLine: string, link: string) => string
  addCardSkipped: (displayName: string, link: string) => string

  // ── /p personal photo flow ─────────────────────────────────────────────────
  personPhotoLastContact: (name: string, company: string) => string
  personPhotoNoLast: string
  personPhotoNotFound: (name: string) => string
  personPhotoFoundOne: (name: string) => string
  personPhotoMultipleSelect: string
  personPhotoCreateFailedPrompt: string
  personPhotoContactCreated: (displayLine: string, link: string) => string

  // ── /li (LinkedIn) ─────────────────────────────────────────────────────────
  liAnalyzing: string
  liNotLinkedIn: string
  liSaved: (name: string) => string
  liFailed: (msg: string) => string
  liNotFound: string
  liPrompt: string
  liResultHeader: string
  liUnnamed: string
  liInsertFailed: (msg: string) => string
  liSavedWithLink: (name: string, link: string) => string

  // ── /n (note) ──────────────────────────────────────────────────────────────
  noteEnterContact: string
  noteContactNotFound: string
  noteContactFound: (name: string, company: string) => string
  noteContactMultiple: string
  noteEnterContent: (contactName: string | null) => string
  noteEnterContentUnassigned: string
  noteSaved: (contactName: string | null) => string
  noteSavedUnassigned: string
  noteLastContactAsk: (name: string, company: string) => string
  noteFoundOnePlain: (name: string) => string
  noteFoundContactSelect: string
  noteSavedWithDetail: (contactName: string | null, isMeeting: boolean, detail: string) => string
  noteSavedForContact: (name: string) => string

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
  visitLastContactAsk: (name: string, company: string) => string
  visitAfterContactPick: (name: string) => string
  visitSavedDetailed: (contactName: string | null, detail: string) => string

  // ── /task ──────────────────────────────────────────────────────────────────
  taskParsing: string
  taskParseFailed: string
  taskSaveFailed: string
  taskContactLine: (name: string, company: string) => string
  taskSelfReminderLabel: string
  taskAssignedNotice: (
    title: string,
    contactLine: string,
    dueLine: string,
    assignerName: string,
  ) => string
  taskCreatedSelf: (title: string, contactLine: string, dueLine: string) => string
  taskCreatedAssigned: (
    assignees: string,
    title: string,
    contactLine: string,
    dueLine: string,
  ) => string
  taskDueLabel: (datetime: string) => string
  taskDueNone: string
  taskRoleCreated: string
  taskRoleAssigned: string
  taskBtnMarkDone: string
  taskBtnManage: string
  taskBtnDone: string
  taskBtnPostpone: string
  taskBtnCancel: string
  taskDoneNotice: (title: string) => string
  taskDoneCallback: string
  taskCancelCallback: string
  taskCancelledNotice: (title: string) => string
  taskDoneTeamsNotify: (title: string, completedBy: string) => string
  taskPostponePrompt: string
  taskPostponeFormatBad: string
  taskPostponed: (datetime: string) => string
  taskNoTitle: string

  // ── /meet ──────────────────────────────────────────────────────────────────
  meetUsage: string
  meetParsing: string
  meetParseFailed: string
  meetSaveFailed: string
  meetConfirmed: string
  meetCancelled: string
  meetConfirmHeader: string
  meetFieldTitle: string
  meetFieldTime: string
  meetFieldDuration: string
  meetFieldAttendees: string
  meetFieldLocation: string
  meetSelfLabel: string
  meetConfirmFooter: string
  meetDurationLabel: (minutes: number) => string
  meetTimeRange: (startEnd: string) => string
  meetCreatedDetail: (title: string, timeLabel: string, link: string) => string
  meetExpired: string
  meetCreateFailedCb: string
  meetCreateFailedDetail: (msg: string) => string
  meetTimezoneLabel: string
  meetTryAgainLater: string
  meetOpenInOutlook: string

  // ── /met ───────────────────────────────────────────────────────────────────
  metContactsHeader: (count: number) => string
  metFieldOccasion: string
  metFieldDate: string
  metFieldReferrer: string
  metOccasionUnspecified: string
  metContactNotFound: string
  metAppliedTo: (count: number) => string
  metApplyFailed: (msg: string) => string
  metApplyMissing: string
  metLogContent: (occasion: string, date: string, referrer: string) => string
  metCbApplying: string

  // ── /members ───────────────────────────────────────────────────────────────
  membersEmpty: string
  membersHeader: (count: number) => string

  // ── /stop ──────────────────────────────────────────────────────────────────
  stopNoSession: string
  stopConfirm: (action: string) => string

  // ── /todos ─────────────────────────────────────────────────────────────────
  todosEmpty: string

  // ── /lang ──────────────────────────────────────────────────────────────────
  langChanged: (lang: string) => string
  langInvalid: string

  // ── Maintenance ────────────────────────────────────────────────────────────
  maintenanceOn: string
  maintenanceOff: string

  // ── /ai (email draft) ──────────────────────────────────────────────────────
  aiAnalyzing: string
  aiParseFailed: string
  aiNoRecent: string
  aiGenerating: string
  aiGenerateFailed: (msg: string) => string

  // ── Email flow ─────────────────────────────────────────────────────────────
  emailEnterContactQuery: string
  emailEnterContactNameOrCompany: string
  emailLastContactAsk: (name: string, company: string) => string
  emailRecipientPrompt: (name: string, email: string) => string
  emailRecipientPromptShort: (name: string, email: string) => string
  emailEmptyEmailLabel: string
  emailMethodList: string
  emailBtnTemplate: string
  emailBtnAI: string
  emailNoTemplates: string
  emailNoTemplatesPick: string
  emailPickTemplate: string
  emailDescribePurpose: string
  emailTemplateChosen: (title: string) => string
  emailSupplementAsk: string
  emailPreview: (subject: string, preview: string, truncated: boolean) => string
  emailSubjectPrefix: string
  emailSubjectNone: string
  emailBtnConfirmSend: string
  emailSending: string
  emailSentCb: string
  emailSentDetail: (subject: string) => string
  emailSendFailed: (msg: string) => string
  emailSessionMissing: string
  emailNoEmailAddr: string
  emailNoEmailAddrCb: string
  emailCancelled: string
  emailCancelledCb: string

  // ── Interaction logs ───────────────────────────────────────────────────────
  logsNone: (name: string) => string
  logsHeader: (name: string, fromIdx: number, toIdx: number) => string
  logsBtnLoadMore: string
  logTypeNote: string
  logTypeMeeting: string
  logTypeEmail: string
  logTypeSystem: string

  // ── Common buttons ─────────────────────────────────────────────────────────
  btnConfirm: string
  btnCancel: string
  btnConfirmCreate: string
  btnConfirmSave: string
  btnSaveNewAnyway: string
  btnNotSave: string
  btnMergeInto: (name: string) => string
  btnReplaceJob: (name: string) => string
  btnUpdateEmail: (name: string) => string
  btnSkipNoCard: string
  btnSkipDirectSave: string
  btnSkipNoNeed: string
  btnConfirmApply: string
  btnSaveCardOnly: string
  btnConfirmAdd: string
  btnYesThatOne: string
  btnSearchOther: string
  btnConfirmSend: string

  // ── Merge into existing ────────────────────────────────────────────────────
  mergeNoTargetCb: string
  mergeNoTarget: string
  mergeFailedFallback: string
  mergeFilled: (n: number) => string
  mergeReplaced: (n: number) => string
  mergeConflicts: (n: number) => string
  mergeCardAdded: string
  mergeViewLink: (name: string) => string
  mergeResult: (verb: string, name: string, summary: string, link: string) => string
  mergeVerbUpdated: string
  mergeVerbAddedTo: string

  // ── Newsletter (/news) ─────────────────────────────────────────────────────
  newsNoPermission: string
  newsPromptSection: (period: string) => string
  newsBtnLastMonth: string
  newsBtnNextMonth: string
  newsSectionLastLabel: string
  newsSectionNextLabel: string
  newsStoryTitlePrompt: (period: string, secLabel: string) => string
  newsTitleLengthError: string
  newsDatePrompt: string
  newsDateBad: string
  newsCreateFailed: (msg: string) => string
  newsStoryCreated: (title: string, eventDate: string) => string
  newsTextAdded: (added: number, total: number) => string
  newsDoneSummary: (period: string, secLabel: string, title: string, eventDateLine: string, charCount: number, photoCount: number, link: string) => string
  newsExited: string
  newsNoPermissionCb: string

  // ── Batch (/b /done /cancel) ───────────────────────────────────────────────
  batchParsingMet: string
  batchMetParseFailed: string
  batchEntered: (metInfo: string, link: string) => string
  batchMetInfo: (parts: string) => string
  batchMetIntro: string
  batchNotInMode: string
  batchEmptyDone: string
  batchDoneAck: (count: number) => string
  batchCancelled: string
  cancelGeneric: string
  cancelMaintenanceLabel: (action: string) => string

  // ── Misc errors and ack callbacks ──────────────────────────────────────────
  callbackOpFailed: string
  recipientNoEmail: string
  pendingPhotoMissing: string
  contactNotFoundGeneric: string
  insertFailedFallback: string

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
    '/b [描述]　　　　　　 — 批次模式（可選帶「在哪裡遇見」）\n' +
    '/done　　　　　　　　 — 結束批次模式並回傳總結\n' +
    '/cancel　　　　　　　 — 取消批次模式\n\n' +
    '/search [關鍵字]　/s — 搜尋聯絡人\n' +
    '/n [姓名]　　　　　　 — 新增筆記\n' +
    '/v [姓名]　　　　　　 — 記錄拜訪\n' +
    '/a [姓名] 或 /a 姓名 | 公司 — 為聯絡人新增名片（找不到可建立新聯絡人）\n' +
    '/p [姓名] 或 /p 姓名 | 公司 — 為聯絡人新增合照（找不到可建立新聯絡人）\n' +
    '/li　　　　　　　　　 — 傳送 LinkedIn 截圖解析\n' +
    '/ai　　　　　　　　　 — AI 生成拜訪信/感謝函\n' +
    '/news　　　　　　　　 — 累積電子報素材（需 newsletter 權限）\n' +
    '/task [任務內容]　　 — 新增任務\n' +
    '/meet [會議資訊]　　 — 新增行程\n' +
    '/members　　　　　　 — 查看組織成員\n' +
    '/todos　　　　　　　 — 查看我的任務\n' +
    '/lang [zh|en|ja]　　 — 切換 Bot 語言\n' +
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

  langChanged: (lang) => `✅ 語言已切換為：${lang}`,
  langInvalid: '❌ 無效語言。請使用：/lang zh、/lang en 或 /lang ja',

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

  // ── General extras ─────────────────────────────────────────────────────────
  unknownError: '未知錯誤',
  tgBusy: '⏳ Telegram 暫時繁忙，3 秒後自動重試...',
  tgSendFailed: '❌ 傳送失敗，請稍後再試。',
  maintenanceUserBlocked: '🔧 系統維護中，請稍後再試。',
  defaultPrompt: '請傳送名片照片（或 /cancel 取消），或輸入 /help（/h）查看可用指令。',
  aiModelDefault: '🤖 目前使用預設模型：<b>gemini-2.5-flash</b>',
  aiModelInfo: (displayName, modelId, endpoint) =>
    `🤖 目前使用的 AI 模型：\n\n<b>${displayName}</b>\n模型 ID：<code>${modelId}</code>${endpoint ? `\n端點：${endpoint}` : ''}`,
  cbProcessing: '處理中...',
  cbOpFailed: '❌ 操作失敗',
  cbCancelled: '已取消',
  processingFailed: (msg) => `❌ 處理失敗：${msg}`,

  // ── Card scan extras ───────────────────────────────────────────────────────
  cardThisContact: '此聯絡人',
  cardFieldLabel: (key) => ({
    name: '姓名', name_en: '英文姓名', name_local: '日文姓名',
    company: '公司', job_title: '職稱',
    email: 'Email', phone: '電話', second_phone: '第二電話',
    address: '地址', website: '網站',
  } as Record<string, string>)[key] ?? key,
  cardEmptyValue: '—',
  cardOcrResultHeader: '📇 辨識結果：\n\n',
  cardFieldLine: (icon, label, value) => `${icon} ${label}：${value}\n`,
  cardResultName: '姓名',
  cardResultCompany: '公司',
  cardResultJobTitle: '職稱',
  cardResultEmail: 'Email',
  cardResultPhone: '電話',
  cardResultCountry: '國家',
  cardDiffHeader: (displayName) => `📇 <b>${displayName}</b> 名片 OCR 結果：\n\n`,
  cardDiffFillHeader: '✅ <b>填入空白欄位：</b>\n',
  cardDiffConflictHeader: '⚠️ <b>與現有不同（存入備註）：</b>\n',
  cardDiffFillRow: (label, value) => `• ${label}：${value}\n`,
  cardDiffConflictRow: (label, newVal, oldVal) => `• ${label}：${newVal}（現有：${oldVal}）\n`,
  cardDiffNoChange: '資料與現有記錄相同，名片將直接存入。\n',
  cardDiffSessionMissing: '❌ 找不到待處理名片資料，請重新傳送。',
  cardDiffAppliedSummary: (filled, conflicts) =>
    filled > 0
      ? `已填入 ${filled} 個欄位${conflicts > 0 ? `，${conflicts} 項衝突存入備註` : ''}`
      : '資料已是最新',
  cardDiffNoFillSummary: '資料已是最新',
  cardDiffSkippedSummary: '名片已存入，聯絡人資料未變更',
  cardSavedWithApply: (displayName, applyMsg) => `✅ <b>${displayName}</b> 名片已儲存。${applyMsg}`,
  cardDupEmailExists: (name, company) => `\n⚠️ 此 email 已有聯絡人：${name}（${company}），是否仍要新增？`,
  cardDupSimilar: (name, company) => `\n🔍 系統有相似聯絡人：${name}（${company}），請確認是否為同一人`,
  cardDupBouncedHint: (email, status) => `\n🔧 既有聯絡人 email (${email}) 狀態為 ${status}，建議「換工作」用新 email 覆蓋`,
  cardSavedWithLink: (link) => `✅ 已成功存檔！${link}`,
  cardViewContactLink: '查看聯絡人頁面',
  cardReceivedAskAdd: (contactName) => `收到照片！要新增為 <b>${contactName}</b> 的名片嗎？`,
  batchReceivedNth: (n) => `📥 已收第 ${n} 張，背景辨識中。繼續傳送或打 /done 結束。`,
  batchUploadFailed: (msg) => `❌ 收下失敗：${msg}`,
  batchPendingFallback: '暫存失敗',
  newsPhotoAdded: (count) => `📷 照片已加入（累計 ${count} 張）。繼續貼，或 <code>/done</code> 結束`,
  newsPhotoFailed: (msg) => `❌ 照片上傳失敗：${msg}`,
  photoCountReceived: (count, displayName) => `📷 已收到 <b>${count}</b> 張（${displayName}）\n繼續傳送，或按「完成」`,
  photoDoneLabel: (count) => `✅ 完成（${count} 張）`,
  photoNoteAsk: (countText) => `📝 要幫這 ${countText}照片加共同附註嗎？直接回覆文字，或按「跳過」`,
  photoNoteAskSingle: '📝 要加附註嗎？直接回覆文字會存入互動紀錄。',
  photoUploading: '⏳ 上傳中...',
  photoMissing: '❌ 找不到待處理照片，請重新傳送。',
  photoNoteAttached: '，附註已存入互動紀錄',

  // ── Search extras ──────────────────────────────────────────────────────────
  searchNotFoundTry: '找不到符合的聯絡人，請再試一次：',

  // ── /a add card flow ───────────────────────────────────────────────────────
  addCardLastContact: (name, company) => `上一位聯絡人：<b>${name}</b>（${company}）\n\n請傳送名片照片（或 /cancel 取消）`,
  addCardNoLast: '找不到上一位聯絡人，請先掃描名片或用 <code>/a 姓名</code> 指定。',
  addCardNotFound: (name) => `找不到聯絡人「${name}」，要建立新聯絡人嗎？`,
  addCardCreateLabel: (name, company) => company ? `✅ 建立「${name} · ${company}」` : `✅ 建立「${name}」`,
  addCardFoundOne: (name) => `找到：${name}\n\n請傳送名片照片（或 /cancel 取消）`,
  addCardMultipleSelect: '找到多筆聯絡人，請選擇要新增名片的對象：',
  addCardCreateFailedPrompt: '❌ 建立失敗，請重新輸入 /a 姓名',
  addCardCreateFailed: (msg) => `❌ 建立失敗：${msg}`,
  addCardContactCreated: (displayLine, link) => `✅ 已建立聯絡人：${displayLine}${link}\n\n請傳送名片照片（或 /cancel 取消）`,
  addCardSkipped: (displayName, link) => `✅ 已跳過名片，${displayName} 已建立${link}`,

  // ── /p personal photo flow ─────────────────────────────────────────────────
  personPhotoLastContact: (name, company) => `上一位聯絡人：<b>${name}</b>（${company}）\n\n請傳送合照（或 /cancel 取消）\n\n💡 長按照片 → <b>以檔案傳送</b>，可保留拍攝時間和 GPS 地點`,
  personPhotoNoLast: '找不到上一位聯絡人，請先掃描名片或用 <code>/p 姓名</code> 指定。',
  personPhotoNotFound: (name) => `找不到聯絡人「${name}」，要建立新聯絡人嗎？`,
  personPhotoFoundOne: (name) => `找到：${name}\n\n請傳送合照（或 /cancel 取消）\n\n💡 長按照片 → <b>以檔案傳送</b>，可保留拍攝時間和 GPS 地點`,
  personPhotoMultipleSelect: '找到多筆聯絡人，請選擇：',
  personPhotoCreateFailedPrompt: '❌ 建立失敗,請重新輸入 /p 姓名',
  personPhotoContactCreated: (displayLine, link) => `✅ 已建立聯絡人：${displayLine}${link}\n\n請傳送合照（或 /cancel 取消）\n\n💡 長按照片 → <b>以檔案傳送</b>，可保留拍攝時間和 GPS 地點`,

  // ── LinkedIn extras ────────────────────────────────────────────────────────
  liPrompt: '📸 請傳送 LinkedIn 個人頁截圖，AI 將自動解析聯絡人資料（或 /cancel 取消）。',
  liResultHeader: '🔗 <b>LinkedIn 解析結果</b>\n\n',
  liUnnamed: '（無姓名）',
  liInsertFailed: (msg) => `❌ 新增失敗：${msg}`,
  liSavedWithLink: (name, link) => `✅ 已新增聯絡人：<b>${name}</b>${link}`,

  // ── /n note extras ─────────────────────────────────────────────────────────
  noteLastContactAsk: (name, company) => `要針對上一位聯絡人嗎？\n👤 ${name}（${company}）`,
  noteFoundOnePlain: (name) => `找到：${name}\n\n請輸入筆記內容：`,
  noteFoundContactSelect: '找到多筆聯絡人，請選擇：',
  noteSavedWithDetail: (contactName, isMeeting, detail) =>
    contactName
      ? `✅ 已儲存${isMeeting ? '拜訪紀錄' : '筆記'}（${contactName}）${detail}`
      : `✅ 已儲存為未歸類${isMeeting ? '拜訪紀錄' : '筆記'}${detail}`,
  noteSavedForContact: (name) => `✅ 已儲存筆記（${name}）`,

  // ── /v visit extras ────────────────────────────────────────────────────────
  visitLastContactAsk: (name, company) => `要為上一位聯絡人新增拜訪紀錄嗎？\n👤 ${name}（${company}）`,
  visitAfterContactPick: (name) => `聯絡人：${name}\n\n請輸入拜訪日期時間（例：2026-03-29 14:00），或輸入「略過」：`,
  visitSavedDetailed: (contactName, detail) =>
    contactName ? `✅ 已儲存拜訪紀錄（${contactName}）${detail}` : `✅ 已儲存為未歸類拜訪紀錄${detail}`,

  // ── /task extras ───────────────────────────────────────────────────────────
  taskContactLine: (name, company) => `🔗 聯絡人：${name}${company ? `（${company}）` : ''}\n`,
  taskSelfReminderLabel: '自己',
  taskAssignedNotice: (title, contactLine, dueLine, assignerName) =>
    `📋 <b>新任務指派給你</b>\n\n📌 ${title}\n${contactLine}${dueLine}\n由 ${assignerName} 指派。`,
  taskCreatedSelf: (title, contactLine, dueLine) =>
    `✅ 任務已建立（自我提醒）\n\n📌 ${title}\n${contactLine}${dueLine}`,
  taskCreatedAssigned: (assignees, title, contactLine, dueLine) =>
    `✅ 任務已建立 → ${assignees}\n\n📌 ${title}\n${contactLine}${dueLine}`,
  taskDueLabel: (datetime) => `⏰ 截止:${datetime}`,
  taskDueNone: '⏰ 無截止時間',
  taskRoleCreated: '（我建立）',
  taskRoleAssigned: '（指派給我）',
  taskBtnMarkDone: '✅ 標記完成',
  taskBtnManage: '📋 任務管理',
  taskBtnDone: '✅ 完成',
  taskBtnPostpone: '⏭ 延後',
  taskBtnCancel: '❌ 取消',
  taskDoneNotice: (title) => `✅ 任務已完成：${title}`,
  taskDoneCallback: '✅ 已完成',
  taskCancelCallback: '已取消任務',
  taskCancelledNotice: (title) => `❌ 任務已取消：${title}`,
  taskDoneTeamsNotify: (title, completedBy) => `✅ 任務已完成：${title}\n由 ${completedBy} 標記完成`,
  taskPostponePrompt: '請輸入新的截止時間（例：2026-03-20 15:00）：',
  taskPostponeFormatBad: '無法解析日期，請輸入格式如：2026-03-20 15:00 或 tomorrow 3pm',
  taskPostponed: (datetime) => `✅ 已延後任務截止時間至 ${datetime}`,
  taskNoTitle: '',

  // ── /meet extras ───────────────────────────────────────────────────────────
  meetConfirmHeader: '📅 <b>確認建立行程</b>\n\n',
  meetFieldTitle: '標題',
  meetFieldTime: '時間',
  meetFieldDuration: '時長',
  meetFieldAttendees: '參與者',
  meetFieldLocation: '地點',
  meetSelfLabel: '你',
  meetConfirmFooter: '\n請確認後按下方按鈕。',
  meetDurationLabel: (minutes) => {
    if (minutes === 30) return '30 分鐘'
    if (minutes === 60) return '1 小時'
    if (minutes === 90) return '1.5 小時'
    return '2 小時'
  },
  meetTimeRange: (startEnd) => `${startEnd}（台北）`,
  meetCreatedDetail: (title, timeLabel, link) => `✅ <b>行程已建立！</b>\n\n📅 ${title}\n🕐 ${timeLabel}${link}`,
  meetExpired: '已過期或不存在',
  meetCreateFailedCb: '❌ 建立失敗',
  meetCreateFailedDetail: (msg) => `❌ 建立行程失敗：${msg}`,
  meetTimezoneLabel: '（台北）',
  meetTryAgainLater: '請稍後再試',
  meetOpenInOutlook: '在 Outlook 開啟',

  // ── /met ───────────────────────────────────────────────────────────────────
  metContactsHeader: (count) => `📍 準備套用到最近 ${count} 位聯絡人：\n\n`,
  metFieldOccasion: '場合',
  metFieldDate: '日期',
  metFieldReferrer: '介紹人',
  metOccasionUnspecified: '（未指定）',
  metContactNotFound: '找不到最近的聯絡人記錄',
  metAppliedTo: (count) => `✅ 已套用至 ${count} 位聯絡人`,
  metApplyFailed: (msg) => `❌ 套用失敗：${msg}`,
  metApplyMissing: '找不到待套用資料',
  metLogContent: (occasion, date, referrer) => `認識於：${occasion}（${date}）${referrer ? `，介紹人：${referrer}` : ''}`,
  metCbApplying: '套用中...',

  // ── Email flow ─────────────────────────────────────────────────────────────
  emailEnterContactQuery: '請輸入聯絡人姓名或公司關鍵字：',
  emailEnterContactNameOrCompany: '請輸入聯絡人姓名或 Email：',
  emailLastContactAsk: (name, company) => `要針對上一位聯絡人嗎？\n👤 ${name}（${company}）`,
  emailRecipientPrompt: (name, email) =>
    `收件人：<b>${name}</b>（${email}）\n\n請選擇發信方式：\n1. 使用 Email Template\n2. 直接描述，AI 幫你生成`,
  emailRecipientPromptShort: (name, email) => `收件人：<b>${name}</b>（${email}）\n\n請選擇發信方式：`,
  emailEmptyEmailLabel: '無 email',
  emailMethodList: '\n1. 使用 Email Template\n2. 直接描述，AI 幫你生成',
  emailBtnTemplate: '1️⃣ 使用 Template',
  emailBtnAI: '2️⃣ AI 生成',
  emailNoTemplates: '目前沒有郵件範本，請先至網頁新增。',
  emailNoTemplatesPick: '目前無可用範本',
  emailPickTemplate: '請選擇郵件範本：',
  emailDescribePurpose: '請描述這封信的目的：',
  emailTemplateChosen: (title) => `已選擇範本：<b>${title}</b>\n\n有要補充的內容嗎？（直接傳送請回覆 <code>skip</code>）`,
  emailSupplementAsk: '有要補充的內容嗎？（直接傳送請回覆 <code>skip</code>）',
  emailPreview: (subject, preview, truncated) => `📧 郵件預覽\n\n主旨：${subject}\n\n${preview}${truncated ? '...' : ''}`,
  emailSubjectPrefix: '關於：',
  emailSubjectNone: '（無主旨）',
  emailBtnConfirmSend: '✅ 確認發送',
  emailSending: '⏳ 發送中...',
  emailSentCb: '✅ 已發送！',
  emailSentDetail: (subject) => `✅ 郵件已發送！\n主旨：${subject}`,
  emailSendFailed: (msg) => `發送失敗：${msg}`,
  emailSessionMissing: '找不到郵件資料',
  emailNoEmailAddr: '❌ 此聯絡人沒有 email，無法發送。',
  emailNoEmailAddrCb: '此聯絡人無 email',
  emailCancelled: '已取消發信。',
  emailCancelledCb: '已取消',

  // ── Interaction logs ───────────────────────────────────────────────────────
  logsNone: (name) => `📋 ${name} 無互動紀錄`,
  logsHeader: (name, fromIdx, toIdx) => `📋 <b>${name} 互動紀錄</b>（第 ${fromIdx}–${toIdx} 筆）\n\n`,
  logsBtnLoadMore: '載入更多',
  logTypeNote: '筆記',
  logTypeMeeting: '會議',
  logTypeEmail: '郵件',
  logTypeSystem: '系統',

  // ── Common buttons ─────────────────────────────────────────────────────────
  btnConfirm: '✅ 確認',
  btnCancel: '❌ 取消',
  btnConfirmCreate: '✅ 確認建立',
  btnConfirmSave: '✅ 確認存檔',
  btnSaveNewAnyway: '✅ 仍建立新聯絡人',
  btnNotSave: '❌ 不存檔',
  btnMergeInto: (name) => `📌 加到「${name}」`,
  btnReplaceJob: (name) => `🔄 更新「${name}」（換工作）`,
  btnUpdateEmail: (name) => `🔧 更新「${name}」email（換工作）`,
  btnSkipNoCard: '⏭ 跳過，不需要名片',
  btnSkipDirectSave: '⏭ 跳過，直接存入',
  btnSkipNoNeed: '⏭ 跳過',
  btnConfirmApply: '✅ 確認套用',
  btnSaveCardOnly: '📎 只存名片',
  btnConfirmAdd: '✅ 確認新增',
  btnYesThatOne: '✅ 是，就是他',
  btnSearchOther: '🔍 搜尋其他人',
  btnConfirmSend: '✅ 確認發送',

  // ── Merge into existing ────────────────────────────────────────────────────
  mergeNoTargetCb: '無合併目標',
  mergeNoTarget: '❌ 找不到合併目標聯絡人，請重新掃描。',
  mergeFailedFallback: '合併失敗',
  mergeFilled: (n) => `✅ 填入 ${n} 個空白欄位`,
  mergeReplaced: (n) => `🔄 覆蓋 ${n} 個欄位（舊值寫入互動紀錄）`,
  mergeConflicts: (n) => `📝 ${n} 個衝突欄位寫入互動紀錄`,
  mergeCardAdded: '🖼 名片圖已加入',
  mergeViewLink: (name) => `查看 ${name}`,
  mergeResult: (verb, name, summary, link) => `${verb}「${name}」：\n${summary}${link}`,
  mergeVerbUpdated: '已更新',
  mergeVerbAddedTo: '已加到',

  // ── Newsletter (/news) ─────────────────────────────────────────────────────
  newsNoPermission: '⛔ 此指令需要 newsletter 權限，請聯絡管理員開通',
  newsPromptSection: (period) => `📰 累積 <b>${period}</b> 月電子報素材\n要加到哪一段？`,
  newsBtnLastMonth: '📜 上月回顧',
  newsBtnNextMonth: '🔮 下月預告',
  newsSectionLastLabel: '上月回顧',
  newsSectionNextLabel: '下月預告',
  newsStoryTitlePrompt: (period, secLabel) =>
    `📰 <b>${period}</b> · ${secLabel}\n\n輸入 Story 標題（例：AACR Taiwan Night 2026）\n（/cancel 取消）`,
  newsTitleLengthError: '標題長度需要 1-200 字，請重新輸入',
  newsDatePrompt: '📅 事件日期？格式 <code>YYYY-MM-DD</code>（例：2026-04-29），或輸入「略過」（/cancel 取消）',
  newsDateBad: '日期格式不對。請輸入 <code>YYYY-MM-DD</code>（例：2026-04-29），或輸入「略過」',
  newsCreateFailed: (msg) => `❌ 建立失敗：${msg}`,
  newsStoryCreated: (title, eventDate) =>
    `✅ 已建立 story「${title}」${eventDate ? `（${eventDate}）` : ''}\n\n現在請貼內容（文字 + 照片，任何順序）。\n每段文字會 append，每張照片會上傳。\n完成輸入 <code>/done</code>，或 <code>/cancel</code> 取消`,
  newsTextAdded: (added, total) => `📝 已加入 (${added} 字，累計 ${total} 字)。繼續貼，或 <code>/done</code> 結束`,
  newsDoneSummary: (period, secLabel, title, eventDateLine, charCount, photoCount, link) =>
    `✅ 已存到 <b>${period}</b> · ${secLabel}\nStory: ${title}\n${eventDateLine}📝 ${charCount} 字, 📷 ${photoCount} 張照片${link}`,
  newsExited: '已退出',
  newsNoPermissionCb: '無權限',

  // ── Batch ──────────────────────────────────────────────────────────────────
  batchParsingMet: '🤖 解析「在哪裡遇見」...',
  batchMetParseFailed: '⚠️ AI 解析失敗，仍進入 batch 模式但「在哪裡遇見」不會自動填',
  batchEntered: (metInfo, link) =>
    `📦 已進入 batch 模式${metInfo}\n\n繼續傳送名片照片，每張會立即收下、稍後一起辨識。\n\n完成請打 /done，取消打 /cancel。${link}`,
  batchMetInfo: (parts) => `\n\n這批會自動標記：\n${parts}`,
  batchMetIntro: '\n\n這批會自動標記：\n',
  batchNotInMode: '目前不在 batch 模式。輸入 /b 進入後再傳照片。',
  batchEmptyDone: '沒有任何名片，已退出 batch 模式。',
  batchDoneAck: (count) => `✅ 共 ${count} 張已收到，等所有辨識完成後再通知你。`,
  batchCancelled: '已取消 batch 模式（已收的照片留在 pending，可到 web 確認）。',
  cancelGeneric: '已取消。',
  cancelMaintenanceLabel: (action) => `已中止：${action}`,

  // ── Misc ──────────────────────────────────────────────────────────────────
  callbackOpFailed: '❌ 操作失敗',
  recipientNoEmail: '此聯絡人無 email',
  pendingPhotoMissing: '❌ 找不到待處理照片，請重新傳送。',
  contactNotFoundGeneric: '找不到此聯絡人',
  insertFailedFallback: '存檔失敗',
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
    '/b [description]　　　 — Batch mode (optional "where met")\n' +
    '/done　　　　　　　　　　 — End batch mode and get summary\n' +
    '/cancel　　　　　　　　　 — Cancel batch mode\n\n' +
    '/search [keyword]　/s — Search contacts\n' +
    '/n [name]　　　　　　　 — Add note\n' +
    '/v [name]　　　　　　　 — Log a visit\n' +
    '/a [name] or /a name | company — Add business card (create contact on miss)\n' +
    '/p [name] or /p name | company — Add personal photo (create contact on miss)\n' +
    '/li　　　　　　　　　　　 — Send LinkedIn screenshot to parse\n' +
    '/ai　　　　　　　　　　　 — AI generate follow-up / thank-you email\n' +
    '/news　　　　　　　　　　 — Accumulate newsletter material (needs newsletter permission)\n' +
    '/task [task]　　　　　　 — Add task\n' +
    '/meet [meeting info]　 — Add schedule\n' +
    '/members　　　　　　　 — View team members\n' +
    '/todos　　　　　　　　　 — View my tasks\n' +
    '/lang [zh|en|ja]　　　 — Switch Bot language\n' +
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

  langChanged: (lang) => `✅ Language switched to: ${lang}`,
  langInvalid: '❌ Invalid language. Use: /lang zh, /lang en, or /lang ja',

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

  // ── General extras ─────────────────────────────────────────────────────────
  unknownError: 'unknown error',
  tgBusy: '⏳ Telegram is busy, retrying in 3 seconds...',
  tgSendFailed: '❌ Send failed. Please try again later.',
  maintenanceUserBlocked: '🔧 System under maintenance. Please try again later.',
  defaultPrompt: 'Send a business card photo (or /cancel), or type /help (/h) for available commands.',
  aiModelDefault: '🤖 Currently using default model: <b>gemini-2.5-flash</b>',
  aiModelInfo: (displayName, modelId, endpoint) =>
    `🤖 Current AI model:\n\n<b>${displayName}</b>\nModel ID: <code>${modelId}</code>${endpoint ? `\nEndpoint: ${endpoint}` : ''}`,
  cbProcessing: 'Processing...',
  cbOpFailed: '❌ Operation failed',
  cbCancelled: 'Cancelled',
  processingFailed: (msg) => `❌ Processing failed: ${msg}`,

  // ── Card scan extras ───────────────────────────────────────────────────────
  cardThisContact: 'this contact',
  cardFieldLabel: (key) => ({
    name: 'Name', name_en: 'Name (EN)', name_local: 'Name (local)',
    company: 'Company', job_title: 'Title',
    email: 'Email', phone: 'Phone', second_phone: 'Phone 2',
    address: 'Address', website: 'Website',
  } as Record<string, string>)[key] ?? key,
  cardEmptyValue: '—',
  cardOcrResultHeader: '📇 Recognized:\n\n',
  cardFieldLine: (icon, label, value) => `${icon} ${label}: ${value}\n`,
  cardResultName: 'Name',
  cardResultCompany: 'Company',
  cardResultJobTitle: 'Title',
  cardResultEmail: 'Email',
  cardResultPhone: 'Phone',
  cardResultCountry: 'Country',
  cardDiffHeader: (displayName) => `📇 <b>${displayName}</b> card OCR result:\n\n`,
  cardDiffFillHeader: '✅ <b>Fill empty fields:</b>\n',
  cardDiffConflictHeader: '⚠️ <b>Differs from current (stored as note):</b>\n',
  cardDiffFillRow: (label, value) => `• ${label}: ${value}\n`,
  cardDiffConflictRow: (label, newVal, oldVal) => `• ${label}: ${newVal} (current: ${oldVal})\n`,
  cardDiffNoChange: 'Data matches existing record. Card will be saved as-is.\n',
  cardDiffSessionMissing: '❌ Pending card data not found. Please resend.',
  cardDiffAppliedSummary: (filled, conflicts) =>
    filled > 0
      ? `Filled ${filled} field(s)${conflicts > 0 ? `, ${conflicts} conflict(s) stored as note` : ''}`
      : 'Data already up to date',
  cardDiffNoFillSummary: 'Data already up to date',
  cardDiffSkippedSummary: 'Card saved, contact data unchanged',
  cardSavedWithApply: (displayName, applyMsg) => `✅ Card saved for <b>${displayName}</b>. ${applyMsg}`,
  cardDupEmailExists: (name, company) => `\n⚠️ This email already belongs to: ${name} (${company}). Add anyway?`,
  cardDupSimilar: (name, company) => `\n🔍 Similar contact exists: ${name} (${company}). Please confirm if same person.`,
  cardDupBouncedHint: (email, status) => `\n🔧 Existing contact email (${email}) is ${status}. Consider "job change" to overwrite with new email.`,
  cardSavedWithLink: (link) => `✅ Saved successfully!${link}`,
  cardViewContactLink: 'View contact page',
  cardReceivedAskAdd: (contactName) => `Photo received! Add as a card for <b>${contactName}</b>?`,
  batchReceivedNth: (n) => `📥 Received #${n}, recognizing in background. Send more or type /done to finish.`,
  batchUploadFailed: (msg) => `❌ Upload failed: ${msg}`,
  batchPendingFallback: 'pending save failed',
  newsPhotoAdded: (count) => `📷 Photo added (${count} total). Keep sending, or <code>/done</code> to finish`,
  newsPhotoFailed: (msg) => `❌ Photo upload failed: ${msg}`,
  photoCountReceived: (count, displayName) => `📷 Received <b>${count}</b> photo(s) (${displayName})\nSend more, or press "Done"`,
  photoDoneLabel: (count) => `✅ Done (${count} photo${count > 1 ? 's' : ''})`,
  photoNoteAsk: (countText) => `📝 Add a shared note for these ${countText}photos? Reply with text, or press "Skip"`,
  photoNoteAskSingle: '📝 Add a note? Reply with text and it will be stored in the interaction log.',
  photoUploading: '⏳ Uploading...',
  photoMissing: '❌ Pending photos not found. Please resend.',
  photoNoteAttached: ', note stored in interaction log',

  // ── Search extras ──────────────────────────────────────────────────────────
  searchNotFoundTry: 'No matching contacts. Please try again:',

  // ── /a add card flow ───────────────────────────────────────────────────────
  addCardLastContact: (name, company) => `Last contact: <b>${name}</b> (${company})\n\nSend the card photo (or /cancel)`,
  addCardNoLast: 'No last contact. Scan a card first or use <code>/a name</code>.',
  addCardNotFound: (name) => `Contact "${name}" not found. Create new contact?`,
  addCardCreateLabel: (name, company) => company ? `✅ Create "${name} · ${company}"` : `✅ Create "${name}"`,
  addCardFoundOne: (name) => `Found: ${name}\n\nSend the card photo (or /cancel)`,
  addCardMultipleSelect: 'Multiple contacts found. Pick one to add the card to:',
  addCardCreateFailedPrompt: '❌ Creation failed. Please retry: /a name',
  addCardCreateFailed: (msg) => `❌ Creation failed: ${msg}`,
  addCardContactCreated: (displayLine, link) => `✅ Contact created: ${displayLine}${link}\n\nSend the card photo (or /cancel)`,
  addCardSkipped: (displayName, link) => `✅ Skipped card. ${displayName} has been created${link}`,

  // ── /p personal photo flow ─────────────────────────────────────────────────
  personPhotoLastContact: (name, company) => `Last contact: <b>${name}</b> (${company})\n\nSend the group photo (or /cancel)\n\n💡 Long-press photo → <b>Send as File</b> to preserve capture time and GPS`,
  personPhotoNoLast: 'No last contact. Scan a card first or use <code>/p name</code>.',
  personPhotoNotFound: (name) => `Contact "${name}" not found. Create new contact?`,
  personPhotoFoundOne: (name) => `Found: ${name}\n\nSend the group photo (or /cancel)\n\n💡 Long-press photo → <b>Send as File</b> to preserve capture time and GPS`,
  personPhotoMultipleSelect: 'Multiple contacts found. Please select:',
  personPhotoCreateFailedPrompt: '❌ Creation failed. Please retry: /p name',
  personPhotoContactCreated: (displayLine, link) => `✅ Contact created: ${displayLine}${link}\n\nSend the group photo (or /cancel)\n\n💡 Long-press photo → <b>Send as File</b> to preserve capture time and GPS`,

  // ── LinkedIn extras ────────────────────────────────────────────────────────
  liPrompt: '📸 Send a LinkedIn profile screenshot. AI will parse contact info (or /cancel).',
  liResultHeader: '🔗 <b>LinkedIn parse result</b>\n\n',
  liUnnamed: '(no name)',
  liInsertFailed: (msg) => `❌ Add failed: ${msg}`,
  liSavedWithLink: (name, link) => `✅ Contact added: <b>${name}</b>${link}`,

  // ── /n note extras ─────────────────────────────────────────────────────────
  noteLastContactAsk: (name, company) => `For the last contact?\n👤 ${name} (${company})`,
  noteFoundOnePlain: (name) => `Found: ${name}\n\nEnter note content:`,
  noteFoundContactSelect: 'Multiple contacts found. Please select:',
  noteSavedWithDetail: (contactName, isMeeting, detail) =>
    contactName
      ? `✅ ${isMeeting ? 'Visit' : 'Note'} saved (${contactName})${detail}`
      : `✅ Unassigned ${isMeeting ? 'visit' : 'note'} saved${detail}`,
  noteSavedForContact: (name) => `✅ Note saved (${name})`,

  // ── /v visit extras ────────────────────────────────────────────────────────
  visitLastContactAsk: (name, company) => `Add a visit log for the last contact?\n👤 ${name} (${company})`,
  visitAfterContactPick: (name) => `Contact: ${name}\n\nEnter visit datetime (e.g. 2026-03-29 14:00), or type "skip":`,
  visitSavedDetailed: (contactName, detail) =>
    contactName ? `✅ Visit log saved (${contactName})${detail}` : `✅ Unassigned visit log saved${detail}`,

  // ── /task extras ───────────────────────────────────────────────────────────
  taskContactLine: (name, company) => `🔗 Contact: ${name}${company ? ` (${company})` : ''}\n`,
  taskSelfReminderLabel: 'me',
  taskAssignedNotice: (title, contactLine, dueLine, assignerName) =>
    `📋 <b>New task assigned to you</b>\n\n📌 ${title}\n${contactLine}${dueLine}\nAssigned by ${assignerName}.`,
  taskCreatedSelf: (title, contactLine, dueLine) =>
    `✅ Task created (self-reminder)\n\n📌 ${title}\n${contactLine}${dueLine}`,
  taskCreatedAssigned: (assignees, title, contactLine, dueLine) =>
    `✅ Task created → ${assignees}\n\n📌 ${title}\n${contactLine}${dueLine}`,
  taskDueLabel: (datetime) => `⏰ Due: ${datetime}`,
  taskDueNone: '⏰ No due date',
  taskRoleCreated: '(created by me)',
  taskRoleAssigned: '(assigned to me)',
  taskBtnMarkDone: '✅ Mark done',
  taskBtnManage: '📋 Manage tasks',
  taskBtnDone: '✅ Done',
  taskBtnPostpone: '⏭ Postpone',
  taskBtnCancel: '❌ Cancel',
  taskDoneNotice: (title) => `✅ Task completed: ${title}`,
  taskDoneCallback: '✅ Done',
  taskCancelCallback: 'Task cancelled',
  taskCancelledNotice: (title) => `❌ Task cancelled: ${title}`,
  taskDoneTeamsNotify: (title, completedBy) => `✅ Task completed: ${title}\nMarked done by ${completedBy}`,
  taskPostponePrompt: 'Enter new due time (e.g. 2026-03-20 15:00):',
  taskPostponeFormatBad: 'Could not parse date. Try formats like: 2026-03-20 15:00 or tomorrow 3pm',
  taskPostponed: (datetime) => `✅ Task due time postponed to ${datetime}`,
  taskNoTitle: '',

  // ── /meet extras ───────────────────────────────────────────────────────────
  meetConfirmHeader: '📅 <b>Confirm schedule</b>\n\n',
  meetFieldTitle: 'Title',
  meetFieldTime: 'Time',
  meetFieldDuration: 'Duration',
  meetFieldAttendees: 'Attendees',
  meetFieldLocation: 'Location',
  meetSelfLabel: 'you',
  meetConfirmFooter: '\nConfirm with the buttons below.',
  meetDurationLabel: (minutes) => {
    if (minutes === 30) return '30 min'
    if (minutes === 60) return '1 hour'
    if (minutes === 90) return '1.5 hours'
    return '2 hours'
  },
  meetTimeRange: (startEnd) => `${startEnd} (Taipei)`,
  meetCreatedDetail: (title, timeLabel, link) => `✅ <b>Schedule created!</b>\n\n📅 ${title}\n🕐 ${timeLabel}${link}`,
  meetExpired: 'Expired or not found',
  meetCreateFailedCb: '❌ Creation failed',
  meetCreateFailedDetail: (msg) => `❌ Failed to create schedule: ${msg}`,
  meetTimezoneLabel: '(Taipei)',
  meetTryAgainLater: 'Please try again later',
  meetOpenInOutlook: 'Open in Outlook',

  // ── /met ───────────────────────────────────────────────────────────────────
  metContactsHeader: (count) => `📍 Apply to last ${count} contact(s):\n\n`,
  metFieldOccasion: 'Occasion',
  metFieldDate: 'Date',
  metFieldReferrer: 'Referred by',
  metOccasionUnspecified: '(unspecified)',
  metContactNotFound: 'No recent contact records found.',
  metAppliedTo: (count) => `✅ Applied to ${count} contact(s)`,
  metApplyFailed: (msg) => `❌ Apply failed: ${msg}`,
  metApplyMissing: 'No data to apply',
  metLogContent: (occasion, date, referrer) => `Met at: ${occasion} (${date})${referrer ? `, referred by: ${referrer}` : ''}`,
  metCbApplying: 'Applying...',

  // ── Email flow ─────────────────────────────────────────────────────────────
  emailEnterContactQuery: 'Enter contact name or company keyword:',
  emailEnterContactNameOrCompany: 'Enter contact name or email:',
  emailLastContactAsk: (name, company) => `For the last contact?\n👤 ${name} (${company})`,
  emailRecipientPrompt: (name, email) =>
    `Recipient: <b>${name}</b> (${email})\n\nChoose method:\n1. Use email template\n2. Describe, AI generates`,
  emailRecipientPromptShort: (name, email) => `Recipient: <b>${name}</b> (${email})\n\nChoose method:`,
  emailEmptyEmailLabel: 'no email',
  emailMethodList: '\n1. Use email template\n2. Describe, AI generates',
  emailBtnTemplate: '1️⃣ Use template',
  emailBtnAI: '2️⃣ AI generate',
  emailNoTemplates: 'No email templates yet. Please add one on the web.',
  emailNoTemplatesPick: 'No templates available',
  emailPickTemplate: 'Pick an email template:',
  emailDescribePurpose: 'Describe the purpose of this email:',
  emailTemplateChosen: (title) => `Template selected: <b>${title}</b>\n\nAny supplement? (reply <code>skip</code> to send as-is)`,
  emailSupplementAsk: 'Any supplement? (reply <code>skip</code> to send as-is)',
  emailPreview: (subject, preview, truncated) => `📧 Email preview\n\nSubject: ${subject}\n\n${preview}${truncated ? '...' : ''}`,
  emailSubjectPrefix: 'Re: ',
  emailSubjectNone: '(no subject)',
  emailBtnConfirmSend: '✅ Confirm send',
  emailSending: '⏳ Sending...',
  emailSentCb: '✅ Sent!',
  emailSentDetail: (subject) => `✅ Email sent!\nSubject: ${subject}`,
  emailSendFailed: (msg) => `Send failed: ${msg}`,
  emailSessionMissing: 'Email data not found',
  emailNoEmailAddr: '❌ This contact has no email; cannot send.',
  emailNoEmailAddrCb: 'No email for this contact',
  emailCancelled: 'Email cancelled.',
  emailCancelledCb: 'Cancelled',

  // ── Interaction logs ───────────────────────────────────────────────────────
  logsNone: (name) => `📋 ${name} has no interaction logs`,
  logsHeader: (name, fromIdx, toIdx) => `📋 <b>${name} interaction logs</b> (${fromIdx}–${toIdx})\n\n`,
  logsBtnLoadMore: 'Load more',
  logTypeNote: 'Note',
  logTypeMeeting: 'Meeting',
  logTypeEmail: 'Email',
  logTypeSystem: 'System',

  // ── Common buttons ─────────────────────────────────────────────────────────
  btnConfirm: '✅ Confirm',
  btnCancel: '❌ Cancel',
  btnConfirmCreate: '✅ Confirm create',
  btnConfirmSave: '✅ Confirm save',
  btnSaveNewAnyway: '✅ Create new anyway',
  btnNotSave: '❌ Discard',
  btnMergeInto: (name) => `📌 Add to "${name}"`,
  btnReplaceJob: (name) => `🔄 Update "${name}" (job change)`,
  btnUpdateEmail: (name) => `🔧 Update "${name}" email (job change)`,
  btnSkipNoCard: '⏭ Skip, no card needed',
  btnSkipDirectSave: '⏭ Skip, save as-is',
  btnSkipNoNeed: '⏭ Skip',
  btnConfirmApply: '✅ Confirm apply',
  btnSaveCardOnly: '📎 Save card only',
  btnConfirmAdd: '✅ Confirm add',
  btnYesThatOne: '✅ Yes, that one',
  btnSearchOther: '🔍 Search someone else',
  btnConfirmSend: '✅ Confirm send',

  // ── Merge into existing ────────────────────────────────────────────────────
  mergeNoTargetCb: 'No merge target',
  mergeNoTarget: '❌ Merge target not found. Please rescan.',
  mergeFailedFallback: 'merge failed',
  mergeFilled: (n) => `✅ Filled ${n} empty field(s)`,
  mergeReplaced: (n) => `🔄 Replaced ${n} field(s) (old values stored in interaction log)`,
  mergeConflicts: (n) => `📝 ${n} conflict field(s) stored in interaction log`,
  mergeCardAdded: '🖼 Card image added',
  mergeViewLink: (name) => `View ${name}`,
  mergeResult: (verb, name, summary, link) => `${verb} "${name}":\n${summary}${link}`,
  mergeVerbUpdated: 'Updated',
  mergeVerbAddedTo: 'Added to',

  // ── Newsletter (/news) ─────────────────────────────────────────────────────
  newsNoPermission: '⛔ This command needs newsletter permission. Please contact an admin.',
  newsPromptSection: (period) => `📰 Accumulate newsletter material for <b>${period}</b>\nWhich section?`,
  newsBtnLastMonth: '📜 Last month review',
  newsBtnNextMonth: '🔮 Next month preview',
  newsSectionLastLabel: 'Last month review',
  newsSectionNextLabel: 'Next month preview',
  newsStoryTitlePrompt: (period, secLabel) =>
    `📰 <b>${period}</b> · ${secLabel}\n\nEnter story title (e.g. AACR Taiwan Night 2026)\n(/cancel to abort)`,
  newsTitleLengthError: 'Title must be 1-200 characters. Please retry',
  newsDatePrompt: '📅 Event date? Format <code>YYYY-MM-DD</code> (e.g. 2026-04-29), or type "skip" (/cancel to abort)',
  newsDateBad: 'Bad date format. Please enter <code>YYYY-MM-DD</code> (e.g. 2026-04-29), or type "skip"',
  newsCreateFailed: (msg) => `❌ Creation failed: ${msg}`,
  newsStoryCreated: (title, eventDate) =>
    `✅ Story "${title}" created${eventDate ? ` (${eventDate})` : ''}\n\nNow paste content (text + photos, any order).\nEach text appends, each photo uploads.\nType <code>/done</code> when finished, or <code>/cancel</code>`,
  newsTextAdded: (added, total) => `📝 Added (${added} chars, ${total} total). Keep going, or <code>/done</code> to finish`,
  newsDoneSummary: (period, secLabel, title, eventDateLine, charCount, photoCount, link) =>
    `✅ Saved to <b>${period}</b> · ${secLabel}\nStory: ${title}\n${eventDateLine}📝 ${charCount} chars, 📷 ${photoCount} photo(s)${link}`,
  newsExited: 'Exited',
  newsNoPermissionCb: 'No permission',

  // ── Batch ──────────────────────────────────────────────────────────────────
  batchParsingMet: '🤖 Parsing "where met"...',
  batchMetParseFailed: '⚠️ AI parse failed. Entering batch mode, but "where met" will not be auto-filled',
  batchEntered: (metInfo, link) =>
    `📦 Entered batch mode${metInfo}\n\nKeep sending card photos. Each is received immediately and recognized together later.\n\nType /done when finished, /cancel to abort.${link}`,
  batchMetInfo: (parts) => `\n\nThis batch will be auto-tagged:\n${parts}`,
  batchMetIntro: '\n\nThis batch will be auto-tagged:\n',
  batchNotInMode: 'Not in batch mode. Type /b to enter, then send photos.',
  batchEmptyDone: 'No cards. Exited batch mode.',
  batchDoneAck: (count) => `✅ Received ${count} card(s). You will be notified once recognition completes.`,
  batchCancelled: 'Batch mode cancelled (received photos remain pending; confirm on web).',
  cancelGeneric: 'Cancelled.',
  cancelMaintenanceLabel: (action) => `Cancelled: ${action}`,

  // ── Misc ──────────────────────────────────────────────────────────────────
  callbackOpFailed: '❌ Operation failed',
  recipientNoEmail: 'No email for this contact',
  pendingPhotoMissing: '❌ Pending photos not found. Please resend.',
  contactNotFoundGeneric: 'Contact not found',
  insertFailedFallback: 'save failed',
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
    '/b [説明]　　　　　　　 — バッチモード（任意で「出会いの場」）\n' +
    '/done　　　　　　　　　　 — バッチモード終了、まとめ通知\n' +
    '/cancel　　　　　　　　　 — バッチモードを中止\n\n' +
    '/search [キーワード]　/s — 連絡先を検索\n' +
    '/n [名前]　　　　　　　　 — メモを追加\n' +
    '/v [名前]　　　　　　　　 — 訪問を記録\n' +
    '/a [名前] または /a 名前 | 会社 — 連絡先に名刺を追加（未登録なら新規作成）\n' +
    '/p [名前] または /p 名前 | 会社 — 連絡先に写真を追加（未登録なら新規作成）\n' +
    '/li　　　　　　　　　　　　 — LinkedInスクショを解析\n' +
    '/ai　　　　　　　　　　　　 — AI でフォローアップメールを生成\n' +
    '/news　　　　　　　　　　　 — ニュースレター素材を蓄積（newsletter 権限必要）\n' +
    '/task [タスク内容]　　　 — タスクを追加\n' +
    '/meet [会議情報]　　　　 — スケジュールを追加\n' +
    '/members　　　　　　　　 — メンバー一覧を表示\n' +
    '/todos　　　　　　　　　　 — 自分のタスクを確認\n' +
    '/lang [zh|en|ja]　　　　 — Bot言語を切り替え\n' +
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

  langChanged: (lang) => `✅ 言語を切り替えました：${lang}`,
  langInvalid: '❌ 無効な言語コードです。/lang zh、/lang en、/lang ja をご利用ください',

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

  // ── General extras ─────────────────────────────────────────────────────────
  unknownError: '不明なエラー',
  tgBusy: '⏳ Telegram が混み合っています。3秒後に再試行します...',
  tgSendFailed: '❌ 送信に失敗しました。しばらくしてから再試行してください。',
  maintenanceUserBlocked: '🔧 システムメンテナンス中です。しばらくしてからお試しください。',
  defaultPrompt: '名刺の写真を送信してください（または /cancel）。/help（/h）で使えるコマンドを確認できます。',
  aiModelDefault: '🤖 現在のモデル（デフォルト）：<b>gemini-2.5-flash</b>',
  aiModelInfo: (displayName, modelId, endpoint) =>
    `🤖 現在の AI モデル：\n\n<b>${displayName}</b>\nモデル ID：<code>${modelId}</code>${endpoint ? `\nエンドポイント：${endpoint}` : ''}`,
  cbProcessing: '処理中...',
  cbOpFailed: '❌ 操作に失敗しました',
  cbCancelled: 'キャンセルしました',
  processingFailed: (msg) => `❌ 処理失敗：${msg}`,

  // ── Card scan extras ───────────────────────────────────────────────────────
  cardThisContact: 'この連絡先',
  cardFieldLabel: (key) => ({
    name: '氏名', name_en: '氏名（英）', name_local: '氏名（現地）',
    company: '会社', job_title: '役職',
    email: 'メール', phone: '電話', second_phone: '電話 2',
    address: '住所', website: 'ウェブサイト',
  } as Record<string, string>)[key] ?? key,
  cardEmptyValue: '—',
  cardOcrResultHeader: '📇 認識結果：\n\n',
  cardFieldLine: (icon, label, value) => `${icon} ${label}：${value}\n`,
  cardResultName: '氏名',
  cardResultCompany: '会社',
  cardResultJobTitle: '役職',
  cardResultEmail: 'メール',
  cardResultPhone: '電話',
  cardResultCountry: '国',
  cardDiffHeader: (displayName) => `📇 <b>${displayName}</b> 名刺 OCR 結果：\n\n`,
  cardDiffFillHeader: '✅ <b>空欄に入力：</b>\n',
  cardDiffConflictHeader: '⚠️ <b>既存と異なる項目（メモに保存）：</b>\n',
  cardDiffFillRow: (label, value) => `• ${label}：${value}\n`,
  cardDiffConflictRow: (label, newVal, oldVal) => `• ${label}：${newVal}（既存：${oldVal}）\n`,
  cardDiffNoChange: '既存データと同じです。名刺はそのまま保存されます。\n',
  cardDiffSessionMissing: '❌ 保留中の名刺データが見つかりません。再送してください。',
  cardDiffAppliedSummary: (filled, conflicts) =>
    filled > 0
      ? `${filled} 項目を入力しました${conflicts > 0 ? `。${conflicts} 件の競合はメモに保存しました` : ''}`
      : 'データはすでに最新です',
  cardDiffNoFillSummary: 'データはすでに最新です',
  cardDiffSkippedSummary: '名刺を保存しました。連絡先情報は変更していません',
  cardSavedWithApply: (displayName, applyMsg) => `✅ <b>${displayName}</b> の名刺を保存しました。${applyMsg}`,
  cardDupEmailExists: (name, company) => `\n⚠️ このメールはすでに連絡先に登録されています：${name}（${company}）。それでも追加しますか？`,
  cardDupSimilar: (name, company) => `\n🔍 類似の連絡先があります：${name}（${company}）。同一人物か確認してください`,
  cardDupBouncedHint: (email, status) => `\n🔧 既存の連絡先のメール（${email}）は ${status} です。「転職」で新しいメールに上書きすることをお勧めします`,
  cardSavedWithLink: (link) => `✅ 保存しました！${link}`,
  cardViewContactLink: '連絡先ページを開く',
  cardReceivedAskAdd: (contactName) => `写真を受け取りました！<b>${contactName}</b> の名刺として追加しますか？`,
  batchReceivedNth: (n) => `📥 ${n} 枚目を受信、バックグラウンドで認識中です。続けて送信するか、/done で終了してください。`,
  batchUploadFailed: (msg) => `❌ 受信失敗：${msg}`,
  batchPendingFallback: '保留中の保存に失敗しました',
  newsPhotoAdded: (count) => `📷 写真を追加しました（累計 ${count} 枚）。続けて貼るか、<code>/done</code> で終了`,
  newsPhotoFailed: (msg) => `❌ 写真のアップロードに失敗：${msg}`,
  photoCountReceived: (count, displayName) => `📷 <b>${count}</b> 枚を受信（${displayName}）\n続けて送信、または「完了」を押してください`,
  photoDoneLabel: (count) => `✅ 完了（${count} 枚）`,
  photoNoteAsk: (countText) => `📝 ${countText}写真に共通のメモを付けますか？テキストを返信するか、「スキップ」を押してください`,
  photoNoteAskSingle: '📝 メモを付けますか？テキストを返信するとインタラクションログに保存されます。',
  photoUploading: '⏳ アップロード中...',
  photoMissing: '❌ 保留中の写真が見つかりません。再送してください。',
  photoNoteAttached: '、メモはインタラクションログに保存しました',

  // ── Search extras ──────────────────────────────────────────────────────────
  searchNotFoundTry: '一致する連絡先が見つかりません。もう一度お試しください：',

  // ── /a add card flow ───────────────────────────────────────────────────────
  addCardLastContact: (name, company) => `直前の連絡先：<b>${name}</b>（${company}）\n\n名刺の写真を送信してください（または /cancel）`,
  addCardNoLast: '直前の連絡先が見つかりません。先に名刺をスキャンするか、<code>/a 名前</code> で指定してください。',
  addCardNotFound: (name) => `連絡先「${name}」が見つかりません。新しく作成しますか？`,
  addCardCreateLabel: (name, company) => company ? `✅ 「${name} · ${company}」を作成` : `✅ 「${name}」を作成`,
  addCardFoundOne: (name) => `見つかりました：${name}\n\n名刺の写真を送信してください（または /cancel）`,
  addCardMultipleSelect: '複数の連絡先が見つかりました。名刺を追加する対象を選択してください：',
  addCardCreateFailedPrompt: '❌ 作成に失敗しました。/a 名前 でもう一度入力してください',
  addCardCreateFailed: (msg) => `❌ 作成失敗：${msg}`,
  addCardContactCreated: (displayLine, link) => `✅ 連絡先を作成しました：${displayLine}${link}\n\n名刺の写真を送信してください（または /cancel）`,
  addCardSkipped: (displayName, link) => `✅ 名刺をスキップしました。${displayName} を作成しました${link}`,

  // ── /p personal photo flow ─────────────────────────────────────────────────
  personPhotoLastContact: (name, company) => `直前の連絡先：<b>${name}</b>（${company}）\n\n集合写真を送信してください（または /cancel）\n\n💡 写真を長押し → <b>ファイルとして送信</b> で撮影時刻と GPS 位置を保持できます`,
  personPhotoNoLast: '直前の連絡先が見つかりません。先に名刺をスキャンするか、<code>/p 名前</code> で指定してください。',
  personPhotoNotFound: (name) => `連絡先「${name}」が見つかりません。新しく作成しますか？`,
  personPhotoFoundOne: (name) => `見つかりました：${name}\n\n集合写真を送信してください（または /cancel）\n\n💡 写真を長押し → <b>ファイルとして送信</b> で撮影時刻と GPS 位置を保持できます`,
  personPhotoMultipleSelect: '複数の連絡先が見つかりました。選択してください：',
  personPhotoCreateFailedPrompt: '❌ 作成に失敗しました。/p 名前 でもう一度入力してください',
  personPhotoContactCreated: (displayLine, link) => `✅ 連絡先を作成しました：${displayLine}${link}\n\n集合写真を送信してください（または /cancel）\n\n💡 写真を長押し → <b>ファイルとして送信</b> で撮影時刻と GPS 位置を保持できます`,

  // ── LinkedIn extras ────────────────────────────────────────────────────────
  liPrompt: '📸 LinkedIn のプロフィールのスクリーンショットを送信してください。AI が自動で解析します（または /cancel）。',
  liResultHeader: '🔗 <b>LinkedIn 解析結果</b>\n\n',
  liUnnamed: '（氏名なし）',
  liInsertFailed: (msg) => `❌ 追加に失敗しました：${msg}`,
  liSavedWithLink: (name, link) => `✅ 連絡先を追加しました：<b>${name}</b>${link}`,

  // ── /n note extras ─────────────────────────────────────────────────────────
  noteLastContactAsk: (name, company) => `直前の連絡先に対して操作しますか？\n👤 ${name}（${company}）`,
  noteFoundOnePlain: (name) => `見つかりました：${name}\n\nメモ内容を入力してください：`,
  noteFoundContactSelect: '複数の連絡先が見つかりました。選択してください：',
  noteSavedWithDetail: (contactName, isMeeting, detail) =>
    contactName
      ? `✅ ${isMeeting ? '訪問記録' : 'メモ'}を保存しました（${contactName}）${detail}`
      : `✅ 未分類の${isMeeting ? '訪問記録' : 'メモ'}を保存しました${detail}`,
  noteSavedForContact: (name) => `✅ メモを保存しました（${name}）`,

  // ── /v visit extras ────────────────────────────────────────────────────────
  visitLastContactAsk: (name, company) => `直前の連絡先に訪問記録を追加しますか？\n👤 ${name}（${company}）`,
  visitAfterContactPick: (name) => `連絡先：${name}\n\n訪問日時を入力してください（例：2026-03-29 14:00）、または「スキップ」と入力：`,
  visitSavedDetailed: (contactName, detail) =>
    contactName ? `✅ 訪問記録を保存しました（${contactName}）${detail}` : `✅ 未分類の訪問記録を保存しました${detail}`,

  // ── /task extras ───────────────────────────────────────────────────────────
  taskContactLine: (name, company) => `🔗 連絡先：${name}${company ? `（${company}）` : ''}\n`,
  taskSelfReminderLabel: '自分',
  taskAssignedNotice: (title, contactLine, dueLine, assignerName) =>
    `📋 <b>新しいタスクが割り当てられました</b>\n\n📌 ${title}\n${contactLine}${dueLine}\n${assignerName} さんから割り当てられました。`,
  taskCreatedSelf: (title, contactLine, dueLine) =>
    `✅ タスクを作成しました（自分用リマインダー）\n\n📌 ${title}\n${contactLine}${dueLine}`,
  taskCreatedAssigned: (assignees, title, contactLine, dueLine) =>
    `✅ タスクを作成しました → ${assignees}\n\n📌 ${title}\n${contactLine}${dueLine}`,
  taskDueLabel: (datetime) => `⏰ 締切：${datetime}`,
  taskDueNone: '⏰ 締切なし',
  taskRoleCreated: '（自分が作成）',
  taskRoleAssigned: '（自分に割り当て）',
  taskBtnMarkDone: '✅ 完了マーク',
  taskBtnManage: '📋 タスク管理',
  taskBtnDone: '✅ 完了',
  taskBtnPostpone: '⏭ 延期',
  taskBtnCancel: '❌ キャンセル',
  taskDoneNotice: (title) => `✅ タスク完了：${title}`,
  taskDoneCallback: '✅ 完了',
  taskCancelCallback: 'タスクをキャンセルしました',
  taskCancelledNotice: (title) => `❌ タスクをキャンセルしました：${title}`,
  taskDoneTeamsNotify: (title, completedBy) => `✅ タスク完了：${title}\n${completedBy} さんが完了マークしました`,
  taskPostponePrompt: '新しい締切日時を入力してください（例：2026-03-20 15:00）：',
  taskPostponeFormatBad: '日付を解析できません。例：2026-03-20 15:00 や tomorrow 3pm の形式で入力してください',
  taskPostponed: (datetime) => `✅ タスクの締切を ${datetime} に延期しました`,
  taskNoTitle: '',

  // ── /meet extras ───────────────────────────────────────────────────────────
  meetConfirmHeader: '📅 <b>スケジュール作成の確認</b>\n\n',
  meetFieldTitle: 'タイトル',
  meetFieldTime: '時間',
  meetFieldDuration: '所要時間',
  meetFieldAttendees: '参加者',
  meetFieldLocation: '場所',
  meetSelfLabel: '自分',
  meetConfirmFooter: '\n下のボタンで確認してください。',
  meetDurationLabel: (minutes) => {
    if (minutes === 30) return '30 分'
    if (minutes === 60) return '1 時間'
    if (minutes === 90) return '1.5 時間'
    return '2 時間'
  },
  meetTimeRange: (startEnd) => `${startEnd}（台北時間）`,
  meetCreatedDetail: (title, timeLabel, link) => `✅ <b>スケジュールを作成しました！</b>\n\n📅 ${title}\n🕐 ${timeLabel}${link}`,
  meetExpired: '期限切れまたは存在しません',
  meetCreateFailedCb: '❌ 作成に失敗しました',
  meetCreateFailedDetail: (msg) => `❌ スケジュールの作成に失敗しました：${msg}`,
  meetTimezoneLabel: '（台北時間）',
  meetTryAgainLater: 'しばらくしてから再試行してください',
  meetOpenInOutlook: 'Outlook で開く',

  // ── /met ───────────────────────────────────────────────────────────────────
  metContactsHeader: (count) => `📍 直近 ${count} 名の連絡先に適用：\n\n`,
  metFieldOccasion: '場面',
  metFieldDate: '日付',
  metFieldReferrer: '紹介者',
  metOccasionUnspecified: '（未指定）',
  metContactNotFound: '最近の連絡先記録が見つかりません',
  metAppliedTo: (count) => `✅ ${count} 名の連絡先に適用しました`,
  metApplyFailed: (msg) => `❌ 適用に失敗しました：${msg}`,
  metApplyMissing: '適用するデータが見つかりません',
  metLogContent: (occasion, date, referrer) => `出会い：${occasion}（${date}）${referrer ? `、紹介者：${referrer}` : ''}`,
  metCbApplying: '適用中...',

  // ── Email flow ─────────────────────────────────────────────────────────────
  emailEnterContactQuery: '連絡先の名前または会社のキーワードを入力してください：',
  emailEnterContactNameOrCompany: '連絡先の名前またはメールを入力してください：',
  emailLastContactAsk: (name, company) => `直前の連絡先に対して操作しますか？\n👤 ${name}（${company}）`,
  emailRecipientPrompt: (name, email) =>
    `宛先：<b>${name}</b>（${email}）\n\n送信方法を選択してください：\n1. メールテンプレートを使う\n2. 内容を説明して AI に生成してもらう`,
  emailRecipientPromptShort: (name, email) => `宛先：<b>${name}</b>（${email}）\n\n送信方法を選択してください：`,
  emailEmptyEmailLabel: 'メールなし',
  emailMethodList: '\n1. メールテンプレートを使う\n2. 内容を説明して AI に生成してもらう',
  emailBtnTemplate: '1️⃣ テンプレートを使う',
  emailBtnAI: '2️⃣ AI で生成',
  emailNoTemplates: 'メールテンプレートがまだありません。先にウェブで追加してください。',
  emailNoTemplatesPick: '利用可能なテンプレートがありません',
  emailPickTemplate: 'メールテンプレートを選択してください：',
  emailDescribePurpose: 'このメールの目的を説明してください：',
  emailTemplateChosen: (title) => `テンプレートを選択しました：<b>${title}</b>\n\n補足する内容はありますか？（そのまま送信する場合は <code>skip</code> と返信してください）`,
  emailSupplementAsk: '補足する内容はありますか？（そのまま送信する場合は <code>skip</code> と返信してください）',
  emailPreview: (subject, preview, truncated) => `📧 メールプレビュー\n\n件名：${subject}\n\n${preview}${truncated ? '...' : ''}`,
  emailSubjectPrefix: '件名：',
  emailSubjectNone: '（件名なし）',
  emailBtnConfirmSend: '✅ 送信を確認',
  emailSending: '⏳ 送信中...',
  emailSentCb: '✅ 送信しました！',
  emailSentDetail: (subject) => `✅ メールを送信しました！\n件名：${subject}`,
  emailSendFailed: (msg) => `送信失敗：${msg}`,
  emailSessionMissing: 'メールデータが見つかりません',
  emailNoEmailAddr: '❌ この連絡先にはメールがありません。送信できません。',
  emailNoEmailAddrCb: 'この連絡先にはメールがありません',
  emailCancelled: 'メール送信をキャンセルしました。',
  emailCancelledCb: 'キャンセルしました',

  // ── Interaction logs ───────────────────────────────────────────────────────
  logsNone: (name) => `📋 ${name} のインタラクション記録はありません`,
  logsHeader: (name, fromIdx, toIdx) => `📋 <b>${name} のインタラクション記録</b>（${fromIdx}–${toIdx} 件目）\n\n`,
  logsBtnLoadMore: 'もっと読む',
  logTypeNote: 'メモ',
  logTypeMeeting: 'ミーティング',
  logTypeEmail: 'メール',
  logTypeSystem: 'システム',

  // ── Common buttons ─────────────────────────────────────────────────────────
  btnConfirm: '✅ 確認',
  btnCancel: '❌ キャンセル',
  btnConfirmCreate: '✅ 作成を確認',
  btnConfirmSave: '✅ 保存を確認',
  btnSaveNewAnyway: '✅ それでも新規作成',
  btnNotSave: '❌ 保存しない',
  btnMergeInto: (name) => `📌 「${name}」に追加`,
  btnReplaceJob: (name) => `🔄 「${name}」を更新（転職）`,
  btnUpdateEmail: (name) => `🔧 「${name}」のメールを更新（転職）`,
  btnSkipNoCard: '⏭ スキップ、名刺は不要',
  btnSkipDirectSave: '⏭ スキップしてそのまま保存',
  btnSkipNoNeed: '⏭ スキップ',
  btnConfirmApply: '✅ 適用を確認',
  btnSaveCardOnly: '📎 名刺のみ保存',
  btnConfirmAdd: '✅ 追加を確認',
  btnYesThatOne: '✅ はい、その人です',
  btnSearchOther: '🔍 他の人を検索',
  btnConfirmSend: '✅ 送信を確認',

  // ── Merge into existing ────────────────────────────────────────────────────
  mergeNoTargetCb: '統合対象がありません',
  mergeNoTarget: '❌ 統合対象の連絡先が見つかりません。再スキャンしてください。',
  mergeFailedFallback: '統合に失敗しました',
  mergeFilled: (n) => `✅ ${n} 項目の空欄を入力しました`,
  mergeReplaced: (n) => `🔄 ${n} 項目を上書きしました（旧値はインタラクションログに保存）`,
  mergeConflicts: (n) => `📝 ${n} 項目の競合をインタラクションログに保存しました`,
  mergeCardAdded: '🖼 名刺画像を追加しました',
  mergeViewLink: (name) => `${name} を表示`,
  mergeResult: (verb, name, summary, link) => `「${name}」を${verb}：\n${summary}${link}`,
  mergeVerbUpdated: '更新しました',
  mergeVerbAddedTo: '追加しました',

  // ── Newsletter (/news) ─────────────────────────────────────────────────────
  newsNoPermission: '⛔ このコマンドには newsletter 権限が必要です。管理者にお問い合わせください',
  newsPromptSection: (period) => `📰 <b>${period}</b> 月のニュースレター素材を蓄積\nどのセクションに追加しますか？`,
  newsBtnLastMonth: '📜 先月のレビュー',
  newsBtnNextMonth: '🔮 来月のプレビュー',
  newsSectionLastLabel: '先月のレビュー',
  newsSectionNextLabel: '来月のプレビュー',
  newsStoryTitlePrompt: (period, secLabel) =>
    `📰 <b>${period}</b> · ${secLabel}\n\nストーリーのタイトルを入力してください（例：AACR Taiwan Night 2026）\n（/cancel で中止）`,
  newsTitleLengthError: 'タイトルは 1〜200 文字で入力してください',
  newsDatePrompt: '📅 イベント日付は？形式 <code>YYYY-MM-DD</code>（例：2026-04-29）、または「スキップ」と入力（/cancel で中止）',
  newsDateBad: '日付の形式が正しくありません。<code>YYYY-MM-DD</code>（例：2026-04-29）で入力するか、「スキップ」と入力してください',
  newsCreateFailed: (msg) => `❌ 作成失敗：${msg}`,
  newsStoryCreated: (title, eventDate) =>
    `✅ ストーリー「${title}」を作成しました${eventDate ? `（${eventDate}）` : ''}\n\n本文を貼ってください（テキスト + 写真、順不同）。\nテキストは追記、写真はアップロードされます。\n完了したら <code>/done</code>、または <code>/cancel</code> でキャンセル`,
  newsTextAdded: (added, total) => `📝 追加しました（${added} 文字、累計 ${total} 文字）。続けて貼るか、<code>/done</code> で終了`,
  newsDoneSummary: (period, secLabel, title, eventDateLine, charCount, photoCount, link) =>
    `✅ <b>${period}</b> · ${secLabel} に保存しました\nStory: ${title}\n${eventDateLine}📝 ${charCount} 文字、📷 ${photoCount} 枚の写真${link}`,
  newsExited: '退出しました',
  newsNoPermissionCb: '権限がありません',

  // ── Batch ──────────────────────────────────────────────────────────────────
  batchParsingMet: '🤖 「出会いの場」を解析中...',
  batchMetParseFailed: '⚠️ AI 解析に失敗しました。batch モードに入りますが「出会いの場」は自動入力されません',
  batchEntered: (metInfo, link) =>
    `📦 batch モードに入りました${metInfo}\n\n続けて名刺写真を送信してください。各写真はすぐに受信し、後でまとめて認識します。\n\n完了したら /done、中止は /cancel。${link}`,
  batchMetInfo: (parts) => `\n\nこのバッチは自動的にタグ付けされます：\n${parts}`,
  batchMetIntro: '\n\nこのバッチは自動的にタグ付けされます：\n',
  batchNotInMode: '現在 batch モードではありません。/b で開始してから写真を送信してください。',
  batchEmptyDone: '名刺はありません。batch モードを終了しました。',
  batchDoneAck: (count) => `✅ 合計 ${count} 枚を受信しました。すべての認識が完了したら通知します。`,
  batchCancelled: 'batch モードをキャンセルしました（受信済みの写真は pending に残ります。web で確認できます）。',
  cancelGeneric: 'キャンセルしました。',
  cancelMaintenanceLabel: (action) => `中止しました：${action}`,

  // ── Misc ──────────────────────────────────────────────────────────────────
  callbackOpFailed: '❌ 操作に失敗しました',
  recipientNoEmail: 'この連絡先にはメールがありません',
  pendingPhotoMissing: '❌ 保留中の写真が見つかりません。再送してください。',
  contactNotFoundGeneric: '連絡先が見つかりません',
  insertFailedFallback: '保存失敗',
}

// ── Export ────────────────────────────────────────────────────────────────────

export const BOT_MESSAGES: Record<BotLang, BotMessages> = { zh, en, ja }
