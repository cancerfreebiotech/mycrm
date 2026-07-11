import { NextRequest, NextResponse, after } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getBotLanguage, BOT_MESSAGES, type BotMessages, type BotLang } from '@/lib/bot-messages'
import { analyzeBusinessCard, generateEmailContent, parseTaskCommand, parseMeetingCommand, parseMetCommand, parseVisitNote, parseLinkedInScreenshot } from '@/lib/gemini'
import { processCardImage, processPhotoWithExif, extractExif, generateCardFilename } from '@/lib/imageProcessor'
import { checkDuplicates } from '@/lib/duplicate'
import { sendMail, createCalendarEvent } from '@/lib/graph'
import { getValidProviderToken } from '@/lib/graph-server'
import { sendTeamsTaskNotification, sendTeamsMessage } from '@/lib/teams'
import { processOnePending, summarizeBatchAndNotify } from '@/lib/pending-ocr-worker'
import { mergeIntoContact, type MergeMode } from '@/lib/merge-into-contact'
import { signCardUrl } from '@/lib/cardImageUrl'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { TOOLS, TOOL_BY_NAME, executeTool } from '@/lib/agent-tools'
import { getOrgSetting } from '@/lib/orgSettings'
import { systemOrgContext, orgScopedClient, type OrgDb } from '@/lib/orgContext'
import { resolveTouchpoint } from '@/lib/aiRouting'
import { runOpenAiToolLoop } from '@/lib/openaiAgent'
import { orQuote } from '@/lib/likeEscape'

// v8.0 Phase 3 (Task 185): app base URL for links in bot messages.
// Env still wins (backward-compat); otherwise the org's configured app_url,
// whose default resolves to the same hardcoded URL as before. The bot runs
// entirely in the system / default-org context, so no orgId is threaded here.
async function resolveAppUrl(): Promise<string> {
  return (
    process.env.NEXTAUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    (await getOrgSetting(createServiceClient(), 'app_url')) ??
    ''
  )
}

function countryToLanguage(code: string | null | undefined): string {
  if (code === 'TW' || code === 'CN') return 'chinese'
  if (code === 'JP') return 'japanese'
  return 'english'
}

// Map BotLang → hunter.ts / enrichStatusMessage locale codes.
function hunterLang(lang: BotLang): 'zh-TW' | 'en' | 'ja' {
  if (lang === 'ja') return 'ja'
  if (lang === 'en') return 'en'
  return 'zh-TW'
}

// Map BotLang → toLocaleString locale codes.
function dateLocale(lang: BotLang): string {
  if (lang === 'ja') return 'ja-JP'
  if (lang === 'en') return 'en-US'
  return 'zh-TW'
}

function currentPeriod(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function nextPeriod(): string {
  const d = new Date()
  d.setMonth(d.getMonth() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

async function userHasNewsletter(userId: string): Promise<boolean> {
  const sb = createServiceClient()
  const { data } = await sb.from('users').select('role, granted_features').eq('id', userId).single()
  if (!data) return false
  if (data.role === 'super_admin') return true
  return (data.granted_features ?? []).includes('newsletter')
}

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`

// ── Telegram helpers ──────────────────────────────────────────────────────────

async function sendMessage(chatId: number, text: string, extra?: object): Promise<{ message_id: number } | null> {
  const payload = JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', ...extra })
  const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
  })
  if (res.status === 503) {
    // Notify user we're retrying (best-effort).
    // Note: sendMessage doesn't have a language context here, so we fall back to
    // zh defaults — these strings are infrastructure-level and rarely surfaced.
    await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: BOT_MESSAGES.zh.tgBusy, parse_mode: 'HTML' }),
    }).catch(() => {})
    await new Promise(r => setTimeout(r, 3000))
    const retry = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    }).catch(() => null)
    if (!retry?.ok) {
      await fetch(`${TELEGRAM_API}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: BOT_MESSAGES.zh.tgSendFailed, parse_mode: 'HTML' }),
      }).catch(() => {})
    }
    const retryData = await retry?.json().catch(() => null)
    return retryData?.result ?? null
  }
  const data = await res.json().catch(() => null)
  return data?.result ?? null
}

async function sendPhoto(chatId: number, photoUrl: string, caption?: string) {
  await fetch(`${TELEGRAM_API}/sendPhoto`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, photo: photoUrl, caption }),
  })
}

async function answerCallbackQuery(callbackQueryId: string, text?: string) {
  await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
  })
}

async function editMessageReplyMarkup(chatId: number, messageId: number) {
  await fetch(`${TELEGRAM_API}/editMessageReplyMarkup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } }),
  })
}

async function editMessageText(chatId: number, messageId: number, text: string, inlineKeyboard: object[][]) {
  await fetch(`${TELEGRAM_API}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: inlineKeyboard },
    }),
  }).catch(() => {})
}

// ── Session helpers ───────────────────────────────────────────────────────────

async function getSession(telegramId: number) {
  const supabase: OrgDb = orgScopedClient(systemOrgContext())
  const { data } = await supabase
    .from('bot_sessions')
    .select('state, context, last_contact_id')
    .eq('telegram_id', telegramId)
    .maybeSingle()
  return data as { state: string; context: Record<string, unknown>; last_contact_id: string | null } | null
}

async function setSession(telegramId: number, state: string, context: Record<string, unknown>) {
  const supabase: OrgDb = orgScopedClient(systemOrgContext())
  await supabase.from('bot_sessions').upsert(
    { telegram_id: telegramId, state, context, updated_at: new Date().toISOString() },
    { onConflict: 'org_id,telegram_id' }
  )
}

async function clearSession(telegramId: number) {
  // Upsert with null state/context to preserve last_contact_id
  const supabase: OrgDb = orgScopedClient(systemOrgContext())
  await supabase.from('bot_sessions').upsert(
    { telegram_id: telegramId, state: null, context: null, updated_at: new Date().toISOString() },
    { onConflict: 'org_id,telegram_id' }
  )
}

async function updateLastContact(telegramId: number, contactId: string) {
  const supabase: OrgDb = orgScopedClient(systemOrgContext())
  await supabase.from('bot_sessions').upsert(
    { telegram_id: telegramId, last_contact_id: contactId, updated_at: new Date().toISOString() },
    { onConflict: 'org_id,telegram_id' }
  )
}

// ── Auth helper ───────────────────────────────────────────────────────────────

async function getAuthorizedUser(telegramId: number) {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('users')
    .select('id, email, display_name, provider_token, role')
    .eq('telegram_id', telegramId)
    .single()
  return data as { id: string; email: string; display_name: string | null; provider_token: string | null; role: string | null } | null
}

// ── Download photo from Telegram ──────────────────────────────────────────────

async function downloadTelegramPhoto(fileId: string): Promise<Buffer> {
  const fileRes = await fetch(`${TELEGRAM_API}/getFile?file_id=${fileId}`)
  const fileData = await fileRes.json()
  const filePath = fileData.result.file_path
  const imgRes = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`)
  return Buffer.from(await imgRes.arrayBuffer())
}

// Telegram message text hard limit (chars). AI agent replies are truncated to fit.
const TELEGRAM_MAX_LEN = 4096

// Escape HTML special chars — sendMessage uses parse_mode=HTML, so free-form AI
// output (may contain <, >, &, e.g. "AT&T") would otherwise break Telegram parsing.
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ── Handle /AI ────────────────────────────────────────────────────────────────

async function handleAI(chatId: number, m: BotMessages) {
  // 名片辨識/指令解析用的模型是全組織設定（ai_feature_models 的 card_ocr_default），
  // 不再有個人層。顯示目前生效的組織模型：有指派則秀指派模型＋端點，否則秀系統預設。
  const orgCtx = systemOrgContext()
  const resolved = await resolveTouchpoint(orgCtx.orgId, 'card_ocr')
  if (resolved.source !== 'assigned') {
    await sendMessage(chatId, m.aiModelDefault(resolved.modelId))
    return
  }
  const { data } = await orgScopedClient(orgCtx)
    .from('ai_feature_models')
    .select('ai_models(display_name, model_id, ai_endpoints(name))')
    .eq('feature', 'card_ocr_default')
    .maybeSingle()
  const model = (data as unknown as { ai_models: { display_name: string; model_id: string; ai_endpoints: { name: string } | null } | null } | null)?.ai_models
  if (!model) {
    await sendMessage(chatId, m.aiModelDefault(resolved.modelId))
    return
  }
  const endpointName = (model.ai_endpoints as { name: string } | null)?.name ?? ''
  await sendMessage(chatId, m.aiModelInfo(model.display_name, model.model_id, endpointName))
}

// /ai <question> → Gemini function-calling agent as this user.
// 原本委派 src/lib/ai-agent.ts 的 runAgentLoop，但它沒有擴充工具的入口；
// 為了加上 chatbot 專屬的 request_social_briefing 工具，改在此本地跑同一套 loop
// （鏡射 src/app/api/ai-chat/route.ts：共用 TOOLS/executeTool + 本地 briefing 工具）。

const BOT_AGENT_MAX_TURNS = 6

// 與 src/app/api/ai-chat/route.ts 的 REQUEST_BRIEFING_TOOL 對齊
const REQUEST_BRIEFING_TOOL = {
  name: 'request_social_briefing',
  description: '為某位聯絡人排程一份「會議前 briefing」（背景搜尋此人與公司的最新公開動態）。回傳 briefing_id；結果稍後產生。當使用者說「我要跟某人開會 / 幫我了解某人近況」時用。',
  parameters: { type: 'object', properties: { contact_id: { type: 'string', description: '聯絡人 UUID（先用 search_contacts 找）' } }, required: ['contact_id'] },
}

// 稽核到 agent_actions（欄位與 ai-agent.ts / ai-chat 相同）。永不讓稽核失敗中斷主流程。
async function auditBotTool(toolName: string, args: unknown, succeeded: boolean, errMsg: string | null, actingAs: string): Promise<void> {
  try {
    await orgScopedClient(systemOrgContext()).from('agent_actions').insert({
      tool_name: toolName,
      arguments: args ?? null,
      result_summary: succeeded ? 'ok (bot)' : null,
      succeeded,
      error_message: errMsg,
      token_id: null,
      acting_as: actingAs,
    })
  } catch { /* never let logging break the call */ }
}

// bot 端工具執行：request_social_briefing 自己處理，其餘委派共用 executeTool。
// Telegram 沒有 auth.users session，created_by（FK → auth.users）存 null，
// 改以 notify_user_id 記錄要通知的 public.users.id。
async function executeBotTool(name: string, args: Record<string, unknown>, actingUserId: string): Promise<unknown> {
  if (name === 'request_social_briefing') {
    const contactId = args.contact_id as string | undefined
    if (!contactId) throw new Error('contact_id required')
    const service: OrgDb = orgScopedClient(systemOrgContext())
    // Dedup：同一聯絡人已有 pending/processing 的 briefing 就不重複排程
    const { data: existing } = await service
      .from('contact_briefings')
      .select('id, status')
      .eq('contact_id', contactId)
      .in('status', ['pending', 'processing'])
      .limit(1)
      .maybeSingle()
    if (existing) {
      return { briefing_id: existing.id, status: existing.status, note: '此聯絡人已有進行中的 briefing，不重複排程' }
    }
    const { data, error } = await service
      .from('contact_briefings')
      .insert({ contact_id: contactId, trigger: 'nl_command', created_by: null, notify_user_id: actingUserId })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    return { briefing_id: data.id, status: 'pending', note: 'briefing 已排程，稍後於聯絡人頁查看結果' }
  }
  // 寫入工具強制有 acting user
  const tool = TOOL_BY_NAME.get(name)
  if (tool?.write && !actingUserId) throw new Error('write tool requires an acting user')
  return await executeTool(name, args, actingUserId)
}

async function handleAiAgent(
  chatId: number,
  user: { id: string; email: string; display_name: string | null; provider_token: string | null; role: string | null },
  question: string,
  m: BotMessages,
) {
  // Module kill-switch (org-settings), mirrors the web route (/api/ai-chat).
  // Toggling the assistant off must also stop the Telegram agent path.
  if ((await getOrgSetting(createServiceClient(), 'ai_assistant_enabled')) === 'false') {
    await sendMessage(chatId, m.aiDisabled)
    return
  }
  await sendMessage(chatId, m.aiThinking)
  try {
    const resolved = await resolveTouchpoint(systemOrgContext().orgId, 'assistant')

    const today = new Date().toISOString().slice(0, 10)
    const systemInstruction = [
      '你是 myCRM 的 AI 助理，協助公司同仁查詢與維護 CRM 聯絡人、名單、標籤，並可排程會議前 briefing。',
      `目前使用者：${user.display_name ?? user.email}（${user.email}）。今天日期：${today}。`,
      '可用工具：搜尋/讀取/更新聯絡人、加筆記、列出名單與標籤、加入名單、標記標籤、排程 social briefing。',
      '更新聯絡人或加筆記前，先用 search_contacts/get_contact 確認對象。回答用使用者的語言（預設繁體中文），精簡明確。',
      '需要寫入操作時，先在回覆中說明你做了什麼。',
    ].join('\n')

    const declarations = [
      ...TOOLS.map((t) => ({ name: t.name, description: t.description, parameters: t.inputSchema })),
      REQUEST_BRIEFING_TOOL,
    ]

    // assistant 被指派到 kind='openai' 端點：走 OpenAI 相容 function-calling 迴圈，
    // 產出與 google 路等價的 reply，再共用同一輸出（截斷 + 送出）路徑。
    if (resolved.via === 'openai') {
      const { reply: oaReply } = await runOpenAiToolLoop({
        resolved,
        systemInstruction,
        history: [],
        latest: question,
        declarations,
        maxRounds: BOT_AGENT_MAX_TURNS,
        execute: (name, args) => executeBotTool(name, args, user.id),
        audit: (n, a, ok, e) => auditBotTool(n, a, ok, e, user.id),
        limitMessage: m.aiTooManySteps,
      })
      const reply = oaReply || m.aiEmptyReply
      const truncated = reply.length > TELEGRAM_MAX_LEN ? reply.slice(0, TELEGRAM_MAX_LEN - 1) + '…' : reply
      await sendMessage(chatId, escapeHtml(truncated))
      return
    }

    const apiKey = resolved.apiKey ?? process.env.GEMINI_API_KEY
    if (!apiKey) throw new Error(m.aiNotConfigured)
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({
      model: resolved.modelId,
      systemInstruction,
      tools: [{ functionDeclarations: declarations }] as unknown as Parameters<typeof genAI.getGenerativeModel>[0]['tools'],
    })

    const chat = model.startChat({ history: [] })
    let result = await chat.sendMessage(question)

    for (let round = 0; round < BOT_AGENT_MAX_TURNS; round++) {
      const calls = result.response.functionCalls()
      if (!calls || calls.length === 0) break

      const responses = []
      for (const call of calls) {
        let out: unknown
        let ok = true
        let errMsg: string | null = null
        try {
          out = await executeBotTool(call.name, (call.args ?? {}) as Record<string, unknown>, user.id)
        } catch (e) {
          ok = false
          errMsg = e instanceof Error ? e.message : String(e)
          out = { error: errMsg }
        }
        await auditBotTool(call.name, call.args, ok, errMsg, user.id)
        responses.push({ functionResponse: { name: call.name, response: { result: out } } })
      }
      result = await chat.sendMessage(responses)
    }

    // 跑滿 turns 後若模型仍想呼叫工具，response 可能只含 functionCall、無文字，
    // 直接 .text() 會丟錯或回空字串 → 回一個明確訊息。
    const pendingCalls = result.response.functionCalls()
    let reply: string
    if (pendingCalls && pendingCalls.length > 0) {
      reply = m.aiTooManySteps
    } else {
      try {
        reply = result.response.text()
      } catch {
        reply = m.aiEmptyReply
      }
    }
    const truncated = reply.length > TELEGRAM_MAX_LEN ? reply.slice(0, TELEGRAM_MAX_LEN - 1) + '…' : reply
    await sendMessage(chatId, escapeHtml(truncated))
  } catch (e) {
    await sendMessage(chatId, m.aiGenerateFailed(e instanceof Error ? e.message : m.unknownError))
  }
}

// ── Search contacts ───────────────────────────────────────────────────────────

interface ContactHit {
  id: string
  name: string | null
  company: string | null
  job_title: string | null
  email: string | null
  phone: string | null
  card_img_url: string | null
  card_img_back_url: string | null
}

async function searchContacts(query: string): Promise<ContactHit[]> {
  const supabase: OrgDb = orgScopedClient(systemOrgContext())
  const { data } = await supabase
    .from('contacts')
    .select('id, name, company, job_title, email, phone, card_img_url, card_img_back_url')
    .is('deleted_at', null)
    .or(`name.ilike.${orQuote(`%${query}%`)},company.ilike.${orQuote(`%${query}%`)},email.ilike.${orQuote(`%${query}%`)}`)
    .limit(5)
  return (data ?? []) as ContactHit[]
}

// ── Meeting helpers ────────────────────────────────────────────────────────────

function formatTaipeiRange(startIso: string, durationMinutes: number, m: BotMessages, lang: BotLang): string {
  const start = new Date(startIso)
  const end = new Date(start.getTime() + durationMinutes * 60000)
  const loc = dateLocale(lang)
  const fmt = (d: Date) => d.toLocaleString(loc, {
    timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric',
    weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  })
  const endTime = end.toLocaleString(loc, { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false })
  return m.meetTimeRange(`${fmt(start)} – ${endTime}`)
}

async function handleMeet(
  chatId: number,
  user: { id: string; email: string; display_name: string | null; provider_token: string | null; role: string | null },
  text: string,
  m: BotMessages,
  lang: BotLang,
) {
  const supabase = createServiceClient()
  const db: OrgDb = orgScopedClient(systemOrgContext())
  if (!text.trim()) {
    await sendMessage(chatId, m.meetUsage)
    return
  }

  await sendMessage(chatId, m.meetParsing)

  let parsed
  try {
    parsed = await parseMeetingCommand(text, new Date().toISOString())
  } catch {
    await sendMessage(chatId, m.meetParseFailed)
    return
  }

  // Resolve attendees (org members only)
  const attendeeEmails: string[] = []
  const attendeeNames: string[] = []
  if (parsed.attendees.length > 0) {
    const { data: members } = await supabase
      .from('users')
      .select('id, email, display_name')
      .or(parsed.attendees.map((a: string) => `display_name.ilike.${orQuote(`%${a}%`)},email.ilike.${orQuote(`%${a}%`)}`).join(','))
    for (const m of members ?? []) {
      if (m.email !== user.email) {
        attendeeEmails.push(m.email)
        attendeeNames.push(m.display_name || m.email)
      }
    }
  }

  const attendeeIds: string[] = []
  if (attendeeNames.length > 0) {
    const { data: members } = await supabase
      .from('users')
      .select('id, email')
      .in('email', attendeeEmails)
    attendeeIds.push(...(members ?? []).map((m: { id: string }) => m.id))
  }

  // Insert draft
  const endIso = new Date(new Date(parsed.start_iso).getTime() + parsed.duration_minutes * 60000).toISOString()
  const { data: draft, error: draftErr } = await db
    .from('meeting_drafts')
    .insert({
      created_by: user.id,
      title: parsed.title,
      start_at: parsed.start_iso,
      duration_minutes: parsed.duration_minutes,
      attendee_ids: attendeeIds,
      location: parsed.location,
      raw_text: text,
    })
    .select('id')
    .single()

  if (draftErr || !draft) {
    await sendMessage(chatId, m.meetSaveFailed)
    return
  }

  const timeLabel = formatTaipeiRange(parsed.start_iso, parsed.duration_minutes, m, lang)
  const allAttendees = [m.meetSelfLabel, ...attendeeNames]
  const confirmText =
    m.meetConfirmHeader +
    `<b>${m.meetFieldTitle}：</b>${parsed.title}\n` +
    `<b>${m.meetFieldTime}：</b>${timeLabel}\n` +
    `<b>${m.meetFieldDuration}：</b>${m.meetDurationLabel(parsed.duration_minutes)}\n` +
    `<b>${m.meetFieldAttendees}：</b>${allAttendees.join('、')}\n` +
    (parsed.location ? `<b>${m.meetFieldLocation}：</b>${parsed.location}\n` : '') +
    m.meetConfirmFooter

  await sendMessage(chatId, confirmText, {
    reply_markup: {
      inline_keyboard: [[
        { text: m.btnConfirmCreate, callback_data: `meet_confirm_${draft.id}` },
        { text: m.btnCancel, callback_data: `meet_cancel_${draft.id}` },
      ]],
    },
  })
}

// ── Handle /help ──────────────────────────────────────────────────────────────

async function handleHelp(chatId: number, m: BotMessages) {
  await sendMessage(chatId, m.help)
}

async function handleUser(chatId: number, m: BotMessages) {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('users')
    .select('display_name, email, telegram_id, teams_user_id')
    .order('created_at', { ascending: true })

  if (!data || data.length === 0) {
    await sendMessage(chatId, m.membersEmpty)
    return
  }

  const lines = data.map((u, i) => {
    const name = u.display_name || u.email
    const tg = u.telegram_id ? `✅ Telegram` : `⬜ Telegram`
    const teams = u.teams_user_id ? `✅ Teams` : `⬜ Teams`
    return `${i + 1}. <b>${name}</b>\n   📧 ${u.email}\n   ${tg} · ${teams}`
  })

  await sendMessage(chatId, m.membersHeader(data.length) + '\n\n' + lines.join('\n\n'))
}

// ── Handle /search ────────────────────────────────────────────────────────────

async function handleSearch(chatId: number, keyword: string, m: BotMessages, lang: BotLang) {
  const contacts = await searchContacts(keyword)
  if (contacts.length === 0) {
    await sendMessage(chatId, m.searchNotFound(keyword))
    return
  }
  const supabase = createServiceClient()

  for (const c of contacts) {
    const empty = m.cardEmptyValue
    const info =
      `👤 <b>${c.name || empty}</b>\n` +
      `🏢 ${c.company || empty}\n` +
      `💼 ${c.job_title || empty}\n` +
      `📧 ${c.email || empty}\n` +
      `📞 ${c.phone || empty}`

    const emailLabel = lang === 'ja' ? '✉️ メール' : lang === 'en' ? '✉️ Email' : '✉️ 發信'
    const noteLabel = lang === 'ja' ? '📝 メモ' : lang === 'en' ? '📝 Note' : '📝 筆記'
    const logLabel = lang === 'ja' ? '📋 記録' : lang === 'en' ? '📋 Logs' : '📋 互動紀錄'
    const buttons = [
      [
        { text: emailLabel, callback_data: `email_contact_${c.id}` },
        { text: noteLabel, callback_data: `note_contact_${c.id}` },
        { text: logLabel, callback_data: `log_contact_${c.id}_0` },
      ],
    ]

    await sendMessage(chatId, info, { reply_markup: { inline_keyboard: buttons } })

    if (c.card_img_url) await sendPhoto(chatId, await signCardUrl(supabase, c.card_img_url))
    if (c.card_img_back_url) await sendPhoto(chatId, await signCardUrl(supabase, c.card_img_back_url))
  }
}

// ── Process back card photo (shared by photo handler and confirm callback) ────

// ── /a: Add card photo — OCR → show diff → user decides ──────────────────────

async function processAddCardPhoto(
  chatId: number,
  fromId: number,
  user: { id: string },
  contactId: string,
  fileId: string,
  contactNameHint?: string,
  m?: BotMessages
) {
  const _m = m ?? BOT_MESSAGES.zh
  const supabase = createServiceClient()
  const orgCtx = systemOrgContext()
  const db: OrgDb = orgScopedClient(orgCtx)
  try {
    const imgBuffer = await downloadTelegramPhoto(fileId)
    let compressed = await processCardImage(imgBuffer)

    const { data: existing } = await db
      .from('contacts')
      .select('name, name_en, name_local, company, job_title, email, phone, second_phone, address, website')
      .eq('id', contactId)
      .single()

    await sendMessage(chatId, _m.cardOcring)
    const cardData = await analyzeBusinessCard(compressed)

    if (cardData.rotation) {
      const sharpLib = (await import('sharp')).default
      compressed = await sharpLib(compressed).rotate(cardData.rotation).jpeg({ quality: 85 }).toBuffer()
    }

    // Upload card image
    const safeName = (existing?.name || cardData.name || cardData.name_en || '').replace(/[\s,./\\]/g, '')
    const filename = await generateCardFilename({ name: safeName || undefined, side: 'front' })
    const storagePath = `${orgCtx.orgId}/cards/${filename}`
    const { error: uploadError } = await supabase.storage
      .from('cards').upload(storagePath, compressed, { contentType: 'image/jpeg', upsert: false })
    if (uploadError) throw new Error(uploadError.message ?? String(uploadError))

    const { data: publicUrlData } = supabase.storage.from('cards').getPublicUrl(storagePath)
    const cardUrl = publicUrlData.publicUrl

    // Compute diff
    const ocrFields: Record<string, string | undefined> = {
      name: cardData.name || undefined,
      name_en: cardData.name_en || undefined,
      name_local: cardData.name_local || undefined,
      company: cardData.company || cardData.company_en || undefined,
      job_title: cardData.job_title || undefined,
      email: cardData.email || undefined,
      phone: cardData.phone || undefined,
      second_phone: cardData.second_phone || undefined,
      address: cardData.address || undefined,
      website: cardData.website || undefined,
    }
    const toFill: Array<{ key: string; label: string; value: string }> = []
    const conflicts: Array<{ key: string; label: string; newVal: string; oldVal: string }> = []

    for (const [key, newVal] of Object.entries(ocrFields)) {
      if (!newVal) continue
      const oldVal = (existing as Record<string, unknown> | null)?.[key] as string | null | undefined
      if (!oldVal) toFill.push({ key, label: _m.cardFieldLabel(key), value: newVal })
      else if (oldVal !== newVal) conflicts.push({ key, label: _m.cardFieldLabel(key), newVal, oldVal })
    }

    // Build diff message
    const displayName = contactNameHint ?? existing?.name ?? _m.cardThisContact
    let diffText = _m.cardDiffHeader(displayName)
    if (toFill.length > 0) {
      diffText += _m.cardDiffFillHeader
      toFill.forEach(f => { diffText += _m.cardDiffFillRow(f.label, f.value) })
      diffText += '\n'
    }
    if (conflicts.length > 0) {
      diffText += _m.cardDiffConflictHeader
      conflicts.forEach(c => { diffText += _m.cardDiffConflictRow(c.label, c.newVal, c.oldVal) })
      diffText += '\n'
    }
    if (toFill.length === 0 && conflicts.length === 0) {
      diffText += _m.cardDiffNoChange
    }

    // Store in session for apply step
    await setSession(fromId, 'waiting_for_card_apply', {
      contact_id: contactId,
      contact_name: displayName,
      card_url: cardUrl,
      storage_path: storagePath,
      to_fill: toFill,
      conflicts,
    })

    await sendMessage(chatId, diffText, {
      reply_markup: {
        inline_keyboard: [[
          { text: _m.btnConfirmApply, callback_data: `apply_card_${contactId}` },
          { text: _m.btnSaveCardOnly, callback_data: `skip_card_apply_${contactId}` },
        ]]
      }
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[bot] add card error:', msg)
    await sendMessage(chatId, _m.processingFailed(msg))
  }
}

// ── Apply or skip card diff ────────────────────────────────────────────────────

async function applyCardDiff(
  chatId: number,
  fromId: number,
  contactId: string,
  apply: boolean,
  m: BotMessages,
) {
  const supabase: OrgDb = orgScopedClient(systemOrgContext())
  try {
    const session = await getSession(fromId)
    const ctx = session?.context ?? {}
    const cardUrl = ctx.card_url as string
    const storagePath = ctx.storage_path as string
    const displayName = ctx.contact_name as string | undefined
    const toFill = (ctx.to_fill as Array<{ key: string; label: string; value: string }>) ?? []
    const conflicts = (ctx.conflicts as Array<{ key: string; label: string; newVal: string; oldVal: string }>) ?? []

    if (!cardUrl) {
      await sendMessage(chatId, m.cardDiffSessionMissing)
      await clearSession(fromId)
      return
    }

    // Save to contact_cards
    await supabase.from('contact_cards').insert({
      contact_id: contactId,
      card_img_url: cardUrl,
      storage_path: storagePath,
      label: null,
    })

    if (apply && toFill.length > 0) {
      const updates: Record<string, string> = {}
      toFill.forEach(f => { updates[f.key] = f.value })
      await supabase.from('contacts').update(updates).eq('id', contactId)
    }

    if (apply && conflicts.length > 0) {
      const noteContent = conflicts
        .map(c => `${c.label}：${c.newVal}`)
        .join('\n')
      await supabase.from('interaction_logs').insert({
        contact_id: contactId,
        type: 'system',
        content: `【名片新資料】\n${noteContent}`,
      })
    }

    await updateLastContact(fromId, contactId)
    await clearSession(fromId)
    const applyMsg = apply
      ? m.cardDiffAppliedSummary(toFill.length, conflicts.length)
      : m.cardDiffSkippedSummary
    await sendMessage(chatId, m.cardSavedWithApply(displayName ?? m.cardThisContact, applyMsg))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await sendMessage(chatId, m.processingFailed(msg))
  }
}

// ── /p: Personal photo — compress + preserve EXIF + save ─────────────────────

async function processPersonalPhoto(
  chatId: number,
  fromId: number,
  contactId: string,
  fileIds: string[],
  contactNameHint?: string,
  note?: string,
  m?: BotMessages
) {
  const _m = m ?? BOT_MESSAGES.zh
  const supabase = createServiceClient()
  const orgCtx = systemOrgContext()
  const db: OrgDb = orgScopedClient(orgCtx)
  try {
    let uploaded = 0
    for (const fileId of fileIds) {
      const imgBuffer = await downloadTelegramPhoto(fileId)
      const compressed = await processPhotoWithExif(imgBuffer)
      const exif = await extractExif(imgBuffer)
      const filename = `${orgCtx.orgId}/photos/${Date.now()}-${contactId.slice(0, 8)}-${uploaded}.jpg`
      const { error: uploadError } = await supabase.storage
        .from('cards').upload(filename, compressed, { contentType: 'image/jpeg', upsert: false })
      if (uploadError) throw new Error(uploadError.message)
      const { data: publicUrlData } = supabase.storage.from('cards').getPublicUrl(filename)
      const { data: photoRow, error: photoErr } = await db.from('contact_photos').insert({
        contact_id: contactId,
        photo_url: publicUrlData.publicUrl,
        storage_path: filename,
        taken_at: exif.takenAt ?? null,
        latitude: exif.latitude ?? null,
        longitude: exif.longitude ?? null,
        location_name: exif.locationName ?? null,
        note: (note && fileIds.length === 1) ? note : null,
      }).select('id').single()
      if (photoErr || !photoRow) throw new Error(photoErr?.message ?? 'photo insert failed')
      // 多對多：同步建立一筆已確認的人臉標記（photo ↔ contact）
      const { error: faceErr } = await db.from('photo_faces').insert({
        photo_id: photoRow.id,
        contact_id: contactId,
        source: 'manual',
        status: 'confirmed',
      })
      if (faceErr) throw new Error(faceErr.message)
      uploaded++
    }

    if (note) {
      await db.from('interaction_logs').insert({
        contact_id: contactId,
        type: 'system',
        content: `【合照附註】${note}`,
      })
    }

    await updateLastContact(fromId, contactId)
    await clearSession(fromId)
    const displayName = contactNameHint ?? _m.cardThisContact
    const countMsg = fileIds.length > 1 ? ` ${fileIds.length}` : ''
    const noteMsg = note ? _m.photoNoteAttached : ''
    await sendMessage(chatId, _m.photoSaved(displayName, countMsg, noteMsg))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[bot] personal photo error:', msg)
    await sendMessage(chatId, _m.photoFailed(msg))
  }
}

// ── Handle photo (new card or back card) ──────────────────────────────────────

async function handlePhoto(
  chatId: number,
  fromId: number,
  user: { id: string; email: string; display_name: string | null; provider_token: string | null; role: string | null },
  photo: { file_id: string },
  session: { state: string; context: Record<string, unknown> } | null,
  m: BotMessages = BOT_MESSAGES.zh,
  lang: BotLang = 'zh',
) {
  const supabase = createServiceClient()
  const orgCtx = systemOrgContext()
  const db: OrgDb = orgScopedClient(orgCtx)

  // /a: Add card flow — confirmation step
  if (session?.state === 'waiting_for_add_card') {
    const contactId = session.context.contact_id as string
    const contactName = session.context.contact_name as string | undefined
    await setSession(fromId, 'waiting_for_add_card', { ...session.context, pending_file_id: photo.file_id })
    await sendMessage(chatId,
      m.cardReceivedAskAdd(contactName ?? m.cardThisContact),
      { reply_markup: { inline_keyboard: [[
        { text: m.btnConfirm, callback_data: `confirm_add_card_${contactId}` },
        { text: m.btnCancel, callback_data: 'cancel_add_card' },
      ]] } }
    )
    return
  }

  // /li: LinkedIn screenshot — OCR → confirm → insert contact
  if (session?.state === 'waiting_for_li') {
    await sendMessage(chatId, m.liAnalyzing)
    try {
      const imgBuffer = await downloadTelegramPhoto(photo.file_id)
      const compressed = await processCardImage(imgBuffer)

      const parsed = await parseLinkedInScreenshot(compressed)

      const displayName = parsed.name || parsed.name_en || m.liUnnamed
      if (!parsed.name && !parsed.name_en) {
        await clearSession(fromId)
        await sendMessage(chatId, m.liNotLinkedIn)
        return
      }

      const summary =
        m.liResultHeader +
        `👤 ${displayName}\n` +
        (parsed.job_title ? `💼 ${parsed.job_title}\n` : '') +
        (parsed.company ? `🏢 ${parsed.company}\n` : '') +
        (parsed.email ? `✉️ ${parsed.email}\n` : '') +
        (parsed.linkedin_url ? `🔗 ${parsed.linkedin_url}\n` : '') +
        (parsed.notes ? `\n📝 ${parsed.notes.slice(0, 100)}${parsed.notes.length > 100 ? '...' : ''}` : '')

      await setSession(fromId, 'waiting_for_li_confirm', { parsed, file_id: photo.file_id })
      await sendMessage(chatId, summary, {
        reply_markup: { inline_keyboard: [[
          { text: m.btnConfirmAdd, callback_data: 'confirm_li' },
          { text: m.btnCancel, callback_data: 'cancel_li' },
        ]] }
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await clearSession(fromId)
      await sendMessage(chatId, m.liFailed(msg))
    }
    return
  }

  // /b: Batch mode — fast path, no OCR yet, just upload + queue
  if (session?.state === 'batch_mode') {
    try {
      const imgBuffer = await downloadTelegramPhoto(photo.file_id)
      const compressed = await processCardImage(imgBuffer)
      const tmpFilename = await generateCardFilename()
      const storagePath = `${orgCtx.orgId}/cards/${tmpFilename}`
      const { error: uploadError } = await supabase.storage
        .from('cards')
        .upload(storagePath, compressed, { contentType: 'image/jpeg', upsert: false })
      if (uploadError) throw new Error(uploadError.message ?? String(uploadError))

      // Carry "where met" context from /b 描述 into each photo's pending row;
      // worker preserves these on OCR completion (see pending-ocr-worker.ts)
      const met = session.context?.met as { met_at: string | null; met_date: string | null; referred_by: string | null } | null | undefined
      const initialData: Record<string, unknown> = {}
      if (met?.met_at) initialData.met_at = met.met_at
      if (met?.met_date) initialData.met_date = met.met_date
      if (met?.referred_by) initialData.referred_by = met.referred_by

      const { data: pending, error: pendingError } = await db
        .from('pending_contacts')
        .insert({ data: initialData, created_by: user.id, storage_path: storagePath, status: 'pending' })
        .select('id')
        .single()
      if (pendingError || !pending) throw new Error(pendingError?.message ?? m.batchPendingFallback)

      const existingIds = (session.context?.pending_ids as string[] | undefined) ?? []
      const newIds = [...existingIds, pending.id]
      // Preserve met context (set by /b 描述) for subsequent photos in this batch
      await setSession(fromId, 'batch_mode', { ...session.context, count: newIds.length, pending_ids: newIds })
      await sendMessage(chatId, m.batchReceivedNth(newIds.length))

      // Fire OCR immediately in background — no need to wait for /done
      const rowForWorker = {
        id: pending.id,
        storage_path: storagePath,
        data: initialData,
        status: 'pending' as const,
        retry_count: 0,
        created_by: user.id,
      }
      after(async () => {
        const sb = createServiceClient()
        await processOnePending(sb, rowForWorker)
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await sendMessage(chatId, m.batchUploadFailed(msg))
    }
    return
  }

  // /news: photo arrives during collection — upload to newsletter-assets and append to draft
  if (session?.state === 'news_collecting') {
    const draftId = session.context.draft_id as string
    const period = session.context.period as string
    try {
      const buf = await downloadTelegramPhoto(photo.file_id)
      const compressed = await processCardImage(buf)
      const sb = createServiceClient()
      const key = `${orgCtx.orgId}/drafts/${period}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
      const { error: upErr } = await sb.storage.from('newsletter-assets').upload(key, compressed, {
        contentType: 'image/jpeg', upsert: false,
      })
      if (upErr) throw new Error(upErr.message)
      const url = sb.storage.from('newsletter-assets').getPublicUrl(key).data.publicUrl
      const { data: cur } = await db.from('newsletter_drafts').select('photo_urls').eq('id', draftId).single()
      const updated = [...(cur?.photo_urls ?? []), url]
      await db.from('newsletter_drafts').update({ photo_urls: updated }).eq('id', draftId)
      await sendMessage(chatId, m.newsPhotoAdded(updated.length))
    } catch (e) {
      await sendMessage(chatId, m.newsPhotoFailed(e instanceof Error ? e.message : m.unknownError))
    }
    return
  }

  // /p: Personal photo flow — accumulate multiple photos
  if (session?.state === 'waiting_for_photo') {
    const contactId = session.context.contact_id as string
    const contactName = session.context.contact_name as string | undefined
    const existingIds = (session.context.pending_file_ids as string[] | undefined) ?? []
    const newIds = [...existingIds, photo.file_id]
    const countMsgId = session.context.count_message_id as number | undefined
    const displayName = contactName ?? m.cardThisContact
    const doneText = m.photoDoneLabel(newIds.length)
    const keyboard = [[
      { text: doneText, callback_data: `done_photo_${contactId}` },
      { text: m.btnCancel, callback_data: 'cancel_photo' },
    ]]
    if (countMsgId) {
      await editMessageText(chatId, countMsgId,
        m.photoCountReceived(newIds.length, displayName),
        keyboard
      )
      await setSession(fromId, 'waiting_for_photo', { ...session.context, pending_file_ids: newIds })
    } else {
      const sent = await sendMessage(chatId,
        m.photoCountReceived(1, displayName),
        { reply_markup: { inline_keyboard: keyboard } }
      )
      await setSession(fromId, 'waiting_for_photo', { ...session.context, pending_file_ids: newIds, count_message_id: sent?.message_id })
    }
    return
  }


  // New card scan — check pending limit
  const { count: pendingCount } = await db
    .from('pending_contacts')
    .select('*', { count: 'exact', head: true })
    .eq('created_by', user.id)
  if ((pendingCount ?? 0) >= 5) {
    await sendMessage(chatId, m.cardPendingWarning(pendingCount ?? 0))
    return
  }

  await sendMessage(chatId, m.cardOcring)
  let storagePath: string | null = null
  let cardImgUrl: string | null = null
  try {
    const imgBuffer = await downloadTelegramPhoto(photo.file_id)
    const compressed = await processCardImage(imgBuffer)

    // Upload with temp name first so image is preserved even if OCR fails
    const tmpFilename = await generateCardFilename()
    storagePath = `${orgCtx.orgId}/cards/${tmpFilename}`
    const { error: uploadError } = await supabase.storage
      .from('cards')
      .upload(storagePath, compressed, { contentType: 'image/jpeg', upsert: false })
    if (uploadError) throw new Error(uploadError.message ?? String(uploadError))

    const { data: publicUrlData } = supabase.storage.from('cards').getPublicUrl(storagePath)
    cardImgUrl = publicUrlData.publicUrl

    // OCR
    const cardData = await analyzeBusinessCard(compressed)

    // Rotate and re-upload if Gemini detected non-zero rotation
    if (cardData.rotation) {
      const sharp = (await import('sharp')).default
      const rotated = await sharp(compressed).rotate(cardData.rotation).jpeg({ quality: 85 }).toBuffer()
      await supabase.storage.from('cards').update(storagePath, rotated, { contentType: 'image/jpeg' })
    }

    // Rename temp file to unified format with person name
    const personName = (cardData.name || cardData.name_en || '').replace(/[\s,./\\]/g, '')
    if (personName) {
      const namedFile = await generateCardFilename({ name: personName, side: 'front' })
      const namedPath = `${orgCtx.orgId}/cards/${namedFile}`
      const { error: moveErr } = await supabase.storage.from('cards').move(storagePath, namedPath)
      if (!moveErr) {
        storagePath = namedPath
        cardImgUrl = supabase.storage.from('cards').getPublicUrl(namedPath).data.publicUrl
      }
    }

    // Name fallback chain: name → name_en → name_local
    // Japanese/Korean cards often have ONLY name_local populated (kanji/hangul),
    // while name and name_en stay empty. Accept any of them.
    if (!cardData.name && cardData.name_en) cardData.name = cardData.name_en
    if (!cardData.name && cardData.name_local) cardData.name = cardData.name_local

    // If no name detected at all, save as failed scan and notify user
    if (!cardData.name) {
      await db.from('failed_scans').insert({
        user_id: user.id,
        storage_path: storagePath,
        card_img_url: cardImgUrl,
      })
      await sendMessage(chatId, m.cardOcrFailed)
      return
    }

    const { exact, similar } = await checkDuplicates({
      email: cardData.email,
      secondEmail: cardData.second_email,
      name: cardData.name,
      nameEn: cardData.name_en,
      nameLocal: cardData.name_local,
    })
    let dupWarning = ''
    let mergeTargetId: string | null = null
    let mergeTargetName: string | null = null
    let mergeTargetIsBounced = false
    if (exact.length > 0) {
      const e = exact[0]
      mergeTargetId = e.id
      mergeTargetName = e.name
      dupWarning += m.cardDupEmailExists(e.name ?? '', e.company ?? '')
    } else if (similar.length > 0) {
      const s = similar[0]
      mergeTargetId = s.id
      mergeTargetName = s.name
      dupWarning += m.cardDupSimilar(s.name ?? '', s.company ?? '')
    }

    // 同名偵測：若既有 contact 的 email 已是 bounced/invalid，且新名片有不同 email，
    // 標示出來鼓勵 user 點「換工作」按鈕（avoid 沿用壞 email）
    if (mergeTargetId) {
      const { data: targetRow } = await db
        .from('contacts')
        .select('email, email_status')
        .eq('id', mergeTargetId)
        .maybeSingle()
      if (
        targetRow?.email_status &&
        cardData.email &&
        cardData.email.trim().toLowerCase() !== (targetRow.email ?? '').trim().toLowerCase()
      ) {
        mergeTargetIsBounced = true
        dupWarning += m.cardDupBouncedHint(targetRow.email ?? '', targetRow.email_status)
      }
    }

    const contactPayload = {
      ...cardData,
      card_img_url: cardImgUrl,
      language: countryToLanguage(cardData.country_code),
      // hidden field for "merge to existing" flow; stripped before INSERT contacts
      _merge_target_id: mergeTargetId,
    }
    const { data: pending, error: pendingError } = await db
      .from('pending_contacts')
      .insert({ data: contactPayload, created_by: user.id, storage_path: storagePath })
      .select('id')
      .single()
    if (pendingError || !pending) throw new Error(pendingError?.message ?? m.batchPendingFallback)

    let countryDisplay = m.cardEmptyValue
    if (cardData.country_code) {
      // Pick localized country name column per bot language; fall back to zh.
      const nameCol = lang === 'ja' ? 'name_ja' : lang === 'en' ? 'name_en' : 'name_zh'
      const { data: countryRow } = await supabase
        .from('countries')
        .select(`emoji, ${nameCol}, name_zh`)
        .eq('code', cardData.country_code)
        .single()
      const row = countryRow as Record<string, unknown> | null
      const localized = (row?.[nameCol] as string | null) ?? (row?.name_zh as string | null)
      countryDisplay = row
        ? `${row.emoji ?? ''} ${localized ?? cardData.country_code}`.trim()
        : cardData.country_code
    }

    const empty = m.cardEmptyValue
    const resultText =
      m.cardOcrResultHeader +
      m.cardFieldLine('👤', m.cardResultName, cardData.name || empty) +
      m.cardFieldLine('🏢', m.cardResultCompany, cardData.company || empty) +
      m.cardFieldLine('💼', m.cardResultJobTitle, cardData.job_title || empty) +
      m.cardFieldLine('📧', m.cardResultEmail, cardData.email || empty) +
      m.cardFieldLine('📞', m.cardResultPhone, cardData.phone || empty) +
      `🌍 ${m.cardResultCountry}：${countryDisplay}` +
      dupWarning +
      m.cardConfirmPrompt

    // Build buttons: when dup detected, offer merge/replace options.
    // 換工作 case (mergeTargetIsBounced): surface the replace button FIRST so
    // user one-click updates the dead email instead of stacking another orphan.
    const cardButtons: Array<Array<{ text: string; callback_data?: string; url?: string }>> = []
    if (mergeTargetId && mergeTargetName && mergeTargetIsBounced) {
      cardButtons.push([
        { text: m.btnUpdateEmail(mergeTargetName), callback_data: `replace_${pending.id}` },
      ])
    }
    cardButtons.push([
      { text: mergeTargetId ? m.btnSaveNewAnyway : m.btnConfirmSave, callback_data: `save_${pending.id}` },
    ])
    if (mergeTargetId && mergeTargetName) {
      cardButtons.push([
        { text: m.btnMergeInto(mergeTargetName), callback_data: `merge_${pending.id}` },
      ])
      if (!mergeTargetIsBounced) {
        cardButtons.push([
          { text: m.btnReplaceJob(mergeTargetName), callback_data: `replace_${pending.id}` },
        ])
      }
      // URL button → open the existing contact so the user can review before
      // deciding which merge action to take. Telegram requires an absolute URL.
      const baseUrl = await resolveAppUrl()
      cardButtons.push([
        { text: m.btnViewExisting(mergeTargetName), url: `${baseUrl}/contacts/${mergeTargetId}` },
      ])
    }
    cardButtons.push([{ text: m.btnNotSave, callback_data: `cancel_${pending.id}` }])

    await sendMessage(chatId, resultText, {
      reply_markup: { inline_keyboard: cardButtons },
    })
  } catch (err) {
    const msg = err instanceof Error
      ? err.message
      : (typeof err === 'object' && err !== null ? JSON.stringify(err) : String(err))
    console.error('[bot] photo processing error type:', typeof err, err instanceof Error ? 'Error' : 'non-Error')
    console.error('[bot] photo processing error JSON:', JSON.stringify(err))
    console.error('[bot] photo processing error msg:', msg)
    // Save to failed_scans if image was already uploaded
    if (storagePath && cardImgUrl) {
      const { error: fsErr } = await db.from('failed_scans').insert({
        user_id: user.id,
        storage_path: storagePath,
        card_img_url: cardImgUrl,
      })
      if (fsErr) console.error('[bot] failed_scans insert error:', fsErr.message)
    } else {
      console.error('[bot] no storagePath/cardImgUrl — skipping failed_scans insert. storagePath:', storagePath, 'cardImgUrl:', cardImgUrl)
    }
    await sendMessage(chatId, m.processingFailed(msg))
  }
}

// ── Handle /work ──────────────────────────────────────────────────────────────

async function handleWork(
  chatId: number,
  user: { id: string; email: string; display_name: string | null; provider_token: string | null; role: string | null },
  naturalText: string,
  lastContactId: string | null | undefined,
  m: BotMessages,
  lang: BotLang,
) {
  const supabase = createServiceClient()
  const db: OrgDb = orgScopedClient(systemOrgContext())
  await sendMessage(chatId, m.taskParsing)

  let parsed
  try {
    parsed = await parseTaskCommand(naturalText, new Date().toISOString())
  } catch {
    await sendMessage(chatId, m.taskParseFailed)
    return
  }

  // Resolve contact: task text > session last_contact_id
  let resolvedContactId: string | null = lastContactId ?? null
  let contactName: string | undefined
  let contactCompany: string | undefined

  if (parsed.contact_name) {
    const { data: found } = await db
      .from('contacts')
      .select('id, name, company')
      .ilike('name', `%${parsed.contact_name}%`)
      .limit(1)
      .maybeSingle()
    if (found) {
      resolvedContactId = found.id
      contactName = found.name ?? undefined
      contactCompany = found.company ?? undefined
    }
  }

  if (!contactName && resolvedContactId) {
    const { data: contact } = await db
      .from('contacts').select('name, company').eq('id', resolvedContactId).single()
    if (contact?.name) {
      contactName = contact.name
      contactCompany = contact.company ?? undefined
    }
  }

  const contactLine = contactName ? m.taskContactLine(contactName, contactCompany ?? '') : ''

  // Resolve assignees from users table
  const assigneeEmails: string[] = []
  const assigneeNames: string[] = []
  for (const name of parsed.assignees) {
    const { data: found } = await supabase
      .from('users')
      .select('email, display_name, telegram_id')
      .or(`display_name.ilike.${orQuote(`%${name}%`)},email.ilike.${orQuote(`%${name}%`)}`)
      .limit(1)
      .single()
    if (found) {
      assigneeEmails.push(found.email)
      assigneeNames.push(found.display_name ?? found.email)
    }
  }

  // Self-reminder if no assignees found / specified
  const isSelfReminder = assigneeEmails.length === 0
  if (isSelfReminder) {
    assigneeEmails.push(user.email)
    assigneeNames.push(m.taskSelfReminderLabel)
  }

  // Create task
  const { data: task, error } = await db
    .from('tasks')
    .insert({
      title: parsed.title,
      due_at: parsed.due_at ?? null,
      created_by: user.email,
      contact_id: resolvedContactId,
    })
    .select('id')
    .single()

  if (error || !task) {
    await sendMessage(chatId, m.taskSaveFailed)
    return
  }

  // Create task_assignees
  for (const email of assigneeEmails) {
    await db.from('task_assignees').insert({ task_id: task.id, assignee_email: email })
  }

  // Notify assignees via Telegram + Teams
  const { data: notifyUsers } = await supabase
    .from('users')
    .select('email, display_name, telegram_id, teams_conversation_id, teams_service_url')
    .in('email', assigneeEmails)

  const appUrl = await resolveAppUrl()

  for (const au of notifyUsers ?? []) {
    if (au.email === user.email) continue

    // Telegram notification. Look up the assignee's bot language so the
    // notification reaches them in their preferred locale, not the assigner's.
    if (au.telegram_id) {
      const assigneeLang = await getBotLanguage({ id: au.telegram_id }, supabase)
      const am = BOT_MESSAGES[assigneeLang]
      const tgExtra: Record<string, unknown> = {
        reply_markup: {
          inline_keyboard: [[
            { text: am.taskBtnMarkDone, callback_data: `task_done_${task.id}` },
            ...(appUrl ? [{ text: am.taskBtnManage, url: `${appUrl}/tasks` }] : []),
          ]],
        },
      }
      const dueLine = parsed.due_at
        ? am.taskDueLabel(new Date(parsed.due_at).toLocaleString(dateLocale(assigneeLang), { timeZone: 'Asia/Taipei' })) + '\n'
        : ''
      await sendMessage(au.telegram_id,
        am.taskAssignedNotice(
          parsed.title,
          contactLine,
          dueLine,
          user.display_name ?? user.email.split('@')[0],
        ),
        tgExtra
      )
    }

    // Teams notification
    if (au.teams_conversation_id && au.teams_service_url) {
      try {
        await sendTeamsTaskNotification(au.teams_service_url, au.teams_conversation_id, {
          title: parsed.title,
          due_at: parsed.due_at ?? null,
          task_id: task.id,
          app_url: appUrl,
          contact_name: contactName,
          contact_company: contactCompany ?? undefined,
        })
      } catch (e) {
        console.error('[Teams] notification failed:', e)
      }
    }
  }

  const dueLine = parsed.due_at
    ? '\n' + m.taskDueLabel(new Date(parsed.due_at).toLocaleString(dateLocale(lang), { timeZone: 'Asia/Taipei' }))
    : ''

  await sendMessage(chatId,
    isSelfReminder
      ? m.taskCreatedSelf(parsed.title, contactLine, dueLine)
      : m.taskCreatedAssigned(assigneeNames.join('、'), parsed.title, contactLine, dueLine)
  )
}

// ── Handle /met ───────────────────────────────────────────────────────────────

async function handleMet(
  chatId: number,
  user: { id: string; email: string },
  count: number,
  description: string,
  m: BotMessages = BOT_MESSAGES.zh
) {
  const supabase: OrgDb = orgScopedClient(systemOrgContext())
  const nowIso = new Date().toISOString()

  await sendMessage(chatId, m.aiAnalyzing)
  let parsed
  try {
    parsed = await parseMetCommand(description, nowIso)
  } catch (e) {
    console.error('[bot] parseMetCommand error:', e)
    await sendMessage(chatId, m.aiParseFailed)
    return
  }

  // Fetch most recent N contacts created by this user
  const { data } = await supabase
    .from('contacts')
    .select('id, name, company')
    .eq('created_by', user.id)
    .order('created_at', { ascending: false })
    .limit(count)
  const contacts = (data ?? []) as { id: string; name: string | null; company: string | null }[]

  if (!contacts || contacts.length === 0) {
    await sendMessage(chatId, m.metContactNotFound)
    return
  }

  const metDateStr = parsed.met_date
  const metAtStr = parsed.met_at ?? m.metOccasionUnspecified
  const referredStr = parsed.referred_by ? `\n${m.metFieldReferrer}：${parsed.referred_by}` : ''

  const empty = m.cardEmptyValue
  const contactList = contacts.map((c, i) => `${i + 1}. ${c.name ?? empty}（${c.company ?? empty}）`).join('\n')

  const confirmMsg =
    m.metContactsHeader(contacts.length) +
    `${m.metFieldOccasion}：${metAtStr}\n${m.metFieldDate}：${metDateStr}${referredStr}\n\n` +
    `${contactList}`

  // Store context in session (Telegram callback_data has 64-byte limit)
  await setSession(chatId, 'waiting_met_confirm', {
    contact_ids: contacts.map((c) => c.id),
    met_at: parsed.met_at,
    met_date: metDateStr,
    referred_by: parsed.referred_by,
  })

  await sendMessage(chatId, confirmMsg, {
    reply_markup: {
      inline_keyboard: [[
        { text: m.btnConfirmApply, callback_data: 'met_confirm' },
        { text: m.btnCancel, callback_data: 'met_cancel' },
      ]],
    },
  })
}

// ── /v <name> <note>: one-shot visit logging ──────────────────────────────────

// AI 解析內容（日期/時間/地點/類型）後直接寫入 interaction_logs 並回覆確認。
async function logVisitOneShot(
  chatId: number,
  user: { id: string },
  contactId: string,
  contactName: string | null,
  noteText: string,
  m: BotMessages,
) {
  const supabase: OrgDb = orgScopedClient(systemOrgContext())
  await sendMessage(chatId, m.aiAnalyzing)

  let logType: 'note' | 'meeting' = 'meeting'
  let meetingDate: string | null = null
  let meetingTime: string | null = null
  let meetingLocation: string | null = null
  try {
    const parsed = await parseVisitNote(noteText, new Date().toISOString())
    logType = parsed.type
    meetingDate = parsed.meeting_date ?? null
    meetingTime = parsed.meeting_time ?? null
    meetingLocation = parsed.meeting_location ?? null
  } catch { /* AI 解析失敗 → 存為無日期地點的拜訪紀錄 */ }

  await supabase.from('interaction_logs').insert({
    contact_id: contactId,
    type: logType,
    content: noteText,
    meeting_date: meetingDate,
    meeting_time: meetingTime,
    meeting_location: meetingLocation,
    created_by: user.id,
  })

  const detailParts: string[] = []
  if (meetingDate) detailParts.push(`📅 ${meetingDate}${meetingTime ? ` ${meetingTime}` : ''}`)
  if (meetingLocation) detailParts.push(`📍 ${meetingLocation}`)
  const detail = detailParts.length > 0 ? `\n${detailParts.join('  ')}` : ''
  await sendMessage(chatId, m.noteSavedWithDetail(contactName, logType === 'meeting', detail))
}

// ── Handle /tasks ─────────────────────────────────────────────────────────────

async function handleTasks(
  chatId: number,
  user: { id: string; email: string; display_name: string | null; provider_token: string | null; role: string | null },
  m: BotMessages,
  lang: BotLang,
) {
  const supabase: OrgDb = orgScopedClient(systemOrgContext())

  // Tasks assigned to me
  const { data: assignedRows } = await supabase
    .from('task_assignees')
    .select('task_id')
    .eq('assignee_email', user.email)

  const assignedIds = (assignedRows ?? []).map((r: { task_id: string }) => r.task_id)

  // Query tasks: assigned to me OR created by me, status = pending
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, title, due_at, created_by, status')
    .eq('status', 'pending')
    .or(`created_by.eq.${user.email},id.in.(${assignedIds.length > 0 ? assignedIds.join(',') : 'null'})`)
    .order('due_at', { ascending: true, nullsFirst: false })
    .limit(10)

  if (!tasks || tasks.length === 0) {
    await sendMessage(chatId, m.todosEmpty)
    return
  }

  for (const task of tasks) {
    const dueStr = task.due_at
      ? m.taskDueLabel(new Date(task.due_at).toLocaleString(dateLocale(lang), { timeZone: 'Asia/Taipei' }))
      : m.taskDueNone
    const isAssignedToMe = assignedIds.includes(task.id)
    const roleStr = task.created_by === user.email && !isAssignedToMe ? m.taskRoleCreated : m.taskRoleAssigned

    await sendMessage(chatId,
      `📋 <b>${task.title}</b> ${roleStr}\n${dueStr}`,
      {
        reply_markup: {
          inline_keyboard: [[
            { text: m.taskBtnDone, callback_data: `task_done_${task.id}` },
            { text: m.taskBtnPostpone, callback_data: `task_postpone_${task.id}` },
            { text: m.taskBtnCancel, callback_data: `task_cancel_${task.id}` },
          ]],
        },
      }
    )
  }
}

// ── Handle text messages ──────────────────────────────────────────────────────

async function handleText(
  chatId: number,
  fromId: number,
  user: { id: string; email: string; display_name: string | null; provider_token: string | null; role: string | null },
  text: string,
  session: { state: string; context: Record<string, unknown>; last_contact_id: string | null } | null,
  m: BotMessages,
  lang: BotLang,
) {
  const supabase = createServiceClient()
  const db: OrgDb = orgScopedClient(systemOrgContext())

  const cmd = text.trim()

  // ── Clear active session on any slash command (must run before all handlers)
  // Exception: /done and /cancel need to READ the current session to act on it
  // (e.g., /done finishes batch_mode, /cancel exits whatever state we're in).
  const stateAware = /^\/(done|cancel)\b/.test(cmd)
  if (cmd.startsWith('/') && session?.state && !stateAware) {
    await clearSession(fromId)
    session = null
  }

  // ── /help /h ───────────────────────────────────────────────────────────────
  if (cmd === '/help' || cmd === '/h') {
    await handleHelp(chatId, m)
    return
  }

  // ── /lang ──────────────────────────────────────────────────────────────────
  if (cmd.startsWith('/lang')) {
    const arg = cmd.replace('/lang', '').trim().toLowerCase()
    const langMap: Record<string, string> = { zh: 'chinese', en: 'english', ja: 'japanese' }
    const langLabel: Record<string, string> = { zh: '繁體中文', en: 'English', ja: '日本語' }
    if (!langMap[arg]) {
      await sendMessage(chatId, m.langInvalid)
      return
    }
    await supabase.from('users').update({ language: langMap[arg] }).eq('telegram_id', fromId)
    // Reply in the newly selected language
    const newM = BOT_MESSAGES[arg as keyof typeof BOT_MESSAGES]
    await sendMessage(chatId, newM.langChanged(langLabel[arg]))
    return
  }

  // ── /stop — maintenance mode (super_admin only) ────────────────────────────
  if (cmd === '/stop' || cmd === '/stop off') {
    if (user.role !== 'super_admin') {
      await sendMessage(chatId, m.adminOnly)
      return
    }
    const enable = cmd === '/stop'
    await supabase.from('system_settings').update({ value: enable ? 'true' : 'false', updated_at: new Date().toISOString(), updated_by: user.id }).eq('key', 'maintenance_mode')
    if (enable) {
      await sendMessage(chatId, m.maintenanceOn)
    } else {
      await sendMessage(chatId, m.maintenanceOff)
    }
    return
  }

  // ── /user /u ───────────────────────────────────────────────────────────────
  if (cmd === '/user' || cmd === '/u') {
    await handleUser(chatId, m)
    return
  }

  // ── /ai ────────────────────────────────────────────────────────────────────
  // `/ai <question>` → AI agent Q&A; bare `/ai` → show current model (old behavior).
  const aiMatch = cmd.match(/^\/ai(?:\s+([\s\S]+))?$/i)
  if (aiMatch) {
    const question = aiMatch[1]?.trim()
    if (question) {
      await handleAiAgent(chatId, user, question, m)
    } else {
      await handleAI(chatId, m)
    }
    return
  }

  // ── /search /s ─────────────────────────────────────────────────────────────
  const searchMatch = cmd.match(/^\/(?:search|s)\s+(.+)/)
  if (searchMatch) {
    await handleSearch(chatId, searchMatch[1].trim(), m, lang)
    return
  }

  // ── /email /e ──────────────────────────────────────────────────────────────
  if (cmd === '/email' || cmd === '/e') {
    const lastContactId = session?.last_contact_id
    if (lastContactId) {
      const { data: lastContact } = await db
        .from('contacts').select('id, name, company, email').eq('id', lastContactId).single()
      if (lastContact) {
        await sendMessage(chatId,
          m.emailLastContactAsk(lastContact.name ?? '', lastContact.company ?? ''),
          { reply_markup: { inline_keyboard: [[
            { text: m.btnYesThatOne, callback_data: `use_last_email_${lastContactId}` },
            { text: m.btnSearchOther, callback_data: 'search_other_email' },
          ]] } }
        )
        return
      }
    }
    await setSession(fromId, 'waiting_contact_for_email', {})
    await sendMessage(chatId, m.emailEnterContactQuery)
    return
  }

  // ── Session: waiting_contact_for_email ────────────────────────────────────
  if (session?.state === 'waiting_contact_for_email') {
    if (cmd.startsWith('/')) {
      await clearSession(fromId)
    } else {
      const contacts = await searchContacts(text.trim())
      if (contacts.length === 0) {
        await sendMessage(chatId, m.searchNotFoundTry)
      } else if (contacts.length === 1) {
        await setSession(fromId, 'waiting_email_method', {
          contact_id: contacts[0].id,
          contact_name: contacts[0].name,
          contact_email: contacts[0].email,
        })
        await sendMessage(chatId,
          m.emailRecipientPrompt(contacts[0].name ?? '', contacts[0].email || m.emailEmptyEmailLabel),
          { reply_markup: { inline_keyboard: [[
            { text: m.emailBtnTemplate, callback_data: 'email_method_1' },
            { text: m.emailBtnAI, callback_data: 'email_method_2' },
          ]] } }
        )
      } else {
        const buttons = contacts.map((c) => [{
          text: `${c.name}（${c.company ?? ''}）`,
          callback_data: `select_email_contact_${c.id}`,
        }])
        await sendMessage(chatId, m.noteFoundContactSelect, { reply_markup: { inline_keyboard: buttons } })
      }
      return
    }
  }

  // ── Session: waiting_email_description ───────────────────────────────────
  if (session?.state === 'waiting_email_description') {
    if (cmd.startsWith('/')) { await clearSession(fromId) } else {
    await sendMessage(chatId, m.aiGenerating)
    try {
      const body = await generateEmailContent(text.trim())
      const subject = `${m.emailSubjectPrefix}${text.trim().slice(0, 40)}${text.trim().length > 40 ? '...' : ''}`
      const preview = body.text.replace(/<[^>]+>/g, '').slice(0, 200)

      await setSession(fromId, 'waiting_email_confirm', {
        ...session.context,
        subject,
        body_html: body.text,
      })
      await sendMessage(chatId,
        m.emailPreview(subject, preview, preview.length >= 200),
        { reply_markup: { inline_keyboard: [[
          { text: m.emailBtnConfirmSend, callback_data: 'confirm_email' },
          { text: m.btnCancel, callback_data: 'cancel_email' },
        ]] } }
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await sendMessage(chatId, m.aiGenerateFailed(msg))
    }
    return
    } // end command escape
  }

  // ── Session: waiting_email_supplement ─────────────────────────────────────
  if (session?.state === 'waiting_email_supplement') {
    if (cmd.startsWith('/')) { await clearSession(fromId) } else {
    await sendMessage(chatId, m.aiGenerating)
    try {
      const templateContent = session.context.template_body as string
      const supplement = text.trim().toLowerCase() === 'skip' ? '' : text.trim()
      // Fallback prompt when user types "skip" — instruct AI to generate from template alone.
      // Use English here since it's an instruction for the AI, not the user.
      const body = await generateEmailContent(supplement || 'Generate per the template', templateContent)
      const subject = session.context.template_subject as string || m.emailSubjectNone
      const preview = body.text.replace(/<[^>]+>/g, '').slice(0, 200)

      await setSession(fromId, 'waiting_email_confirm', {
        ...session.context,
        subject,
        body_html: body.text,
      })
      await sendMessage(chatId,
        m.emailPreview(subject, preview, preview.length >= 200),
        { reply_markup: { inline_keyboard: [[
          { text: m.emailBtnConfirmSend, callback_data: 'confirm_email' },
          { text: m.btnCancel, callback_data: 'cancel_email' },
        ]] } }
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await sendMessage(chatId, m.aiGenerateFailed(msg))
    }
    return
    } // end command escape
  }

  // ── Session: waiting_for_photo_note ───────────────────────────────────────
  if (session?.state === 'waiting_for_photo_note') {
    if (cmd.startsWith('/')) { await clearSession(fromId) } else {
    const contactId = session.context.contact_id as string
    const fileIds = (session.context.pending_file_ids as string[] | undefined) ?? []
    const contactNameHint = session.context.contact_name as string | undefined
    await sendMessage(chatId, m.photoUploading)
    await processPersonalPhoto(chatId, fromId, contactId, fileIds, contactNameHint, text.trim(), m)
    return
    } // end command escape
  }

  // ── Session: waiting_for_note_contact ─────────────────────────────────────
  if (session?.state === 'waiting_for_note_contact') {
    if (cmd.startsWith('/')) { await clearSession(fromId) } else {
    const contacts = await searchContacts(text.trim())
    if (contacts.length === 0) {
      await setSession(fromId, 'waiting_for_note_content', { contact_id: null })
      await sendMessage(chatId, m.noteContactNotFound)
    } else if (contacts.length === 1) {
      await setSession(fromId, 'waiting_for_note_content', { contact_id: contacts[0].id, contact_name: contacts[0].name })
      await sendMessage(chatId, m.noteContactFound(contacts[0].name ?? '', contacts[0].company ?? ''))
    } else {
      const buttons = contacts.map((c) => [{ text: `${c.name}（${c.company ?? ''}）`, callback_data: `select_contact_${c.id}` }])
      await sendMessage(chatId, m.noteFoundContactSelect, { reply_markup: { inline_keyboard: buttons } })
    }
    return
    } // end command escape
  }

  // ── Session: waiting_for_note_content ─────────────────────────────────────
  if (session?.state === 'waiting_for_note_content') {
    if (cmd.startsWith('/')) { await clearSession(fromId) } else {
    const contactId = session.context.contact_id as string | null
    const contactName = session.context.contact_name as string | undefined

    let logType: 'note' | 'meeting' = 'note'
    let meetingDate: string | null = null
    let meetingTime: string | null = null
    let meetingLocation: string | null = null

    try {
      const parsed = await parseVisitNote(text.trim(), new Date().toISOString())
      logType = parsed.type
      meetingDate = parsed.meeting_date ?? null
      meetingTime = parsed.meeting_time ?? null
      meetingLocation = parsed.meeting_location ?? null
    } catch { /* fall back to plain note */ }

    await db.from('interaction_logs').insert({
      contact_id: contactId ?? null,
      type: logType,
      content: text.trim(),
      meeting_date: meetingDate,
      meeting_time: meetingTime,
      meeting_location: meetingLocation,
      created_by: user.id,
    })
    await clearSession(fromId)

    const detailParts: string[] = []
    if (meetingDate) detailParts.push(`📅 ${meetingDate}${meetingTime ? ` ${meetingTime}` : ''}`)
    if (meetingLocation) detailParts.push(`📍 ${meetingLocation}`)
    const detail = detailParts.length > 0 ? `\n${detailParts.join('  ')}` : ''

    await sendMessage(chatId, m.noteSavedWithDetail(contactName ?? null, logType === 'meeting', detail))
    return
    } // end command escape
  }

  // ── Session: waiting_for_visit_contact ────────────────────────────────────
  if (session?.state === 'waiting_for_visit_contact') {
    if (cmd.startsWith('/')) { await clearSession(fromId) } else {
    const contacts = await searchContacts(text.trim())
    if (contacts.length === 0) {
      await setSession(fromId, 'waiting_for_visit_datetime', { contact_id: null, contact_name: null })
      await sendMessage(chatId, m.visitContactNotFound)
    } else if (contacts.length === 1) {
      await setSession(fromId, 'waiting_for_visit_datetime', { contact_id: contacts[0].id, contact_name: contacts[0].name })
      await sendMessage(chatId, m.visitContactFound(contacts[0].name ?? '', contacts[0].company ?? ''))
    } else {
      const buttons = contacts.map((c) => [{ text: `${c.name}（${c.company ?? ''}）`, callback_data: `select_visit_contact_${c.id}` }])
      await sendMessage(chatId, m.noteFoundContactSelect, { reply_markup: { inline_keyboard: buttons } })
    }
    return
    } // end command escape
  }

  // ── Session: waiting_for_visit_datetime ───────────────────────────────────
  if (session?.state === 'waiting_for_visit_datetime') {
    if (cmd.startsWith('/')) { await clearSession(fromId) } else {
    // Accept zh "略過", ja "スキップ", or "skip" (case-insensitive)
    const trimmed = text.trim()
    const skip = trimmed === '略過' || trimmed === 'スキップ' || trimmed.toLowerCase() === 'skip'
    let meetingDate: string | null = null
    let meetingTime: string | null = null
    if (!skip) {
      const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})(?:\s+(\d{2}:\d{2}))?/)
      if (match) {
        meetingDate = match[1]
        meetingTime = match[2] ?? null
      } else {
        await sendMessage(chatId, m.visitDatetimeInvalid)
        return
      }
    }
    await setSession(fromId, 'waiting_for_visit_location', {
      ...session.context,
      meeting_date: meetingDate,
      meeting_time: meetingTime,
    })
    await sendMessage(chatId, m.visitEnterLocation)
    return
    } // end command escape
  }

  // ── Session: waiting_for_visit_location ───────────────────────────────────
  if (session?.state === 'waiting_for_visit_location') {
    if (cmd.startsWith('/')) { await clearSession(fromId) } else {
    const trimmed = text.trim()
    const skip = trimmed === '略過' || trimmed === 'スキップ' || trimmed.toLowerCase() === 'skip'
    await setSession(fromId, 'waiting_for_visit_content', {
      ...session.context,
      meeting_location: skip ? null : trimmed,
    })
    await sendMessage(chatId, m.visitEnterContent)
    return
    } // end command escape
  }

  // ── Session: waiting_for_visit_content ────────────────────────────────────
  if (session?.state === 'waiting_for_visit_content') {
    if (cmd.startsWith('/')) { await clearSession(fromId) } else {
    const ctx = session.context as {
      contact_id: string | null
      contact_name: string | null
      meeting_date: string | null
      meeting_time: string | null
      meeting_location: string | null
    }
    await db.from('interaction_logs').insert({
      contact_id: ctx.contact_id ?? null,
      type: 'meeting',
      content: text.trim(),
      meeting_date: ctx.meeting_date,
      meeting_time: ctx.meeting_time,
      meeting_location: ctx.meeting_location,
      created_by: user.id,
    })
    await clearSession(fromId)
    const parts: string[] = []
    if (ctx.meeting_date) parts.push(`📅 ${ctx.meeting_date}${ctx.meeting_time ? ` ${ctx.meeting_time}` : ''}`)
    if (ctx.meeting_location) parts.push(`📍 ${ctx.meeting_location}`)
    const detail = parts.length > 0 ? `\n${parts.join('  ')}` : ''
    await sendMessage(chatId, m.visitSavedDetailed(ctx.contact_name, detail))
    return
    } // end command escape
  }

  // ── /work /w ───────────────────────────────────────────────────────────────
  const workMatch = cmd.match(/^\/(?:work|w)\s+(.+)/s)
  if (workMatch) {
    await handleWork(chatId, user, workMatch[1].trim(), session?.last_contact_id, m, lang)
    return
  }

  // ── /met (must be before /meet to avoid /m catching /met) ─────────────────
  const metMatch = cmd.match(/^\/met\s+(\d+)\s+([\s\S]+)/)
  if (metMatch) {
    const count = Math.min(parseInt(metMatch[1], 10), 20)
    await handleMet(chatId, user, count, metMatch[2].trim(), m)
    return
  }

  // ── /meet /m ───────────────────────────────────────────────────────────────
  const meetMatch = text.match(/^\/(?:meet|m)(?:@\S+)?\s*([\s\S]*)$/i)
  if (meetMatch) {
    await handleMeet(chatId, user, meetMatch[1].trim(), m, lang)
    return
  }

  // ── /tasks /t ──────────────────────────────────────────────────────────────
  if (cmd === '/tasks' || cmd === '/t') {
    await handleTasks(chatId, user, m, lang)
    return
  }

  // ── Session: waiting_task_postpone_date ───────────────────────────────────
  if (session?.state === 'waiting_task_postpone_date') {
    if (cmd.startsWith('/')) { await clearSession(fromId) } else {
    const taskId = session.context.task_id as string
    const dateStr = text.trim()
    // Try to parse the date
    const parsed = Date.parse(dateStr)
    if (isNaN(parsed)) {
      await sendMessage(chatId, m.taskPostponeFormatBad)
      return
    }
    await db.from('tasks').update({ due_at: new Date(parsed).toISOString() }).eq('id', taskId)
    await clearSession(fromId)
    await sendMessage(chatId, m.taskPostponed(new Date(parsed).toLocaleString(dateLocale(lang), { timeZone: 'Asia/Taipei' })))
    return
    } // end command escape
  }

  // ── /note /n name — shortcut with contact name ────────────────────────────
  const noteNameMatch = cmd.match(/^\/(?:note|n)\s+(.+)/)
  if (noteNameMatch) {
    const contacts = await searchContacts(noteNameMatch[1].trim())
    if (contacts.length === 0) {
      await setSession(fromId, 'waiting_for_note_content', { contact_id: null })
      await sendMessage(chatId, m.noteContactNotFound)
    } else if (contacts.length === 1) {
      await setSession(fromId, 'waiting_for_note_content', { contact_id: contacts[0].id, contact_name: contacts[0].name })
      await sendMessage(chatId, m.noteContactFound(contacts[0].name ?? '', contacts[0].company ?? ''))
    } else {
      const buttons = contacts.map((c) => [{ text: `${c.name}（${c.company ?? ''}）`, callback_data: `select_contact_${c.id}` }])
      await sendMessage(chatId, m.noteFoundContactSelect, { reply_markup: { inline_keyboard: buttons } })
    }
    return
  }

  // ── /note command ──────────────────────────────────────────────────────────
  if (cmd === '/note' || cmd === '/n') {
    const lastContactId = session?.last_contact_id
    if (lastContactId) {
      const { data: lastContact } = await db
        .from('contacts').select('id, name, company').eq('id', lastContactId).single()
      if (lastContact) {
        await sendMessage(chatId,
          m.noteLastContactAsk(lastContact.name ?? '', lastContact.company ?? ''),
          { reply_markup: { inline_keyboard: [[
            { text: m.btnYesThatOne, callback_data: `use_last_note_${lastContactId}` },
            { text: m.btnSearchOther, callback_data: 'search_other_note' },
          ]] } }
        )
        return
      }
    }
    await setSession(fromId, 'waiting_for_note_contact', {})
    await sendMessage(chatId, m.emailEnterContactNameOrCompany)
    return
  }

  // ── /visit /v name [note] — shortcut with contact name ───────────────────
  // 只有姓名 → 原本的逐步流程；姓名後帶內容 → one-shot：AI 解析後直接寫入。
  // 姓名可能是多個字（如英文全名），不能只用第一個空白前的字當姓名。作法：
  // 建立姓名候選——先把整串當姓名（無備註），再取最前面 4 個斷點由長到短切
  // 成「姓名＋備註」（姓名很少超過 4 個字詞，以斷點位置而非候選長度設限，
  // 備註再長也不會把姓名候選擠出掃描範圍）。第一個「唯一命中」的候選勝出
  // （整串命中→逐步流程；前綴命中→one-shot）。最多 5 次查詢；皆非唯一時，
  // 退回既有的 0 筆／多筆流程。
  const visitNameMatch = cmd.match(/^\/(?:visit|v)\s+([\s\S]+)/)
  if (visitNameMatch) {
    const raw = visitNameMatch[1].trim()
    const tokens = raw.split(/\s+/)
    const candidates: Array<{ term: string; note: string }> = [{ term: raw, note: '' }]
    for (let i = Math.min(4, tokens.length - 1); i >= 1; i--) {
      candidates.push({ term: tokens.slice(0, i).join(' '), note: tokens.slice(i).join(' ') })
    }

    let rawMatches: Awaited<ReturnType<typeof searchContacts>> | null = null
    let multiWithNote: { contacts: Awaited<ReturnType<typeof searchContacts>>; note: string } | null = null
    for (const cand of candidates) {
      const found = await searchContacts(cand.term)
      if (cand.term === raw) rawMatches = found
      if (found.length === 1) {
        if (cand.note) {
          await logVisitOneShot(chatId, user, found[0].id, found[0].name, cand.note, m)
        } else {
          await setSession(fromId, 'waiting_for_visit_datetime', { contact_id: found[0].id, contact_name: found[0].name })
          await sendMessage(chatId, m.visitContactFound(found[0].name ?? '', found[0].company ?? ''))
        }
        return
      }
      // 記住第一個「多筆命中且帶備註」的候選，供 one-shot 多筆挑選使用
      if (found.length > 1 && cand.note && !multiWithNote) multiWithNote = { contacts: found, note: cand.note }
    }

    // 無唯一命中，但有帶備註的多筆候選 → 沿用 one-shot 多筆挑選：
    // callback_data 有 64-byte 限制 → 備註暫存 session，按鈕只帶 contact id
    if (multiWithNote) {
      await setSession(fromId, 'waiting_visit_oneshot_pick', { note: multiWithNote.note })
      const buttons = multiWithNote.contacts.map((c) => [{ text: `${c.name}（${c.company ?? ''}）`, callback_data: `vlog_${c.id}` }])
      await sendMessage(chatId, m.noteFoundContactSelect, { reply_markup: { inline_keyboard: buttons } })
      return
    }

    // 其餘 → 用整串走既有的 0 筆／多筆流程（唯一命中已於上方處理）
    const contacts = rawMatches ?? await searchContacts(raw)
    if (contacts.length === 0) {
      await setSession(fromId, 'waiting_for_visit_datetime', { contact_id: null, contact_name: null })
      await sendMessage(chatId, m.visitContactNotFound)
    } else {
      const buttons = contacts.map((c) => [{ text: `${c.name}（${c.company ?? ''}）`, callback_data: `select_visit_contact_${c.id}` }])
      await sendMessage(chatId, m.noteFoundContactSelect, { reply_markup: { inline_keyboard: buttons } })
    }
    return
  }

  // ── /visit /v command ─────────────────────────────────────────────────────
  if (cmd === '/visit' || cmd === '/v') {
    const lastContactId = session?.last_contact_id
    if (lastContactId) {
      const { data: lastContact } = await db
        .from('contacts').select('id, name, company').eq('id', lastContactId).single()
      if (lastContact) {
        await sendMessage(chatId,
          m.visitLastContactAsk(lastContact.name ?? '', lastContact.company ?? ''),
          { reply_markup: { inline_keyboard: [[
            { text: m.btnYesThatOne, callback_data: `use_last_visit_${lastContactId}` },
            { text: m.btnSearchOther, callback_data: 'search_other_visit' },
          ]] } }
        )
        return
      }
    }
    await setSession(fromId, 'waiting_for_visit_contact', {})
    await sendMessage(chatId, m.emailEnterContactNameOrCompany)
    return
  }

  // ── /a — add card to last session contact ────────────────────────────────
  if (cmd === '/a') {
    const lastContactId = session?.last_contact_id
    if (lastContactId) {
      const { data: lastContact } = await db.from('contacts').select('id, name, company').eq('id', lastContactId).single()
      if (lastContact) {
        await setSession(fromId, 'waiting_for_add_card', { contact_id: lastContactId, contact_name: lastContact.name })
        await sendMessage(chatId, m.addCardLastContact(lastContact.name ?? '', lastContact.company ?? ''), {
          reply_markup: { inline_keyboard: [[{ text: m.btnSkipNoCard, callback_data: 'skip_add_card' }]] },
        })
        return
      }
    }
    await sendMessage(chatId, m.addCardNoLast)
    return
  }

  // ── /a name [| company] — add card to specified contact, create if not found
  // Syntax:
  //   /a 王大華             → search; on miss offer to create
  //   /a 王大華 | ABC公司   → search; on miss offer to create w/ company
  const addCardMatch = cmd.match(/^\/a\s+(.+)/)
  if (addCardMatch) {
    const raw = addCardMatch[1].trim()
    const sepMatch = raw.match(/^(.+?)\s*[|,]\s*(.+)$/)
    const queryName = (sepMatch ? sepMatch[1] : raw).trim()
    const queryCompany = sepMatch ? sepMatch[2].trim() : ''
    const contacts = await searchContacts(queryName)
    if (contacts.length === 0) {
      await setSession(fromId, 'confirm_create_a', { name: queryName, company: queryCompany })
      const createLabel = m.addCardCreateLabel(queryName, queryCompany)
      await sendMessage(chatId, m.addCardNotFound(queryName), {
        reply_markup: {
          inline_keyboard: [[
            { text: createLabel, callback_data: 'confirm_create_a' },
            { text: m.btnCancel, callback_data: 'cancel_a' },
          ]],
        },
      })
    } else if (contacts.length === 1) {
      await setSession(fromId, 'waiting_for_add_card', { contact_id: contacts[0].id, contact_name: contacts[0].name })
      await sendMessage(chatId, m.addCardFoundOne(contacts[0].name ?? ''), {
        reply_markup: { inline_keyboard: [[{ text: m.btnSkipNoCard, callback_data: 'skip_add_card' }]] },
      })
    } else {
      const buttons = contacts.map((c) => [{ text: `${c.name}（${c.company ?? ''}）`, callback_data: `select_add_card_${c.id}` }])
      await sendMessage(chatId, m.addCardMultipleSelect, { reply_markup: { inline_keyboard: buttons } })
    }
    return
  }

  // ── /p — add personal photo to last session contact ───────────────────────
  if (cmd === '/p') {
    const lastContactId = session?.last_contact_id
    if (lastContactId) {
      const { data: lastContact } = await db.from('contacts').select('id, name, company').eq('id', lastContactId).single()
      if (lastContact) {
        await setSession(fromId, 'waiting_for_photo', { contact_id: lastContactId, contact_name: lastContact.name })
        await sendMessage(chatId, m.personPhotoLastContact(lastContact.name ?? '', lastContact.company ?? ''))
        return
      }
    }
    await sendMessage(chatId, m.personPhotoNoLast)
    return
  }

  // ── /p name [| company] — add personal photo to specified contact ─────────
  // Syntax:
  //   /p 戴建丞            → search "戴建丞"; on miss offer to create
  //   /p 戴建丞 | 經濟部    → search "戴建丞"; on miss offer to create w/ company
  //   /p 戴建丞, 經濟部     → same (comma separator also accepted)
  const addPhotoMatch = cmd.match(/^\/p\s+(.+)/)
  if (addPhotoMatch) {
    const raw = addPhotoMatch[1].trim()
    const sepMatch = raw.match(/^(.+?)\s*[|,]\s*(.+)$/)
    const queryName = (sepMatch ? sepMatch[1] : raw).trim()
    const queryCompany = sepMatch ? sepMatch[2].trim() : ''
    const contacts = await searchContacts(queryName)
    if (contacts.length === 0) {
      // Use session to carry name + company — Telegram callback_data has a
      // hard 64-byte limit, so we can't embed arbitrary-length strings there.
      await setSession(fromId, 'confirm_create_p', { name: queryName, company: queryCompany })
      const createLabel = m.addCardCreateLabel(queryName, queryCompany)
      await sendMessage(chatId, m.personPhotoNotFound(queryName), {
        reply_markup: {
          inline_keyboard: [[
            { text: createLabel, callback_data: 'confirm_create_p' },
            { text: m.btnCancel, callback_data: 'cancel_p' },
          ]],
        },
      })
    } else if (contacts.length === 1) {
      await setSession(fromId, 'waiting_for_photo', { contact_id: contacts[0].id, contact_name: contacts[0].name })
      await sendMessage(chatId, m.personPhotoFoundOne(contacts[0].name ?? ''))
    } else {
      const buttons = contacts.map((c) => [{ text: `${c.name}（${c.company ?? ''}）`, callback_data: `select_photo_${c.id}` }])
      await sendMessage(chatId, m.personPhotoMultipleSelect, { reply_markup: { inline_keyboard: buttons } })
    }
    return
  }

  // ── @ quick format: @name\ncontent ────────────────────────────────────────
  if (cmd.startsWith('@')) {
    const lines = cmd.split('\n')
    const query = lines[0].slice(1).trim()
    const content = lines.slice(1).join('\n').trim()
    const contacts = await searchContacts(query)

    if (!content) {
      if (contacts.length === 0) {
        await setSession(fromId, 'waiting_for_note_content', { contact_id: null })
        await sendMessage(chatId, m.noteContactNotFound)
      } else if (contacts.length === 1) {
        await setSession(fromId, 'waiting_for_note_content', { contact_id: contacts[0].id, contact_name: contacts[0].name })
        await sendMessage(chatId, m.noteFoundOnePlain(contacts[0].name ?? ''))
      } else {
        const buttons = contacts.map((c) => [{ text: `${c.name}（${c.company ?? ''}）`, callback_data: `select_contact_${c.id}` }])
        await sendMessage(chatId, m.noteFoundContactSelect, { reply_markup: { inline_keyboard: buttons } })
      }
      return
    }

    let contactId: string | null = null
    let contactName: string | undefined
    if (contacts.length === 1) {
      contactId = contacts[0].id
      contactName = contacts[0].name ?? undefined
    } else if (contacts.length === 0) {
      contactId = null
    } else {
      await setSession(fromId, 'waiting_for_note_content_after_select', { content })
      const buttons = contacts.map((c) => [{ text: `${c.name}（${c.company ?? ''}）`, callback_data: `select_contact_${c.id}` }])
      await sendMessage(chatId, m.noteFoundContactSelect, { reply_markup: { inline_keyboard: buttons } })
      return
    }

    await db.from('interaction_logs').insert({
      contact_id: contactId,
      type: 'note',
      content,
      created_by: user.id,
    })
    await sendMessage(chatId, m.noteSavedWithDetail(contactName ?? null, false, ''))
    return
  }

  // ── /li: LinkedIn screenshot ───────────────────────────────────────────────
  if (cmd === '/li' || cmd === '/linkedin') {
    await setSession(fromId, 'waiting_for_li', {})
    await sendMessage(chatId, m.liPrompt)
    return
  }

  // ── /b [描述] — enter batch mode, optionally with "where met" context ─────
  const batchMatch = cmd.match(/^\/(b|batch)(?:\s+([\s\S]+))?$/)
  if (batchMatch) {
    const description = batchMatch[2]?.trim()
    let metContext: { met_at: string | null; met_date: string; referred_by: string | null } | null = null
    if (description) {
      await sendMessage(chatId, m.batchParsingMet)
      try {
        const nowIso = new Date().toISOString()
        const parsed = await parseMetCommand(description, nowIso)
        metContext = {
          met_at: parsed.met_at,
          met_date: parsed.met_date,
          referred_by: parsed.referred_by,
        }
      } catch (e) {
        console.error('[bot] /b parseMetCommand error:', e)
        await sendMessage(chatId, m.batchMetParseFailed)
      }
    }

    await setSession(fromId, 'batch_mode', { count: 0, pending_ids: [], met: metContext })

    let metInfo = ''
    if (metContext) {
      const parts: string[] = []
      if (metContext.met_at) parts.push(`📍 ${metContext.met_at}`)
      if (metContext.met_date) parts.push(`📅 ${metContext.met_date}`)
      if (metContext.referred_by) parts.push(`🤝 ${m.metFieldReferrer} ${metContext.referred_by}`)
      if (parts.length > 0) metInfo = m.batchMetInfo(parts.join('\n'))
    }

    const appUrl = await resolveAppUrl()
    const link = appUrl ? `\n📋 <a href="${appUrl}/contacts/pending">${appUrl}/contacts/pending</a>` : ''
    await sendMessage(chatId, m.batchEntered(metInfo, link))
    return
  }

  // ── /done — finish batch mode, wait for stragglers + send summary ────────
  if (cmd === '/done') {
    // /done can finish: batch_mode (existing) OR news_collecting (new)
    if (session?.state === 'news_collecting') {
      const draftId = session.context.draft_id as string
      const sb: OrgDb = orgScopedClient(systemOrgContext())
      const { data: d } = await sb.from('newsletter_drafts')
        .select('title, content, photo_urls, event_date, section, period')
        .eq('id', draftId).single()
      await clearSession(fromId)
      if (!d) { await sendMessage(chatId, m.newsExited); return }
      const appUrl = await resolveAppUrl()
      const link = appUrl ? `\n\n👀 <a href="${appUrl}/admin/newsletter/draft/${d.period}">${appUrl}/admin/newsletter/draft/${d.period}</a>` : ''
      const photos = d.photo_urls?.length ?? 0
      const charCount = (d.content ?? '').length
      const secLabel = d.section === 'last_month' ? m.newsSectionLastLabel : m.newsSectionNextLabel
      const eventDateLine = d.event_date ? `📅 ${d.event_date}\n` : ''
      await sendMessage(chatId, m.newsDoneSummary(d.period, secLabel, d.title, eventDateLine, charCount, photos, link))
      return
    }
    if (session?.state !== 'batch_mode') {
      await sendMessage(chatId, m.batchNotInMode)
      return
    }
    const pendingIds = (session.context?.pending_ids as string[] | undefined) ?? []
    if (pendingIds.length === 0) {
      await clearSession(fromId)
      await sendMessage(chatId, m.batchEmptyDone)
      return
    }
    const total = pendingIds.length
    await clearSession(fromId)
    await sendMessage(chatId, m.batchDoneAck(total))
    // Background: poll up to 60s for all rows to finish, then send single summary
    after(async () => {
      const sb = createServiceClient()
      await summarizeBatchAndNotify(sb, pendingIds, fromId)
    })
    return
  }

  // ── /cancel — abort current session (batch or otherwise) ──────────────────
  if (cmd === '/cancel') {
    const wasBatch = session?.state === 'batch_mode'
    await clearSession(fromId)
    await sendMessage(chatId, wasBatch ? m.batchCancelled : m.cancelGeneric)
    return
  }

  // ── /news — accumulate newsletter material ────────────────────────────────
  if (cmd === '/news') {
    if (!await userHasNewsletter(user.id)) {
      await sendMessage(chatId, m.newsNoPermission)
      return
    }
    const cur = currentPeriod()
    const nxt = nextPeriod()
    // Pull custom labels for both periods (if user has renamed sections on the web)
    const sb: OrgDb = orgScopedClient(systemOrgContext())
    const { data: metas } = await sb
      .from('newsletter_period_meta')
      .select('period, label_last, label_next')
      .in('period', [cur, nxt])
    type MetaRow = { period: string; label_last: string | null; label_next: string | null }
    const labelOf = (period: string, kind: 'last' | 'next'): string => {
      const row = (metas as MetaRow[] | null)?.find((r) => r.period === period)
      const custom = kind === 'last' ? row?.label_last : row?.label_next
      const fallback = kind === 'last' ? m.newsBtnLastMonth : m.newsBtnNextMonth
      return (custom?.trim()) || fallback
    }
    await sendMessage(chatId,
      m.newsPromptSection,
      { reply_markup: { inline_keyboard: [
        [
          { text: `${cur} ${labelOf(cur, 'last')}`, callback_data: `news_sec_last_${cur}` },
          { text: `${cur} ${labelOf(cur, 'next')}`, callback_data: `news_sec_next_${cur}` },
        ],
        [
          { text: `${nxt} ${labelOf(nxt, 'last')}`, callback_data: `news_sec_last_${nxt}` },
          { text: `${nxt} ${labelOf(nxt, 'next')}`, callback_data: `news_sec_next_${nxt}` },
        ],
      ] } }
    )
    return
  }

  // ── Session: news_title — collect story title ──────────────────────────────
  if (session?.state === 'news_title') {
    if (cmd.startsWith('/')) { await clearSession(fromId) } else {
    const title = text.trim()
    if (title.length < 1 || title.length > 200) {
      await sendMessage(chatId, m.newsTitleLengthError)
      return
    }
    await setSession(fromId, 'news_date', { ...session.context, title })
    await sendMessage(chatId, m.newsDatePrompt)
    return
    }
  }

  // ── Session: news_date — collect event date ────────────────────────────────
  if (session?.state === 'news_date') {
    if (cmd.startsWith('/')) { await clearSession(fromId) } else {
    const raw = text.trim()
    let eventDate: string | null = null
    if (raw === '略過' || raw === 'スキップ' || raw.toLowerCase() === 'skip' || raw === '-') {
      eventDate = null
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      eventDate = raw
    } else {
      await sendMessage(chatId, m.newsDateBad)
      return
    }
    // Create the draft now so subsequent photos/text can append
    const sb: OrgDb = orgScopedClient(systemOrgContext())
    const { data: existing } = await sb
      .from('newsletter_drafts')
      .select('position')
      .eq('period', session.context.period as string)
      .eq('section', session.context.section as string)
      .neq('status', 'deleted')
      .order('position', { ascending: false }).limit(1)
    const nextPos = (existing?.[0]?.position ?? -1) + 1
    const { data: draft, error } = await sb.from('newsletter_drafts').insert({
      period: session.context.period as string,
      section: session.context.section as string,
      title: session.context.title as string,
      content: null,
      event_date: eventDate,
      photo_urls: [],
      links: [],
      created_by: user.id,
      created_via: 'telegram',
      position: nextPos,
    }).select('id').single()
    if (error || !draft) {
      await clearSession(fromId)
      await sendMessage(chatId, m.newsCreateFailed(error?.message ?? m.unknownError))
      return
    }
    await setSession(fromId, 'news_collecting', { ...session.context, draft_id: draft.id, event_date: eventDate })
    await sendMessage(chatId, m.newsStoryCreated(session.context.title as string, eventDate ?? ''))
    return
    }
  }

  // ── Session: news_collecting — text input appends to content
  // (/done is handled in the main /done block above, which finalizes this state)
  if (session?.state === 'news_collecting') {
    if (cmd.startsWith('/')) { await clearSession(fromId) } else {
    const draftId = session.context.draft_id as string
    const sb: OrgDb = orgScopedClient(systemOrgContext())
    const { data: cur } = await sb.from('newsletter_drafts')
      .select('content').eq('id', draftId).single()
    const merged = (cur?.content ? cur.content + '\n\n' : '') + text.trim()
    await sb.from('newsletter_drafts').update({ content: merged }).eq('id', draftId)
    await sendMessage(chatId, m.newsTextAdded(text.trim().length, merged.length))
    return
    }
  }

  // Default
  await sendMessage(chatId, m.defaultPrompt)
}

// ── Bot error dead-letter (bot_errors) ────────────────────────────────────────

// 盡力而為：處理失敗的 update 記到 bot_errors 供 admin/health 檢視。
// 任何記錄失敗都吞掉，絕不影響對 Telegram 的回應。
async function logBotError(update: unknown, err: unknown): Promise<void> {
  try {
    const u = update as {
      message?: { chat?: { id?: number } }
      callback_query?: { message?: { chat?: { id?: number } }; from?: { id?: number } }
    } | null
    const chatId = u?.message?.chat?.id ?? u?.callback_query?.message?.chat?.id ?? u?.callback_query?.from?.id ?? null
    const updateType = u?.message ? 'message' : u?.callback_query ? 'callback' : 'other'
    const errorMessage = (err instanceof Error ? err.message : String(err)).slice(0, 500)
    // payload 裁切：photo 等 update 可能很大，超過 8000 字元只留前段
    const raw = JSON.stringify(update ?? null)
    const payload = raw.length > 8000 ? { _truncated: true, preview: raw.slice(0, 8000) } : update
    await createServiceClient().from('bot_errors').insert({
      chat_id: chatId,
      update_type: updateType,
      error_message: errorMessage,
      payload,
    })
  } catch { /* never let dead-letter logging break the reply */ }
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Validate Telegram webhook secret token
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET
  if (webhookSecret) {
    const incoming = req.headers.get('x-telegram-bot-api-secret-token') ?? ''
    if (incoming !== webhookSecret) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  // 供最外層 catch 的 dead-letter 記錄使用（body 解析失敗時維持 null）
  let rawUpdate: unknown = null
  try {
    const body = await req.json()
    rawUpdate = body
    const supabase = createServiceClient()
    // Phase 1 單租戶：bot 為系統行為者，固定 default org（見 orgContext.ts 路線圖）。
    // Phase 3：由 /start org 綁定流程從 bot_sessions／使用者解析所屬 org。
    const orgCtx = systemOrgContext()
    const db: OrgDb = orgScopedClient(orgCtx)

    // --- Deduplication: skip already-processed updates ---
    const updateId = body.update_id as number | undefined
    if (updateId) {
      const { error: dedupError } = await db
        .from('telegram_dedup')
        .insert({ update_id: updateId })
      if (dedupError) {
        // Only a unique-constraint violation (23505) means "already processed" —
        // skip it. A transient DB error must NOT be swallowed as a duplicate, or
        // Telegram gets ok:true and never resends → the update is lost. Fall
        // through so this update is still handled.
        if (dedupError.code === '23505') {
          return NextResponse.json({ ok: true })
        }
        console.error('[bot] telegram_dedup insert failed (non-duplicate), processing anyway:', dedupError.message)
      }
    }

    // --- Callback Query ---
    if (body.callback_query) {
      const { id: callbackQueryId, from, message, data } = body.callback_query
      // Resolve language outside the try block so the catch handler can use it.
      const lang = await getBotLanguage(from, supabase)
      const m = BOT_MESSAGES[lang]

      try {
        const user = await getAuthorizedUser(from.id)
        if (!user) {
          await answerCallbackQuery(callbackQueryId, m.unauthorized)
          return NextResponse.json({ ok: true })
        }

        // ── Save card ─────────────────────────────────────────────────────────
        if (data?.startsWith('save_')) {
          const pendingId = data.replace('save_', '')
          const { data: pending } = await db
            .from('pending_contacts')
            .select('data, storage_path')
            .eq('id', pendingId)
            .single()

          // Already processed (Telegram retry) — ack silently
          if (!pending) {
            await answerCallbackQuery(callbackQueryId)
            return NextResponse.json({ ok: true })
          }

          await answerCallbackQuery(callbackQueryId, m.cbCardSaved)

          // Strip rotation + merge-target hidden fields, and card image URLs
          // (multi-card support stores them in contact_cards instead — writing
          // both makes the detail page show the same image twice)
          const { rotation: _r, _merge_target_id: _mt, card_img_url: _ci, card_img_back_url: _cb, ...contactFields } = pending.data as Record<string, unknown>
          const { data: inserted, error } = await db
            .from('contacts')
            .insert({ ...contactFields, created_by: user.id })
            .select('id')
            .single()
          if (error || !inserted) throw new Error(error?.message ?? m.insertFailedFallback)

          await db.from('interaction_logs').insert({
            contact_id: inserted.id,
            type: 'system',
            content: '透過 Telegram Bot 新增名片',
            created_by: user.id,
          })

          // Insert to contact_cards for multi-card support
          const pendingData = pending.data as Record<string, unknown>
          if (pendingData.card_img_url) {
            const now = new Date()
            const cardLabel = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
            await db.from('contact_cards').insert({
              contact_id: inserted.id,
              card_img_url: pendingData.card_img_url,
              storage_path: pending.storage_path,
              label: cardLabel,
            })
          }

          await db.from('pending_contacts').delete().eq('id', pendingId)
          await updateLastContact(from.id, inserted.id)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          const appUrl = await resolveAppUrl()
          const contactLink = appUrl ? `\n\n👤 <a href="${appUrl}/contacts/${inserted.id}">${m.cardViewContactLink}</a>` : ''
          await sendMessage(from.id, m.cardSavedWithLink(contactLink), {
            reply_markup: {
              inline_keyboard: [[
                { text: m.followupBtn3d, callback_data: `followup_${inserted.id}_3` },
                { text: m.followupBtn1w, callback_data: `followup_${inserted.id}_7` },
              ]],
            },
          })

          // Hunter.io auto-enrich when namecard OCR yielded no email
          const currentEmail = (pendingData.email as string | null | undefined) ?? null
          if (!currentEmail) {
            try {
              const { enrichContactEmail, enrichStatusMessage } = await import('@/lib/hunter')
              const r = await enrichContactEmail(
                inserted.id,
                (pendingData.name_en as string | null) ?? null,
                (pendingData.name as string | null) ?? null,
                (pendingData.company as string | null) ?? null,
              )
              await sendMessage(from.id, enrichStatusMessage(r, hunterLang(lang)))
            } catch { /* non-fatal */ }
          }
        }

        // ── Merge / Replace into existing contact (when dup detected) ────────
        else if (data?.startsWith('merge_') || data?.startsWith('replace_')) {
          const isReplace = data.startsWith('replace_')
          const mode: MergeMode = isReplace ? 'replace' : 'fill'
          const pendingId = data.replace(/^(merge_|replace_)/, '')
          const { data: pending } = await db
            .from('pending_contacts')
            .select('data, storage_path')
            .eq('id', pendingId)
            .single()
          if (!pending) {
            await answerCallbackQuery(callbackQueryId)
            return NextResponse.json({ ok: true })
          }

          const pdata = pending.data as Record<string, unknown>
          const targetId = pdata._merge_target_id as string | undefined
          if (!targetId) {
            await answerCallbackQuery(callbackQueryId, m.mergeNoTargetCb)
            await sendMessage(from.id, m.mergeNoTarget)
            return NextResponse.json({ ok: true })
          }

          await answerCallbackQuery(callbackQueryId, m.cbProcessing)

          const now = new Date()
          const cardLabel = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
          const result = await mergeIntoContact(supabase, {
            targetId,
            newData: pdata,
            cardImgUrl: pdata.card_img_url as string | undefined,
            cardImgBackUrl: pdata.card_img_back_url as string | undefined,
            storagePath: pending.storage_path,
            cardLabel,
            mode,
            userId: user.id,
            logPrefix: isReplace ? 'Telegram bot 更新聯絡人' : 'Telegram bot 合併新名片',
          })

          if (!result.ok) {
            await sendMessage(from.id, `❌ ${result.error ?? m.mergeFailedFallback}`)
            return NextResponse.json({ ok: true })
          }

          await db.from('pending_contacts').delete().eq('id', pendingId)
          await updateLastContact(from.id, targetId)
          await editMessageReplyMarkup(message.chat.id, message.message_id)

          const summary: string[] = []
          if (result.filled > 0) summary.push(m.mergeFilled(result.filled))
          if (isReplace && result.replaced > 0) summary.push(m.mergeReplaced(result.replaced))
          if (!isReplace && result.conflicts > 0) summary.push(m.mergeConflicts(result.conflicts))
          if (pdata.card_img_url) summary.push(m.mergeCardAdded)
          const appUrl = await resolveAppUrl()
          const link = appUrl ? `\n\n👤 <a href="${appUrl}/contacts/${targetId}">${m.mergeViewLink(result.contact_name ?? '')}</a>` : ''
          const verb = isReplace ? m.mergeVerbUpdated : m.mergeVerbAddedTo
          await sendMessage(from.id, m.mergeResult(verb, result.contact_name ?? '', summary.join('\n'), link))
        }

        // ── Cancel card ───────────────────────────────────────────────────────
        else if (data?.startsWith('cancel_')) {
          const pendingId = data.replace('cancel_', '')
          const { data: pending } = await db
            .from('pending_contacts')
            .select('storage_path')
            .eq('id', pendingId)
            .single()
          if (pending?.storage_path) {
            await supabase.storage.from('cards').remove([pending.storage_path])
          }
          await db.from('pending_contacts').delete().eq('id', pendingId)
          await answerCallbackQuery(callbackQueryId, m.cbCardCancelled)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await sendMessage(from.id, m.cardCancelled)
        }

        // ── Meet confirm ──────────────────────────────────────────────────────
        else if (data?.startsWith('meet_confirm_')) {
          const draftId = data.replace('meet_confirm_', '')
          const { data: draft } = await db
            .from('meeting_drafts')
            .select('*')
            .eq('id', draftId)
            .single()

          if (!draft) {
            await answerCallbackQuery(callbackQueryId, m.meetExpired)
            await editMessageReplyMarkup(message.chat.id, message.message_id)
            return NextResponse.json({ ok: true })
          }

          try {
            const accessToken = await getValidProviderToken(user.id)
            const endIso = new Date(new Date(draft.start_at).getTime() + draft.duration_minutes * 60000).toISOString()
            // Resolve attendee emails
            const attendeeEmails: string[] = []
            if (draft.attendee_ids?.length > 0) {
              const { data: members } = await supabase
                .from('users').select('email').in('id', draft.attendee_ids)
              attendeeEmails.push(...(members ?? []).map((m: { email: string }) => m.email))
            }
            const webLink = await createCalendarEvent({
              accessToken,
              title: draft.title,
              startIso: draft.start_at,
              endIso,
              attendeeEmails,
              location: draft.location ?? undefined,
            })
            await db.from('meeting_drafts').delete().eq('id', draftId)
            await answerCallbackQuery(callbackQueryId, m.cbMeetConfirmed)
            await editMessageReplyMarkup(message.chat.id, message.message_id)
            const timeLabel = formatTaipeiRange(draft.start_at, draft.duration_minutes, m, lang)
            const linkText = webLink ? `\n\n🔗 <a href="${webLink}">${m.meetOpenInOutlook}</a>` : ''
            await sendMessage(from.id, m.meetCreatedDetail(draft.title, timeLabel, linkText))
          } catch (e) {
            await answerCallbackQuery(callbackQueryId, m.meetCreateFailedCb)
            await sendMessage(from.id, m.meetCreateFailedDetail(e instanceof Error ? e.message : m.meetTryAgainLater))
          }
        }

        // ── Meet cancel ───────────────────────────────────────────────────────
        else if (data?.startsWith('meet_cancel_')) {
          const draftId = data.replace('meet_cancel_', '')
          await db.from('meeting_drafts').delete().eq('id', draftId)
          await answerCallbackQuery(callbackQueryId, m.cbMeetCancelled)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await sendMessage(from.id, m.meetCancelled)
        }

        // ── /visit: use last contact ─────────────────────────────────────────
        else if (data?.startsWith('use_last_visit_')) {
          const contactId = data.replace('use_last_visit_', '')
          const { data: contact } = await db
            .from('contacts').select('id, name').eq('id', contactId).single()
          await setSession(from.id, 'waiting_for_visit_datetime', { contact_id: contactId, contact_name: contact?.name })
          await answerCallbackQuery(callbackQueryId)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await sendMessage(from.id, m.visitAfterContactPick(contact?.name ?? ''))
        }

        // ── /visit: search other contact ─────────────────────────────────────
        else if (data === 'search_other_visit') {
          await setSession(from.id, 'waiting_for_visit_contact', {})
          await answerCallbackQuery(callbackQueryId)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await sendMessage(from.id, m.emailEnterContactNameOrCompany)
        }

        // ── /visit: select contact from search results ───────────────────────
        else if (data?.startsWith('select_visit_contact_')) {
          const contactId = data.replace('select_visit_contact_', '')
          const { data: contact } = await db
            .from('contacts').select('id, name').eq('id', contactId).single()
          await setSession(from.id, 'waiting_for_visit_datetime', { contact_id: contactId, contact_name: contact?.name })
          await answerCallbackQuery(callbackQueryId)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await sendMessage(from.id, m.visitAfterContactPick(contact?.name ?? ''))
        }

        // ── /v one-shot: select contact from search results ──────────────────
        else if (data?.startsWith('vlog_')) {
          const contactId = data.replace('vlog_', '')
          const session = await getSession(from.id)
          const noteText = session?.state === 'waiting_visit_oneshot_pick'
            ? (session.context?.note as string | undefined)
            : undefined
          await answerCallbackQuery(callbackQueryId)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await clearSession(from.id)
          if (!noteText) {
            await sendMessage(from.id, m.visitNoteMissing)
          } else {
            const { data: contact } = await db
              .from('contacts').select('id, name').eq('id', contactId).single()
            await logVisitOneShot(from.id, user, contactId, contact?.name ?? null, noteText, m)
          }
        }

        // ── Select contact for note ───────────────────────────────────────────
        else if (data?.startsWith('select_contact_')) {
          const contactId = data.replace('select_contact_', '')
          const { data: contact } = await db
            .from('contacts')
            .select('id, name')
            .eq('id', contactId)
            .single()

          const session = await getSession(from.id)

          if (session?.state === 'waiting_for_note_content_after_select') {
            const content = session.context.content as string
            await db.from('interaction_logs').insert({
              contact_id: contactId,
              type: 'note',
              content,
              created_by: user.id,
            })
            await clearSession(from.id)
            await answerCallbackQuery(callbackQueryId)
            await editMessageReplyMarkup(message.chat.id, message.message_id)
            await sendMessage(from.id, m.noteSavedForContact(contact?.name ?? ''))
          } else {
            await setSession(from.id, 'waiting_for_note_content', { contact_id: contactId, contact_name: contact?.name })
            await answerCallbackQuery(callbackQueryId)
            await editMessageReplyMarkup(message.chat.id, message.message_id)
            await sendMessage(from.id, m.noteFoundOnePlain(contact?.name ?? ''))
          }
        }

        // ── Select contact for /a add card ───────────────────────────────────
        else if (data?.startsWith('select_add_card_')) {
          const contactId = data.replace('select_add_card_', '')
          const { data: contact } = await db.from('contacts').select('id, name').eq('id', contactId).single()
          await setSession(from.id, 'waiting_for_add_card', { contact_id: contactId, contact_name: contact?.name })
          await answerCallbackQuery(callbackQueryId)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await sendMessage(from.id, m.addCardFoundOne(contact?.name ?? ''), {
            reply_markup: { inline_keyboard: [[{ text: m.btnSkipNoCard, callback_data: 'skip_add_card' }]] },
          })
        }

        // ── Confirm /a card photo → run OCR + show diff ───────────────────────
        else if (data?.startsWith('confirm_add_card_')) {
          const contactId = data.replace('confirm_add_card_', '')
          const session = await getSession(from.id)
          const fileId = session?.context?.pending_file_id as string | undefined
          const contactNameHint = session?.context?.contact_name as string | undefined
          await answerCallbackQuery(callbackQueryId)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          if (!fileId) {
            await sendMessage(from.id, m.pendingPhotoMissing)
            await clearSession(from.id)
          } else {
            await processAddCardPhoto(from.id, from.id, user, contactId, fileId, contactNameHint, m)
          }
        }

        // ── Cancel /a ─────────────────────────────────────────────────────────
        else if (data === 'cancel_add_card') {
          await clearSession(from.id)
          await answerCallbackQuery(callbackQueryId)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await sendMessage(from.id, m.cancelGeneric)
        }

        // ── /a name not found → create minimal contact ────────────────────────
        else if (data === 'confirm_create_a') {
          const pendingSession = await getSession(from.id)
          let nameQuery = ''
          let companyQuery: string | null = null
          if (pendingSession?.state === 'confirm_create_a') {
            nameQuery = (pendingSession.context?.name as string | undefined ?? '').trim()
            companyQuery = ((pendingSession.context?.company as string | undefined ?? '').trim()) || null
          }
          await answerCallbackQuery(callbackQueryId)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          if (!nameQuery) {
            await sendMessage(from.id, m.addCardCreateFailedPrompt)
          } else {
            const insertPayload: Record<string, unknown> = { name: nameQuery, created_by: user.id }
            if (companyQuery) insertPayload.company = companyQuery
            const { data: inserted, error } = await db
              .from('contacts')
              .insert(insertPayload)
              .select('id')
              .single()
            if (error || !inserted) {
              await sendMessage(from.id, m.addCardCreateFailed(error?.message ?? m.unknownError))
            } else {
              await db.from('interaction_logs').insert({
                contact_id: inserted.id,
                type: 'system',
                content: companyQuery
                  ? '透過 Telegram Bot /a 手動建立（姓名 + 公司）'
                  : '透過 Telegram Bot /a 手動建立（僅姓名）',
                created_by: user.id,
              })
              await updateLastContact(from.id, inserted.id)
              await setSession(from.id, 'waiting_for_add_card', { contact_id: inserted.id, contact_name: nameQuery })
              const appUrl = await resolveAppUrl()
              const link = appUrl ? `\n\n👤 <a href="${appUrl}/contacts/${inserted.id}">${m.cardViewContactLink}</a>` : ''
              const displayLine = companyQuery ? `<b>${nameQuery}</b>（${companyQuery}）` : `<b>${nameQuery}</b>`
              await sendMessage(from.id, m.addCardContactCreated(displayLine, link), {
                reply_markup: { inline_keyboard: [[{ text: m.btnSkipNoCard, callback_data: 'skip_add_card' }]] },
              })
            }
          }
        }

        // ── /a name not found, cancel create ──────────────────────────────────
        else if (data === 'cancel_a') {
          await answerCallbackQuery(callbackQueryId)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await clearSession(from.id)
          await sendMessage(from.id, m.cbCancelled)
        }

        // ── /news: pick section (last_month / next_month) ────────────────────
        else if (data?.startsWith('news_sec_last_') || data?.startsWith('news_sec_next_')) {
          if (!await userHasNewsletter(user.id)) {
            await answerCallbackQuery(callbackQueryId, m.newsNoPermissionCb)
            return NextResponse.json({ ok: true })
          }
          const section = data.startsWith('news_sec_last_') ? 'last_month' : 'next_month'
          const period = data.replace('news_sec_last_', '').replace('news_sec_next_', '')
          await answerCallbackQuery(callbackQueryId)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await setSession(from.id, 'news_title', { period, section })
          const secLabel = section === 'last_month' ? m.newsSectionLastLabel : m.newsSectionNextLabel
          await sendMessage(from.id, m.newsStoryTitlePrompt(period, secLabel))
        }

        // ── Skip adding card photo ────────────────────────────────────────────
        else if (data === 'skip_add_card') {
          const skipSession = await getSession(from.id)
          const skipContactId = skipSession?.context?.contact_id as string | undefined
          const skipContactName = skipSession?.context?.contact_name as string | undefined
          await answerCallbackQuery(callbackQueryId)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await clearSession(from.id)
          const appUrl = await resolveAppUrl()
          const link = (appUrl && skipContactId) ? `\n\n👤 <a href="${appUrl}/contacts/${skipContactId}">${m.cardViewContactLink}</a>` : ''
          const displayLine = skipContactName ? `<b>${skipContactName}</b>` : m.cardThisContact
          await sendMessage(from.id, m.addCardSkipped(displayLine, link))
        }

        // ── Apply OCR diff to contact ─────────────────────────────────────────
        else if (data?.startsWith('apply_card_')) {
          const contactId = data.replace('apply_card_', '')
          await answerCallbackQuery(callbackQueryId)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await applyCardDiff(from.id, from.id, contactId, true, m)
        }

        // ── Skip OCR diff — save card only ────────────────────────────────────
        else if (data?.startsWith('skip_card_apply_')) {
          const contactId = data.replace('skip_card_apply_', '')
          await answerCallbackQuery(callbackQueryId)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await applyCardDiff(from.id, from.id, contactId, false, m)
        }

        // ── /p name not found → create minimal contact ────────────────────────
        else if (data === 'confirm_create_p' || data?.startsWith('create_p_')) {
          // Preferred path: read pending name/company from session (unlimited length)
          // Legacy path (create_p_<base64>): kept for in-flight messages from older
          // deploys; can be removed after 24h.
          let nameQuery = ''
          let companyQuery: string | null = null
          if (data === 'confirm_create_p') {
            const pendingSession = await getSession(from.id)
            if (pendingSession?.state === 'confirm_create_p') {
              nameQuery = (pendingSession.context?.name as string | undefined ?? '').trim()
              companyQuery = ((pendingSession.context?.company as string | undefined ?? '').trim()) || null
            }
          } else if (data?.startsWith('create_p_')) {
            try {
              const decoded = Buffer.from(data.replace('create_p_', ''), 'base64').toString('utf-8')
              if (decoded.startsWith('{')) {
                const p = JSON.parse(decoded) as { n?: string; c?: string }
                nameQuery = (p.n ?? '').trim()
                companyQuery = (p.c ?? '').trim() || null
              } else {
                nameQuery = decoded.trim()
              }
            } catch { /* noop */ }
          }
          await answerCallbackQuery(callbackQueryId)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          if (!nameQuery) {
            await sendMessage(from.id, m.personPhotoCreateFailedPrompt)
          } else {
            const insertPayload: Record<string, unknown> = { name: nameQuery, created_by: user.id }
            if (companyQuery) insertPayload.company = companyQuery
            const { data: inserted, error } = await db
              .from('contacts')
              .insert(insertPayload)
              .select('id')
              .single()
            if (error || !inserted) {
              await sendMessage(from.id, m.addCardCreateFailed(error?.message ?? m.unknownError))
            } else {
              await db.from('interaction_logs').insert({
                contact_id: inserted.id,
                type: 'system',
                content: companyQuery
                  ? '透過 Telegram Bot /p 手動建立（姓名 + 公司）'
                  : '透過 Telegram Bot /p 手動建立（僅姓名）',
                created_by: user.id,
              })
              await updateLastContact(from.id, inserted.id)
              await setSession(from.id, 'waiting_for_photo', { contact_id: inserted.id, contact_name: nameQuery })
              const appUrl = await resolveAppUrl()
              const link = appUrl ? `\n\n👤 <a href="${appUrl}/contacts/${inserted.id}">${m.cardViewContactLink}</a>` : ''
              const displayLine = companyQuery ? `<b>${nameQuery}</b>（${companyQuery}）` : `<b>${nameQuery}</b>`
              await sendMessage(from.id, m.personPhotoContactCreated(displayLine, link))

              try {
                const { enrichContactEmail, enrichStatusMessage } = await import('@/lib/hunter')
                const r = await enrichContactEmail(inserted.id, null, nameQuery, companyQuery)
                await sendMessage(from.id, enrichStatusMessage(r, hunterLang(lang)))
              } catch { /* non-fatal */ }
            }
          }
        }

        // ── /p name not found, cancel create ──────────────────────────────────
        else if (data === 'cancel_p') {
          await answerCallbackQuery(callbackQueryId)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await clearSession(from.id)
          await sendMessage(from.id, m.cbCancelled)
        }

        // ── Select contact for /p photo ───────────────────────────────────────
        else if (data?.startsWith('select_photo_')) {
          const contactId = data.replace('select_photo_', '')
          const { data: contact } = await db.from('contacts').select('id, name').eq('id', contactId).single()
          await setSession(from.id, 'waiting_for_photo', { contact_id: contactId, contact_name: contact?.name })
          await answerCallbackQuery(callbackQueryId)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await sendMessage(from.id, m.personPhotoFoundOne(contact?.name ?? ''))
        }

        // ── Done collecting /p photos → ask for note ─────────────────────────
        else if (data?.startsWith('done_photo_')) {
          const contactId = data.replace('done_photo_', '')
          const session = await getSession(from.id)
          const fileIds = (session?.context?.pending_file_ids as string[] | undefined) ?? []
          const contactNameHint = session?.context?.contact_name as string | undefined
          await answerCallbackQuery(callbackQueryId)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          if (fileIds.length === 0) {
            await sendMessage(from.id, m.pendingPhotoMissing)
            await clearSession(from.id)
          } else {
            await setSession(from.id, 'waiting_for_photo_note', { contact_id: contactId, contact_name: contactNameHint, pending_file_ids: fileIds })
            // Count text: zh / en / ja have different pluralization conventions; show the number with a unit-appropriate suffix.
            const countText = lang === 'ja'
              ? `${fileIds.length} 枚の`
              : lang === 'en'
                ? `${fileIds.length} `
                : (fileIds.length === 1 ? '張' : `${fileIds.length} 張`)
            await sendMessage(from.id, m.photoNoteAsk(countText), {
              reply_markup: { inline_keyboard: [[
                { text: m.btnSkipDirectSave, callback_data: 'skip_photo_note' },
              ]] }
            })
          }
        }

        // ── Confirm /p photo (legacy single-photo path) ───────────────────────
        else if (data?.startsWith('confirm_photo_')) {
          const contactId = data.replace('confirm_photo_', '')
          const session = await getSession(from.id)
          const fileId = session?.context?.pending_file_id as string | undefined
          const contactNameHint = session?.context?.contact_name as string | undefined
          await answerCallbackQuery(callbackQueryId)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          if (!fileId) {
            await sendMessage(from.id, m.pendingPhotoMissing)
            await clearSession(from.id)
          } else {
            await setSession(from.id, 'waiting_for_photo_note', { contact_id: contactId, contact_name: contactNameHint, pending_file_ids: [fileId] })
            await sendMessage(from.id, m.photoNoteAskSingle, {
              reply_markup: { inline_keyboard: [[
                { text: m.btnSkipDirectSave, callback_data: 'skip_photo_note' },
              ]] }
            })
          }
        }

        // ── Skip photo note ───────────────────────────────────────────────────
        else if (data === 'skip_photo_note') {
          const session = await getSession(from.id)
          const contactId = session?.context?.contact_id as string | undefined
          const fileIds = (session?.context?.pending_file_ids as string[] | undefined) ?? []
          const contactNameHint = session?.context?.contact_name as string | undefined
          await answerCallbackQuery(callbackQueryId)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          if (!contactId || fileIds.length === 0) {
            await sendMessage(from.id, m.pendingPhotoMissing)
            await clearSession(from.id)
          } else {
            await sendMessage(from.id, m.photoUploading)
            await processPersonalPhoto(from.id, from.id, contactId, fileIds, contactNameHint, undefined, m)
          }
        }

        // ── Cancel /p ─────────────────────────────────────────────────────────
        else if (data === 'cancel_photo') {
          await clearSession(from.id)
          await answerCallbackQuery(callbackQueryId)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await sendMessage(from.id, m.cancelGeneric)
        }

        // ── Confirm LinkedIn contact ───────────────────────────────────────────
        else if (data === 'confirm_li') {
          const session = await getSession(from.id)
          const parsed = session?.context?.parsed as Record<string, string> | undefined
          const liFileId = session?.context?.file_id as string | undefined
          await answerCallbackQuery(callbackQueryId)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          if (!parsed) {
            await sendMessage(from.id, m.liNotFound)
            await clearSession(from.id)
          } else {
            // Name fallback: use English name if no local language name
            const contactName = parsed.name || parsed.name_en || null
            const { data: inserted, error } = await db
              .from('contacts')
              .insert({
                name: contactName,
                name_en: parsed.name_en || null,
                job_title: parsed.job_title || null,
                company: parsed.company || null,
                email: parsed.email || null,
                linkedin_url: parsed.linkedin_url || null,
                source: 'linkedin',
                language: countryToLanguage(parsed.country_code),
                created_by: user.id,
              })
              .select('id')
              .single()
            if (error || !inserted) {
              await sendMessage(from.id, m.liInsertFailed(error?.message ?? m.unknownError))
            } else {
              // Upload LinkedIn screenshot to Storage
              if (liFileId) {
                try {
                  const imgBuffer = await downloadTelegramPhoto(liFileId)
                  const compressed = await processCardImage(imgBuffer)
                  const storagePath = `${orgCtx.orgId}/cards/linkedin_${inserted.id}_${Date.now()}.jpg`
                  const { error: uploadError } = await supabase.storage
                    .from('cards').upload(storagePath, compressed, { contentType: 'image/jpeg', upsert: false })
                  if (!uploadError) {
                    const { data: publicUrlData } = supabase.storage.from('cards').getPublicUrl(storagePath)
                    await db.from('contacts').update({ card_img_url: publicUrlData.publicUrl }).eq('id', inserted.id)
                  }
                } catch {
                  // Screenshot upload failure is non-fatal
                }
              }
              if (parsed.notes) {
                await db.from('interaction_logs').insert({
                  contact_id: inserted.id,
                  type: 'note',
                  content: parsed.notes,
                  created_by: user.id,
                })
              }
              await updateLastContact(from.id, inserted.id)
              const appUrl = await resolveAppUrl()
              const contactLink = appUrl ? `\n\n👤 <a href="${appUrl}/contacts/${inserted.id}">${m.cardViewContactLink}</a>` : ''
              const displayName = parsed.name || parsed.name_en || m.cardThisContact
              await sendMessage(from.id, m.liSavedWithLink(displayName, contactLink))

              // Hunter.io email enrichment — only if no email was found
              if (!parsed.email) {
                try {
                  const { enrichContactEmail, enrichStatusMessage } = await import('@/lib/hunter')
                  const r = await enrichContactEmail(
                    inserted.id,
                    parsed.name_en ?? null,
                    parsed.name ?? null,
                    parsed.company ?? null,
                  )
                  await sendMessage(from.id, enrichStatusMessage(r, hunterLang(lang)))
                } catch {
                  // Hunter.io enrichment failure is non-fatal
                }
              }
            }
            await clearSession(from.id)
          }
        }

        // ── Cancel LinkedIn ────────────────────────────────────────────────────
        else if (data === 'cancel_li') {
          await clearSession(from.id)
          await answerCallbackQuery(callbackQueryId)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await sendMessage(from.id, m.cancelGeneric)
        }

        // ── /search: quick email from contact ────────────────────────────────
        else if (data?.startsWith('email_contact_')) {
          const contactId = data.replace('email_contact_', '')
          const { data: contact } = await db
            .from('contacts')
            .select('id, name, email')
            .eq('id', contactId)
            .single()
          await setSession(from.id, 'waiting_email_method', {
            contact_id: contactId,
            contact_name: contact?.name,
            contact_email: contact?.email,
          })
          await answerCallbackQuery(callbackQueryId)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await sendMessage(from.id,
            m.emailRecipientPromptShort(contact?.name ?? '', contact?.email || m.emailEmptyEmailLabel),
            { reply_markup: { inline_keyboard: [[
              { text: m.emailBtnTemplate, callback_data: 'email_method_1' },
              { text: m.emailBtnAI, callback_data: 'email_method_2' },
            ]] } }
          )
        }

        // ── /search: quick note from contact ─────────────────────────────────
        else if (data?.startsWith('note_contact_')) {
          const contactId = data.replace('note_contact_', '')
          const { data: contact } = await db
            .from('contacts')
            .select('id, name')
            .eq('id', contactId)
            .single()
          await setSession(from.id, 'waiting_for_note_content', { contact_id: contactId, contact_name: contact?.name })
          await answerCallbackQuery(callbackQueryId)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await sendMessage(from.id, m.noteFoundOnePlain(contact?.name ?? ''))
        }

        // ── /email: select contact from list ─────────────────────────────────
        else if (data?.startsWith('select_email_contact_')) {
          const contactId = data.replace('select_email_contact_', '')
          const { data: contact } = await db
            .from('contacts')
            .select('id, name, email')
            .eq('id', contactId)
            .single()
          await setSession(from.id, 'waiting_email_method', {
            contact_id: contactId,
            contact_name: contact?.name,
            contact_email: contact?.email,
          })
          await answerCallbackQuery(callbackQueryId)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await sendMessage(from.id,
            m.emailRecipientPromptShort(contact?.name ?? '', contact?.email || m.emailEmptyEmailLabel),
            { reply_markup: { inline_keyboard: [[
              { text: m.emailBtnTemplate, callback_data: 'email_method_1' },
              { text: m.emailBtnAI, callback_data: 'email_method_2' },
            ]] } }
          )
        }

        // ── /email: method choice 1 (template) ───────────────────────────────
        else if (data === 'email_method_1') {
          const session = await getSession(from.id)
          const { data: templates } = await db
            .from('email_templates')
            .select('id, title, subject')
            .order('created_at', { ascending: false })
            .limit(10)

          if (!templates || templates.length === 0) {
            await answerCallbackQuery(callbackQueryId, m.emailNoTemplatesPick)
            await sendMessage(from.id, m.emailNoTemplates)
            return NextResponse.json({ ok: true })
          }

          const buttons = templates.map((t: { id: string; title: string }) => [{
            text: t.title,
            callback_data: `select_email_tpl_${t.id}`,
          }])
          await setSession(from.id, 'waiting_template_choice', session?.context ?? {})
          await answerCallbackQuery(callbackQueryId)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await sendMessage(from.id, m.emailPickTemplate, { reply_markup: { inline_keyboard: buttons } })
        }

        // ── /email: method choice 2 (AI generate) ────────────────────────────
        else if (data === 'email_method_2') {
          const session = await getSession(from.id)
          await setSession(from.id, 'waiting_email_description', session?.context ?? {})
          await answerCallbackQuery(callbackQueryId)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await sendMessage(from.id, m.emailDescribePurpose)
        }

        // ── /email: select template ───────────────────────────────────────────
        else if (data?.startsWith('select_email_tpl_')) {
          const templateId = data.replace('select_email_tpl_', '')
          const { data: tpl } = await db
            .from('email_templates')
            .select('id, title, subject, body_content')
            .eq('id', templateId)
            .single()

          const session = await getSession(from.id)
          await setSession(from.id, 'waiting_email_supplement', {
            ...session?.context,
            template_id: templateId,
            template_subject: tpl?.subject ?? '',
            template_body: tpl?.body_content ?? '',
          })
          await answerCallbackQuery(callbackQueryId)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await sendMessage(from.id, m.emailTemplateChosen(tpl?.title ?? ''))
        }

        // ── /email: confirm send ──────────────────────────────────────────────
        else if (data === 'confirm_email') {
          const session = await getSession(from.id)
          if (!session?.context) throw new Error(m.emailSessionMissing)

          const contactEmail = session.context.contact_email as string
          const contactId = session.context.contact_id as string
          const subject = session.context.subject as string
          const bodyHtml = session.context.body_html as string

          if (!contactEmail) {
            await answerCallbackQuery(callbackQueryId, m.emailNoEmailAddrCb)
            await sendMessage(from.id, m.emailNoEmailAddr)
            await clearSession(from.id)
            return NextResponse.json({ ok: true })
          }

          await sendMessage(from.id, m.emailSending)
          try {
            const accessToken = await getValidProviderToken(user.id)
            await sendMail({
              accessToken,
              to: contactEmail,
              subject,
              body: bodyHtml,
            })
            await db.from('interaction_logs').insert({
              contact_id: contactId,
              type: 'email',
              content: bodyHtml,
              email_subject: subject,
              created_by: user.id,
            })
            await clearSession(from.id)
            await answerCallbackQuery(callbackQueryId, m.emailSentCb)
            await editMessageReplyMarkup(message.chat.id, message.message_id)
            await sendMessage(from.id, m.emailSentDetail(subject))
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            throw new Error(m.emailSendFailed(msg))
          }
        }

        // ── /search: load interaction logs (on demand) ───────────────────────
        else if (data?.startsWith('log_contact_')) {
          // format: log_contact_{contactId}_{offset}
          const parts = data.split('_')
          const offset = parseInt(parts[parts.length - 1], 10) || 0
          const contactId = parts.slice(2, parts.length - 1).join('_')

          const { data: contact } = await db
            .from('contacts').select('name').eq('id', contactId).single()
          const { data: logs } = await db
            .from('interaction_logs')
            .select('type, content, created_at')
            .eq('contact_id', contactId)
            .order('created_at', { ascending: false })
            .range(offset, offset + 4)

          await answerCallbackQuery(callbackQueryId)

          if (!logs || logs.length === 0) {
            await sendMessage(from.id, m.logsNone(contact?.name ?? ''))
          } else {
            const typeLabel = (t: string): string => {
              if (t === 'note') return m.logTypeNote
              if (t === 'meeting') return m.logTypeMeeting
              if (t === 'email') return m.logTypeEmail
              if (t === 'system') return m.logTypeSystem
              return t
            }
            const lines = logs.map((l: { type: string; created_at: string; content: string | null }) => {
              const label = typeLabel(l.type)
              const date = new Date(l.created_at).toLocaleDateString(dateLocale(lang))
              const preview = (l.content ?? '').replace(/<[^>]+>/g, '').slice(0, 80)
              return `[${label}] ${date}\n${preview}`
            }).join('\n\n')

            const hasMore = logs.length === 5
            const buttons = hasMore
              ? [[{ text: m.logsBtnLoadMore, callback_data: `log_contact_${contactId}_${offset + 5}` }]]
              : []

            await sendMessage(from.id,
              m.logsHeader(contact?.name ?? '', offset + 1, offset + logs.length) + lines,
              buttons.length > 0 ? { reply_markup: { inline_keyboard: buttons } } : {}
            )
          }
        }

        // ── /note: use last contact ───────────────────────────────────────────
        else if (data?.startsWith('use_last_note_')) {
          const contactId = data.replace('use_last_note_', '')
          const { data: contact } = await db
            .from('contacts').select('id, name').eq('id', contactId).single()
          await setSession(from.id, 'waiting_for_note_content', { contact_id: contactId, contact_name: contact?.name })
          await answerCallbackQuery(callbackQueryId)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await sendMessage(from.id, m.noteFoundOnePlain(contact?.name ?? ''))
        }

        // ── /note: search other contact ───────────────────────────────────────
        else if (data === 'search_other_note') {
          await setSession(from.id, 'waiting_for_note_contact', {})
          await answerCallbackQuery(callbackQueryId)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await sendMessage(from.id, m.emailEnterContactNameOrCompany)
        }

        // ── /email: use last contact ──────────────────────────────────────────
        else if (data?.startsWith('use_last_email_')) {
          const contactId = data.replace('use_last_email_', '')
          const { data: contact } = await db
            .from('contacts').select('id, name, email').eq('id', contactId).single()
          await setSession(from.id, 'waiting_email_method', {
            contact_id: contactId,
            contact_name: contact?.name,
            contact_email: contact?.email,
          })
          await answerCallbackQuery(callbackQueryId)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await sendMessage(from.id,
            m.emailRecipientPromptShort(contact?.name ?? '', contact?.email || m.emailEmptyEmailLabel),
            { reply_markup: { inline_keyboard: [[
              { text: m.emailBtnTemplate, callback_data: 'email_method_1' },
              { text: m.emailBtnAI, callback_data: 'email_method_2' },
            ]] } }
          )
        }

        // ── /email: search other contact ──────────────────────────────────────
        else if (data === 'search_other_email') {
          await setSession(from.id, 'waiting_contact_for_email', {})
          await answerCallbackQuery(callbackQueryId)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await sendMessage(from.id, m.emailEnterContactQuery)
        }

        // ── /email: cancel ────────────────────────────────────────────────────
        else if (data === 'cancel_email') {
          await clearSession(from.id)
          await answerCallbackQuery(callbackQueryId, m.cbCancelled)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await sendMessage(from.id, m.emailCancelled)
        }

        // ── /met: confirm apply ───────────────────────────────────────────────
        else if (data === 'met_confirm') {
          await answerCallbackQuery(callbackQueryId, m.metCbApplying)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          try {
            const session = await getSession(from.id)
            const ctx = session?.context as { contact_ids: string[]; met_at: string | null; met_date: string; referred_by: string | null } | undefined
            if (!ctx?.contact_ids?.length) throw new Error(m.metApplyMissing)
            const { contact_ids, met_at, met_date, referred_by } = ctx
            await db.from('contacts').update({
              met_at: met_at ?? null,
              met_date: met_date ?? null,
              referred_by: referred_by ?? null,
            }).in('id', contact_ids)
            const logContent = m.metLogContent(met_at ?? m.cardEmptyValue, met_date, referred_by ?? '')
            await db.from('interaction_logs').insert(
              contact_ids.map((contact_id) => ({ contact_id, type: 'meeting', content: logContent, created_by: user.id }))
            )
            await clearSession(from.id)
            await sendMessage(from.id, m.metAppliedTo(contact_ids.length))
          } catch (e) {
            await sendMessage(from.id, m.metApplyFailed(e instanceof Error ? e.message : m.meetTryAgainLater))
          }
        }

        // ── /met: cancel ──────────────────────────────────────────────────────
        else if (data === 'met_cancel') {
          await clearSession(from.id)
          await answerCallbackQuery(callbackQueryId, m.cbCancelled)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await sendMessage(from.id, m.cancelGeneric)
        }

        // ── /tasks: mark done ─────────────────────────────────────────────────
        else if (data?.startsWith('task_done_')) {
          const taskId = data.replace('task_done_', '')
          const { data: task } = await db
            .from('tasks')
            .select('title, created_by, task_assignees(assignee_email)')
            .eq('id', taskId)
            .single()
          await db.from('tasks').update({
            status: 'done',
            completed_by: user.email,
            completed_at: new Date().toISOString(),
          }).eq('id', taskId)
          await answerCallbackQuery(callbackQueryId, m.taskDoneCallback)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await sendMessage(from.id, m.taskDoneNotice(task?.title ?? ''))

          // Notify task creator + other assignees via Teams.
          // Teams notification is localized to the actor's bot language (the
          // recipient's preferred language isn't easily reachable here without
          // an extra query per user, and Teams notifications historically use a
          // single locale — keeping behavior simple).
          if (task) {
            const completedBy = user.display_name ?? user.email.split('@')[0]
            const assigneeEmails = ((task.task_assignees ?? []) as Array<{ assignee_email: string }>)
              .map(a => a.assignee_email)
            const notifyEmails = [...new Set([task.created_by, ...assigneeEmails])]
              .filter(e => e !== user.email)

            if (notifyEmails.length > 0) {
              const { data: notifyUsers } = await supabase
                .from('users')
                .select('teams_conversation_id, teams_service_url')
                .in('email', notifyEmails)
                .not('teams_conversation_id', 'is', null)

              for (const au of notifyUsers ?? []) {
                if (!au.teams_conversation_id || !au.teams_service_url) continue
                try {
                  await sendTeamsMessage(au.teams_service_url, au.teams_conversation_id,
                    m.taskDoneTeamsNotify(task.title, completedBy))
                } catch (e) {
                  console.error('[Teams] task done notification failed:', e)
                }
              }
            }
          }
        }

        // ── /tasks: postpone ──────────────────────────────────────────────────
        else if (data?.startsWith('task_postpone_')) {
          const taskId = data.replace('task_postpone_', '')
          await setSession(from.id, 'waiting_task_postpone_date', { task_id: taskId })
          await answerCallbackQuery(callbackQueryId)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await sendMessage(from.id, m.taskPostponePrompt)
        }

        // ── /tasks: cancel task ───────────────────────────────────────────────
        else if (data?.startsWith('task_cancel_')) {
          const taskId = data.replace('task_cancel_', '')
          const { data: task } = await db.from('tasks').select('title').eq('id', taskId).single()
          await db.from('tasks').update({ status: 'cancelled' }).eq('id', taskId)
          await answerCallbackQuery(callbackQueryId, m.taskCancelCallback)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await sendMessage(from.id, m.taskCancelledNotice(task?.title ?? ''))
        }

        // ── Task digest reminder: mark done (trdone_<taskId>, from task-reminders cron)
        // 不清掉原訊息的 reply_markup：digest 一則訊息可能帶多個任務的按鈕。
        else if (data?.startsWith('trdone_')) {
          const taskId = data.replace('trdone_', '')
          const { data: task } = await db
            .from('tasks').select('id, title').eq('id', taskId).maybeSingle()
          if (!task) {
            await answerCallbackQuery(callbackQueryId, m.taskNotFound)
            return NextResponse.json({ ok: true })
          }
          await db.from('tasks').update({
            status: 'done',
            completed_by: user.email,
            completed_at: new Date().toISOString(),
          }).eq('id', taskId)
          await answerCallbackQuery(callbackQueryId, m.taskDoneCallback)
          await sendMessage(from.id, m.taskDoneNotice(task.title ?? ''))
        }

        // ── Task digest reminder: snooze 1 day (trsnooze_<taskId>) ───────────
        else if (data?.startsWith('trsnooze_')) {
          const taskId = data.replace('trsnooze_', '')
          const { data: task } = await db
            .from('tasks').select('id').eq('id', taskId).maybeSingle()
          if (!task) {
            await answerCallbackQuery(callbackQueryId, m.taskNotFound)
            return NextResponse.json({ ok: true })
          }
          const newDueIso = new Date(Date.now() + 86_400_000).toISOString()
          await db.from('tasks').update({ due_at: newDueIso }).eq('id', taskId)
          await answerCallbackQuery(callbackQueryId)
          await sendMessage(from.id, m.taskPostponed(
            new Date(newDueIso).toLocaleString(dateLocale(lang), { timeZone: 'Asia/Taipei' })
          ))
        }

        // ── Follow-up task from a scanned card ────────────────────────────────
        else if (data?.startsWith('followup_')) {
          // callback_data = followup_<contactId>_<days>; contactId is a UUID
          // (contains '-' but no '_'), so split on the LAST underscore.
          const rest = data.replace('followup_', '')
          const sep = rest.lastIndexOf('_')
          const contactId = rest.slice(0, sep)
          const days = parseInt(rest.slice(sep + 1), 10)

          const { data: contact } = await db
            .from('contacts').select('name').eq('id', contactId).single()
          const contactName = contact?.name ?? m.cardThisContact

          const dueAt = new Date(Date.now() + days * 86_400_000).toISOString()
          const { data: task, error } = await db
            .from('tasks')
            .insert({
              title: m.followupTaskTitle(contactName),
              due_at: dueAt,
              created_by: user.email,
              contact_id: contactId,
            })
            .select('id')
            .single()
          if (error || !task) {
            await answerCallbackQuery(callbackQueryId, m.taskSaveFailed)
            await sendMessage(from.id, m.taskSaveFailed)
            return NextResponse.json({ ok: true })
          }
          await db.from('task_assignees').insert({ task_id: task.id, assignee_email: user.email })

          await answerCallbackQuery(callbackQueryId, m.followupCbCreated)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          const dueLine = m.taskDueLabel(new Date(dueAt).toLocaleString(dateLocale(lang), { timeZone: 'Asia/Taipei' }))
          await sendMessage(from.id, m.followupCreated(contactName, dueLine))
        }

      } catch (err) {
        const msg = err instanceof Error
          ? err.message
          : (typeof err === 'object' && err !== null ? JSON.stringify(err) : String(err))
        console.error('[bot] callback error:', msg)
        // callback 錯誤不會到達最外層 catch → 這裡也記 dead-letter
        await logBotError(body, err)
        await answerCallbackQuery(callbackQueryId, m.callbackOpFailed)
        await sendMessage(from.id, m.processingFailed(msg))
      }

      return NextResponse.json({ ok: true })
    }

    // --- Message ---
    const message = body.message
    if (!message) return NextResponse.json({ ok: true })

    const chatId: number = message.chat.id
    const fromId: number = message.from?.id

    const lang = await getBotLanguage(message.from, supabase)
    const m = BOT_MESSAGES[lang]

    const user = await getAuthorizedUser(fromId)
    if (!user) {
      await sendMessage(chatId, m.unauthorized)
      return NextResponse.json({ ok: true })
    }

    // Maintenance mode check — block non-super_admin
    if (user.role !== 'super_admin') {
      const { data: setting } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'maintenance_mode')
        .single()
      if (setting?.value === 'true') {
        await sendMessage(chatId, m.maintenanceUserBlocked)
        return NextResponse.json({ ok: true })
      }
    }

    const session = await getSession(fromId)

    if (message.photo) {
      const photo = message.photo[message.photo.length - 1]
      await handlePhoto(chatId, fromId, user, photo, session, m, lang)
    } else if (message.document && message.document.mime_type?.startsWith('image/')) {
      // Image sent as file — route to same handlers; EXIF will be preserved
      const doc = { file_id: message.document.file_id }
      await handlePhoto(chatId, fromId, user, doc, session, m, lang)
    } else if (message.text) {
      await handleText(chatId, fromId, user, message.text, session, m, lang)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    // Dead-letter：這裡原本靜默吞掉錯誤，現在先記到 bot_errors 再回 ok
    await logBotError(rawUpdate, err)
    return NextResponse.json({ ok: true })
  }
}
