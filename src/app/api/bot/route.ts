import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getBotLanguage, BOT_MESSAGES, type BotMessages } from '@/lib/bot-messages'
import { analyzeBusinessCard, generateEmailContent, parseTaskCommand, parseMeetingCommand, parseMetCommand, parseVisitNote, parseLinkedInScreenshot } from '@/lib/gemini'
import { processCardImage, processPhotoWithExif, extractExif, generateCardFilename } from '@/lib/imageProcessor'
import { checkDuplicates } from '@/lib/duplicate'
import { sendMail, createCalendarEvent } from '@/lib/graph'
import { getValidProviderToken } from '@/lib/graph-server'
import { sendTeamsTaskNotification, sendTeamsMessage } from '@/lib/teams'

function countryToLanguage(code: string | null | undefined): string {
  if (code === 'TW' || code === 'CN') return 'chinese'
  if (code === 'JP') return 'japanese'
  return 'english'
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
    // Notify user we're retrying (best-effort)
    await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: '⏳ Telegram 暫時繁忙，3 秒後自動重試...', parse_mode: 'HTML' }),
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
        body: JSON.stringify({ chat_id: chatId, text: '❌ 傳送失敗，請稍後再試。', parse_mode: 'HTML' }),
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
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('bot_sessions')
    .select('state, context, last_contact_id')
    .eq('telegram_id', telegramId)
    .maybeSingle()
  return data as { state: string; context: Record<string, unknown>; last_contact_id: string | null } | null
}

async function setSession(telegramId: number, state: string, context: Record<string, unknown>) {
  const supabase = createServiceClient()
  await supabase.from('bot_sessions').upsert(
    { telegram_id: telegramId, state, context, updated_at: new Date().toISOString() },
    { onConflict: 'telegram_id' }
  )
}

async function clearSession(telegramId: number) {
  // Upsert with null state/context to preserve last_contact_id
  const supabase = createServiceClient()
  await supabase.from('bot_sessions').upsert(
    { telegram_id: telegramId, state: null, context: null, updated_at: new Date().toISOString() },
    { onConflict: 'telegram_id' }
  )
}

async function updateLastContact(telegramId: number, contactId: string) {
  const supabase = createServiceClient()
  await supabase.from('bot_sessions').upsert(
    { telegram_id: telegramId, last_contact_id: contactId, updated_at: new Date().toISOString() },
    { onConflict: 'telegram_id' }
  )
}

// ── Auth helper ───────────────────────────────────────────────────────────────

async function getAuthorizedUser(telegramId: number) {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('users')
    .select('id, email, display_name, ai_model_id, provider_token, role')
    .eq('telegram_id', telegramId)
    .single()
  return data as { id: string; email: string; display_name: string | null; ai_model_id: string | null; provider_token: string | null; role: string | null } | null
}

// ── Download photo from Telegram ──────────────────────────────────────────────

async function downloadTelegramPhoto(fileId: string): Promise<Buffer> {
  const fileRes = await fetch(`${TELEGRAM_API}/getFile?file_id=${fileId}`)
  const fileData = await fileRes.json()
  const filePath = fileData.result.file_path
  const imgRes = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`)
  return Buffer.from(await imgRes.arrayBuffer())
}

// ── Handle /AI ────────────────────────────────────────────────────────────────

async function handleAI(chatId: number, aiModelId: string | null, m: BotMessages) {
  const supabase = createServiceClient()
  if (!aiModelId) {
    await sendMessage(chatId, '🤖 目前使用預設模型：<b>gemini-2.5-flash</b>')
    return
  }
  const { data: model } = await supabase
    .from('ai_models')
    .select('display_name, model_id, ai_endpoints(name)')
    .eq('id', aiModelId)
    .single()
  if (!model) {
    await sendMessage(chatId, '🤖 目前使用預設模型：<b>gemini-2.5-flash</b>')
    return
  }
  const endpointName = (model.ai_endpoints as unknown as { name: string } | null)?.name ?? ''
  await sendMessage(chatId,
    `🤖 目前使用的 AI 模型：\n\n` +
    `<b>${model.display_name}</b>\n` +
    `模型 ID：<code>${model.model_id}</code>` +
    (endpointName ? `\n端點：${endpointName}` : '')
  )
}

// ── Search contacts ───────────────────────────────────────────────────────────

async function searchContacts(query: string) {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('contacts')
    .select('id, name, company, job_title, email, phone, card_img_url, card_img_back_url')
    .is('deleted_at', null)
    .or(`name.ilike.%${query}%,company.ilike.%${query}%,email.ilike.%${query}%`)
    .limit(5)
  return data ?? []
}

// ── Meeting helpers ────────────────────────────────────────────────────────────

function formatTaipeiRange(startIso: string, durationMinutes: number): string {
  const start = new Date(startIso)
  const end = new Date(start.getTime() + durationMinutes * 60000)
  const fmt = (d: Date) => d.toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric',
    weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  })
  const endTime = end.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false })
  return `${fmt(start)} – ${endTime}（台北）`
}

function durationLabel(minutes: number): string {
  if (minutes === 30) return '30 分鐘'
  if (minutes === 60) return '1 小時'
  if (minutes === 90) return '1.5 小時'
  return '2 小時'
}

async function handleMeet(
  chatId: number,
  user: { id: string; email: string; display_name: string | null; ai_model_id: string | null; provider_token: string | null; role: string | null },
  text: string,
  m: BotMessages,
) {
  const supabase = createServiceClient()
  if (!text.trim()) {
    await sendMessage(chatId, m.meetUsage)
    return
  }

  await sendMessage(chatId, m.meetParsing)

  let parsed
  try {
    parsed = await parseMeetingCommand(text, new Date().toISOString(), user.ai_model_id)
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
      .or(parsed.attendees.map((a: string) => `display_name.ilike.%${a}%,email.ilike.%${a}%`).join(','))
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
  const { data: draft, error: draftErr } = await supabase
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

  const timeLabel = formatTaipeiRange(parsed.start_iso, parsed.duration_minutes)
  const allAttendees = ['你', ...attendeeNames]
  const confirmText =
    `📅 <b>確認建立行程</b>\n\n` +
    `<b>標題：</b>${parsed.title}\n` +
    `<b>時間：</b>${timeLabel}\n` +
    `<b>時長：</b>${durationLabel(parsed.duration_minutes)}\n` +
    `<b>參與者：</b>${allAttendees.join('、')}\n` +
    (parsed.location ? `<b>地點：</b>${parsed.location}\n` : '') +
    `\n請確認後按下方按鈕。`

  await sendMessage(chatId, confirmText, {
    reply_markup: {
      inline_keyboard: [[
        { text: '✅ 確認建立', callback_data: `meet_confirm_${draft.id}` },
        { text: '❌ 取消', callback_data: `meet_cancel_${draft.id}` },
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

async function handleSearch(chatId: number, keyword: string, m: BotMessages) {
  const contacts = await searchContacts(keyword)
  if (contacts.length === 0) {
    await sendMessage(chatId, m.searchNotFound(keyword))
    return
  }

  for (const c of contacts) {
    const info =
      `👤 <b>${c.name || '—'}</b>\n` +
      `🏢 ${c.company || '—'}\n` +
      `💼 ${c.job_title || '—'}\n` +
      `📧 ${c.email || '—'}\n` +
      `📞 ${c.phone || '—'}`

    const buttons = [
      [
        { text: '✉️ 發信', callback_data: `email_contact_${c.id}` },
        { text: '📝 筆記', callback_data: `note_contact_${c.id}` },
        { text: '📋 互動紀錄', callback_data: `log_contact_${c.id}_0` },
      ],
    ]

    await sendMessage(chatId, info, { reply_markup: { inline_keyboard: buttons } })

    if (c.card_img_url) await sendPhoto(chatId, c.card_img_url)
    if (c.card_img_back_url) await sendPhoto(chatId, c.card_img_back_url)
  }
}

// ── Process back card photo (shared by photo handler and confirm callback) ────

// ── /a: Add card photo — OCR → show diff → user decides ──────────────────────

const CARD_FIELD_LABELS: Record<string, string> = {
  name: '姓名', name_en: '英文姓名', name_local: '日文姓名',
  company: '公司', job_title: '職稱',
  email: 'Email', phone: '電話', second_phone: '第二電話',
  address: '地址', website: '網站',
}

async function processAddCardPhoto(
  chatId: number,
  fromId: number,
  user: { id: string; ai_model_id: string | null },
  contactId: string,
  fileId: string,
  contactNameHint?: string,
  m?: BotMessages
) {
  const _m = m ?? BOT_MESSAGES.zh
  const supabase = createServiceClient()
  try {
    const imgBuffer = await downloadTelegramPhoto(fileId)
    let compressed = await processCardImage(imgBuffer)

    const { data: existing } = await supabase
      .from('contacts')
      .select('name, name_en, name_local, company, job_title, email, phone, second_phone, address, website')
      .eq('id', contactId)
      .single()

    await sendMessage(chatId, '⏳ OCR 辨識中，請稍候...')
    const cardData = await analyzeBusinessCard(compressed, user.ai_model_id)

    if (cardData.rotation) {
      const sharpLib = (await import('sharp')).default
      compressed = await sharpLib(compressed).rotate(cardData.rotation).jpeg({ quality: 85 }).toBuffer()
    }

    // Upload card image
    const safeName = (existing?.name || cardData.name || cardData.name_en || '').replace(/[\s,./\\]/g, '')
    const filename = await generateCardFilename({ name: safeName || undefined, side: 'front' })
    const storagePath = `cards/${filename}`
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
      if (!oldVal) toFill.push({ key, label: CARD_FIELD_LABELS[key] ?? key, value: newVal })
      else if (oldVal !== newVal) conflicts.push({ key, label: CARD_FIELD_LABELS[key] ?? key, newVal, oldVal })
    }

    // Build diff message
    const displayName = contactNameHint ?? existing?.name ?? '此聯絡人'
    let diffText = `📇 <b>${displayName}</b> 名片 OCR 結果：\n\n`
    if (toFill.length > 0) {
      diffText += `✅ <b>填入空白欄位：</b>\n`
      toFill.forEach(f => { diffText += `• ${f.label}：${f.value}\n` })
      diffText += '\n'
    }
    if (conflicts.length > 0) {
      diffText += `⚠️ <b>與現有不同（存入備註）：</b>\n`
      conflicts.forEach(c => { diffText += `• ${c.label}：${c.newVal}（現有：${c.oldVal}）\n` })
      diffText += '\n'
    }
    if (toFill.length === 0 && conflicts.length === 0) {
      diffText += '資料與現有記錄相同，名片將直接存入。\n'
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
          { text: '✅ 確認套用', callback_data: `apply_card_${contactId}` },
          { text: '📎 只存名片', callback_data: `skip_card_apply_${contactId}` },
        ]]
      }
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[bot] add card error:', msg)
    await sendMessage(chatId, `❌ 處理失敗：${msg}`)
  }
}

// ── Apply or skip card diff ────────────────────────────────────────────────────

async function applyCardDiff(
  chatId: number,
  fromId: number,
  contactId: string,
  apply: boolean
) {
  const supabase = createServiceClient()
  try {
    const session = await getSession(fromId)
    const ctx = session?.context ?? {}
    const cardUrl = ctx.card_url as string
    const storagePath = ctx.storage_path as string
    const displayName = ctx.contact_name as string | undefined
    const toFill = (ctx.to_fill as Array<{ key: string; label: string; value: string }>) ?? []
    const conflicts = (ctx.conflicts as Array<{ key: string; label: string; newVal: string; oldVal: string }>) ?? []

    if (!cardUrl) {
      await sendMessage(chatId, '❌ 找不到待處理名片資料，請重新傳送。')
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
      ? (toFill.length > 0 ? `已填入 ${toFill.length} 個欄位` + (conflicts.length > 0 ? `，${conflicts.length} 項衝突存入備註` : '') : '資料已是最新')
      : '名片已存入，聯絡人資料未變更'
    await sendMessage(chatId, `✅ <b>${displayName ?? '聯絡人'}</b> 名片已儲存。${applyMsg}`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await sendMessage(chatId, `❌ 處理失敗：${msg}`)
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
  try {
    let uploaded = 0
    for (const fileId of fileIds) {
      const imgBuffer = await downloadTelegramPhoto(fileId)
      const compressed = await processPhotoWithExif(imgBuffer)
      const exif = await extractExif(imgBuffer)
      const filename = `photos/${Date.now()}-${contactId.slice(0, 8)}-${uploaded}.jpg`
      const { error: uploadError } = await supabase.storage
        .from('cards').upload(filename, compressed, { contentType: 'image/jpeg', upsert: false })
      if (uploadError) throw new Error(uploadError.message)
      const { data: publicUrlData } = supabase.storage.from('cards').getPublicUrl(filename)
      await supabase.from('contact_photos').insert({
        contact_id: contactId,
        photo_url: publicUrlData.publicUrl,
        storage_path: filename,
        taken_at: exif.takenAt ?? null,
        latitude: exif.latitude ?? null,
        longitude: exif.longitude ?? null,
        location_name: exif.locationName ?? null,
        note: (note && fileIds.length === 1) ? note : null,
      })
      uploaded++
    }

    if (note) {
      await supabase.from('interaction_logs').insert({
        contact_id: contactId,
        type: 'system',
        content: `【合照附註】${note}`,
      })
    }

    await updateLastContact(fromId, contactId)
    await clearSession(fromId)
    const displayName = contactNameHint ?? '此聯絡人'
    const countMsg = fileIds.length > 1 ? ` ${fileIds.length} 張` : ''
    const noteMsg = note ? '，附註已存入互動紀錄' : ''
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
  user: { id: string; email: string; display_name: string | null; ai_model_id: string | null; provider_token: string | null; role: string | null },
  photo: { file_id: string },
  session: { state: string; context: Record<string, unknown> } | null,
  m: BotMessages = BOT_MESSAGES.zh
) {
  const supabase = createServiceClient()

  // /a: Add card flow — confirmation step
  if (session?.state === 'waiting_for_add_card') {
    const contactId = session.context.contact_id as string
    const contactName = session.context.contact_name as string | undefined
    await setSession(fromId, 'waiting_for_add_card', { ...session.context, pending_file_id: photo.file_id })
    await sendMessage(chatId,
      `收到照片！要新增為 <b>${contactName ?? '此聯絡人'}</b> 的名片嗎？`,
      { reply_markup: { inline_keyboard: [[
        { text: '✅ 確認', callback_data: `confirm_add_card_${contactId}` },
        { text: '❌ 取消', callback_data: 'cancel_add_card' },
      ]] } }
    )
    return
  }

  // /li: LinkedIn screenshot — OCR → confirm → insert contact
  if (session?.state === 'waiting_for_li') {
    await sendMessage(chatId, '⏳ AI 解析中，請稍候...')
    try {
      const imgBuffer = await downloadTelegramPhoto(photo.file_id)
      const compressed = await processCardImage(imgBuffer)

      const { data: profile } = await createServiceClient()
        .from('users').select('ai_model_id').eq('id', user.id).single()

      const parsed = await parseLinkedInScreenshot(compressed, profile?.ai_model_id ?? null)

      const displayName = parsed.name || parsed.name_en || '（無姓名）'
      if (!parsed.name && !parsed.name_en) {
        await clearSession(fromId)
        await sendMessage(chatId, '❌ 無法識別為 LinkedIn 截圖，請確認截圖內容後重新傳送。')
        return
      }

      const summary =
        `🔗 <b>LinkedIn 解析結果</b>\n\n` +
        `👤 ${displayName}\n` +
        (parsed.job_title ? `💼 ${parsed.job_title}\n` : '') +
        (parsed.company ? `🏢 ${parsed.company}\n` : '') +
        (parsed.email ? `✉️ ${parsed.email}\n` : '') +
        (parsed.linkedin_url ? `🔗 ${parsed.linkedin_url}\n` : '') +
        (parsed.notes ? `\n📝 ${parsed.notes.slice(0, 100)}${parsed.notes.length > 100 ? '...' : ''}` : '')

      await setSession(fromId, 'waiting_for_li_confirm', { parsed, file_id: photo.file_id })
      await sendMessage(chatId, summary, {
        reply_markup: { inline_keyboard: [[
          { text: '✅ 確認新增', callback_data: 'confirm_li' },
          { text: '❌ 取消', callback_data: 'cancel_li' },
        ]] }
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await clearSession(fromId)
      await sendMessage(chatId, `❌ 解析失敗：${msg}`)
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
    const displayName = contactName ?? '此聯絡人'
    const doneText = `✅ 完成（${newIds.length} 張）`
    const keyboard = [[
      { text: doneText, callback_data: `done_photo_${contactId}` },
      { text: '❌ 取消', callback_data: 'cancel_photo' },
    ]]
    if (countMsgId) {
      await editMessageText(chatId, countMsgId,
        `📷 已收到 <b>${newIds.length}</b> 張（${displayName}）\n繼續傳送，或按「完成」`,
        keyboard
      )
      await setSession(fromId, 'waiting_for_photo', { ...session.context, pending_file_ids: newIds })
    } else {
      const sent = await sendMessage(chatId,
        `📷 已收到 <b>1</b> 張（${displayName}）\n繼續傳送，或按「完成」`,
        { reply_markup: { inline_keyboard: keyboard } }
      )
      await setSession(fromId, 'waiting_for_photo', { ...session.context, pending_file_ids: newIds, count_message_id: sent?.message_id })
    }
    return
  }


  // New card scan — check pending limit
  const { count: pendingCount } = await supabase
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
    storagePath = `cards/${tmpFilename}`
    const { error: uploadError } = await supabase.storage
      .from('cards')
      .upload(storagePath, compressed, { contentType: 'image/jpeg', upsert: false })
    if (uploadError) throw new Error(uploadError.message ?? String(uploadError))

    const { data: publicUrlData } = supabase.storage.from('cards').getPublicUrl(storagePath)
    cardImgUrl = publicUrlData.publicUrl

    // OCR
    const cardData = await analyzeBusinessCard(compressed, user.ai_model_id)

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
      const namedPath = `cards/${namedFile}`
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
      await supabase.from('failed_scans').insert({
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
    if (exact.length > 0) {
      const e = exact[0]
      mergeTargetId = e.id
      mergeTargetName = e.name
      dupWarning += `\n⚠️ 此 email 已有聯絡人：${e.name}（${e.company}），是否仍要新增？`
    } else if (similar.length > 0) {
      const s = similar[0]
      mergeTargetId = s.id
      mergeTargetName = s.name
      dupWarning += `\n🔍 系統有相似聯絡人：${s.name}（${s.company}），請確認是否為同一人`
    }

    const contactPayload = {
      ...cardData,
      card_img_url: cardImgUrl,
      language: countryToLanguage(cardData.country_code),
      // hidden field for "merge to existing" flow; stripped before INSERT contacts
      _merge_target_id: mergeTargetId,
    }
    const { data: pending, error: pendingError } = await supabase
      .from('pending_contacts')
      .insert({ data: contactPayload, created_by: user.id, storage_path: storagePath })
      .select('id')
      .single()
    if (pendingError || !pending) throw new Error(pendingError?.message ?? '暫存失敗')

    let countryDisplay = '—'
    if (cardData.country_code) {
      const { data: countryRow } = await supabase
        .from('countries')
        .select('emoji, name_zh')
        .eq('code', cardData.country_code)
        .single()
      countryDisplay = countryRow
        ? `${countryRow.emoji} ${countryRow.name_zh}`
        : cardData.country_code
    }

    const resultText =
      `📇 辨識結果：\n\n` +
      `👤 姓名：${cardData.name || '—'}\n` +
      `🏢 公司：${cardData.company || '—'}\n` +
      `💼 職稱：${cardData.job_title || '—'}\n` +
      `📧 Email：${cardData.email || '—'}\n` +
      `📞 電話：${cardData.phone || '—'}\n` +
      `🌍 國家：${countryDisplay}` +
      dupWarning +
      m.cardConfirmPrompt

    // Build buttons: when dup detected, offer 3rd option to merge into existing contact
    const cardButtons: Array<Array<{ text: string; callback_data: string }>> = [[
      { text: mergeTargetId ? '✅ 仍建立新聯絡人' : '✅ 確認存檔', callback_data: `save_${pending.id}` },
    ]]
    if (mergeTargetId && mergeTargetName) {
      cardButtons.push([
        { text: `📌 加到「${mergeTargetName}」`, callback_data: `merge_${pending.id}` },
      ])
    }
    cardButtons.push([{ text: '❌ 不存檔', callback_data: `cancel_${pending.id}` }])

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
      const { error: fsErr } = await supabase.from('failed_scans').insert({
        user_id: user.id,
        storage_path: storagePath,
        card_img_url: cardImgUrl,
      })
      if (fsErr) console.error('[bot] failed_scans insert error:', fsErr.message)
    } else {
      console.error('[bot] no storagePath/cardImgUrl — skipping failed_scans insert. storagePath:', storagePath, 'cardImgUrl:', cardImgUrl)
    }
    await sendMessage(chatId, `❌ 處理失敗：${msg}`)
  }
}

// ── Handle /work ──────────────────────────────────────────────────────────────

async function handleWork(
  chatId: number,
  user: { id: string; email: string; display_name: string | null; ai_model_id: string | null; provider_token: string | null; role: string | null },
  naturalText: string,
  lastContactId?: string | null,
  m: BotMessages = BOT_MESSAGES.zh
) {
  const supabase = createServiceClient()
  await sendMessage(chatId, m.taskParsing)

  let parsed
  try {
    parsed = await parseTaskCommand(naturalText, new Date().toISOString(), user.ai_model_id)
  } catch {
    await sendMessage(chatId, '❌ AI 解析失敗，請重試或換個說法。')
    return
  }

  // Resolve contact: task text > session last_contact_id
  let resolvedContactId: string | null = lastContactId ?? null
  let contactName: string | undefined
  let contactCompany: string | undefined

  if (parsed.contact_name) {
    const { data: found } = await supabase
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
    const { data: contact } = await supabase
      .from('contacts').select('name, company').eq('id', resolvedContactId).single()
    if (contact?.name) {
      contactName = contact.name
      contactCompany = contact.company ?? undefined
    }
  }

  const contactLine = contactName
    ? `🔗 聯絡人：${contactName}${contactCompany ? `（${contactCompany}）` : ''}\n`
    : ''

  // Resolve assignees from users table
  const assigneeEmails: string[] = []
  const assigneeNames: string[] = []
  for (const name of parsed.assignees) {
    const { data: found } = await supabase
      .from('users')
      .select('email, display_name, telegram_id')
      .or(`display_name.ilike.%${name}%,email.ilike.%${name}%`)
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
    assigneeNames.push('自己')
  }

  // Create task
  const { data: task, error } = await supabase
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
    await supabase.from('task_assignees').insert({ task_id: task.id, assignee_email: email })
  }

  // Notify assignees via Telegram + Teams
  const { data: notifyUsers } = await supabase
    .from('users')
    .select('email, display_name, telegram_id, teams_conversation_id, teams_service_url')
    .in('email', assigneeEmails)

  const appUrl = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? ''

  for (const au of notifyUsers ?? []) {
    if (au.email === user.email) continue

    // Telegram notification
    if (au.telegram_id) {
      const tgExtra: Record<string, unknown> = {
        reply_markup: {
          inline_keyboard: [[
            { text: '✅ 標記完成', callback_data: `task_done_${task.id}` },
            ...(appUrl ? [{ text: '📋 任務管理', url: `${appUrl}/tasks` }] : []),
          ]],
        },
      }
      await sendMessage(au.telegram_id,
        `📋 <b>新任務指派給你</b>\n\n` +
        `📌 ${parsed.title}\n` +
        (contactLine ? contactLine : '') +
        (parsed.due_at ? `⏰ 截止：${new Date(parsed.due_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}\n` : '') +
        `\n由 ${user.display_name ?? user.email.split('@')[0]} 指派。`,
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

  const dueStr = parsed.due_at
    ? `\n⏰ 截止：${new Date(parsed.due_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}`
    : ''
  const assigneeStr = isSelfReminder ? '（自我提醒）' : `→ ${assigneeNames.join('、')}`

  await sendMessage(chatId,
    `✅ 任務已建立 ${assigneeStr}\n\n📌 ${parsed.title}\n${contactLine}${dueStr}`
  )
}

// ── Handle /met ───────────────────────────────────────────────────────────────

async function handleMet(
  chatId: number,
  user: { id: string; email: string; ai_model_id: string | null },
  count: number,
  description: string,
  m: BotMessages = BOT_MESSAGES.zh
) {
  const supabase = createServiceClient()
  const nowIso = new Date().toISOString()

  console.log('[bot] handleMet called:', { chatId, count, description })
  await sendMessage(chatId, '🤖 AI 分析中...')
  let parsed
  try {
    parsed = await parseMetCommand(description, nowIso, user.ai_model_id)
    console.log('[bot] parseMetCommand result:', parsed)
  } catch (e) {
    console.error('[bot] parseMetCommand error:', e)
    await sendMessage(chatId, '❌ AI 解析失敗，請再試一次')
    return
  }

  // Fetch most recent N contacts created by this user
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, name, company')
    .eq('created_by', user.id)
    .order('created_at', { ascending: false })
    .limit(count)

  if (!contacts || contacts.length === 0) {
    await sendMessage(chatId, '找不到最近的聯絡人記錄')
    return
  }

  const metDateStr = parsed.met_date
  const metAtStr = parsed.met_at ?? '（未指定）'
  const referredStr = parsed.referred_by ? `\n介紹人：${parsed.referred_by}` : ''

  const contactList = contacts.map((c, i) => `${i + 1}. ${c.name ?? '—'}（${c.company ?? '—'}）`).join('\n')

  const confirmMsg =
    `📍 準備套用到最近 ${contacts.length} 位聯絡人：\n\n` +
    `場合：${metAtStr}\n日期：${metDateStr}${referredStr}\n\n` +
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
        { text: '✅ 確認套用', callback_data: 'met_confirm' },
        { text: '❌ 取消', callback_data: 'met_cancel' },
      ]],
    },
  })
}

// ── Handle /tasks ─────────────────────────────────────────────────────────────

async function handleTasks(
  chatId: number,
  user: { id: string; email: string; display_name: string | null; ai_model_id: string | null; provider_token: string | null; role: string | null },
  m: BotMessages = BOT_MESSAGES.zh
) {
  const supabase = createServiceClient()

  // Tasks assigned to me
  const { data: assignedRows } = await supabase
    .from('task_assignees')
    .select('task_id')
    .eq('assignee_email', user.email)

  const assignedIds = (assignedRows ?? []).map(r => r.task_id)

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
      ? `⏰ ${new Date(task.due_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}`
      : '⏰ 無截止時間'
    const isAssignedToMe = assignedIds.includes(task.id)
    const roleStr = task.created_by === user.email && !isAssignedToMe ? '（我建立）' : '（指派給我）'

    await sendMessage(chatId,
      `📋 <b>${task.title}</b> ${roleStr}\n${dueStr}`,
      {
        reply_markup: {
          inline_keyboard: [[
            { text: '✅ 完成', callback_data: `task_done_${task.id}` },
            { text: '⏭ 延後', callback_data: `task_postpone_${task.id}` },
            { text: '❌ 取消', callback_data: `task_cancel_${task.id}` },
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
  user: { id: string; email: string; display_name: string | null; ai_model_id: string | null; provider_token: string | null; role: string | null },
  text: string,
  session: { state: string; context: Record<string, unknown>; last_contact_id: string | null } | null,
  m: BotMessages = BOT_MESSAGES.zh
) {
  const supabase = createServiceClient()

  const cmd = text.trim()

  // ── Clear active session on any slash command (must run before all handlers)
  if (cmd.startsWith('/') && session?.state) {
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

  // ── /AI ────────────────────────────────────────────────────────────────────
  if (cmd.toLowerCase() === '/ai') {
    await handleAI(chatId, user.ai_model_id, m)
    return
  }

  // ── /search /s ─────────────────────────────────────────────────────────────
  const searchMatch = cmd.match(/^\/(?:search|s)\s+(.+)/)
  if (searchMatch) {
    await handleSearch(chatId, searchMatch[1].trim(), m)
    return
  }

  // ── /email /e ──────────────────────────────────────────────────────────────
  if (cmd === '/email' || cmd === '/e') {
    const lastContactId = session?.last_contact_id
    if (lastContactId) {
      const { data: lastContact } = await supabase
        .from('contacts').select('id, name, company, email').eq('id', lastContactId).single()
      if (lastContact) {
        await sendMessage(chatId,
          `要針對上一位聯絡人嗎？\n👤 ${lastContact.name}（${lastContact.company ?? ''}）`,
          { reply_markup: { inline_keyboard: [[
            { text: '✅ 是，就是他', callback_data: `use_last_email_${lastContactId}` },
            { text: '🔍 搜尋其他人', callback_data: 'search_other_email' },
          ]] } }
        )
        return
      }
    }
    await setSession(fromId, 'waiting_contact_for_email', {})
    await sendMessage(chatId, '請輸入聯絡人姓名或公司關鍵字：')
    return
  }

  // ── Session: waiting_contact_for_email ────────────────────────────────────
  if (session?.state === 'waiting_contact_for_email') {
    if (cmd.startsWith('/')) {
      await clearSession(fromId)
    } else {
      const contacts = await searchContacts(text.trim())
      if (contacts.length === 0) {
        await sendMessage(chatId, '找不到符合的聯絡人，請再試一次：')
      } else if (contacts.length === 1) {
        await setSession(fromId, 'waiting_email_method', {
          contact_id: contacts[0].id,
          contact_name: contacts[0].name,
          contact_email: contacts[0].email,
        })
        await sendMessage(chatId,
          `收件人：<b>${contacts[0].name}</b>（${contacts[0].email || '無 email'}）\n\n` +
          `請選擇發信方式：\n1. 使用 Email Template\n2. 直接描述，AI 幫你生成`,
          { reply_markup: { inline_keyboard: [[
            { text: '1️⃣ 使用 Template', callback_data: 'email_method_1' },
            { text: '2️⃣ AI 生成', callback_data: 'email_method_2' },
          ]] } }
        )
      } else {
        const buttons = contacts.map((c) => [{
          text: `${c.name}（${c.company ?? ''}）`,
          callback_data: `select_email_contact_${c.id}`,
        }])
        await sendMessage(chatId, '找到多筆聯絡人，請選擇：', { reply_markup: { inline_keyboard: buttons } })
      }
      return
    }
  }

  // ── Session: waiting_email_description ───────────────────────────────────
  if (session?.state === 'waiting_email_description') {
    if (cmd.startsWith('/')) { await clearSession(fromId) } else {
    await sendMessage(chatId, '⏳ AI 生成中，請稍候...')
    try {
      const body = await generateEmailContent(text.trim(), undefined, user.ai_model_id)
      const subject = `關於：${text.trim().slice(0, 40)}${text.trim().length > 40 ? '...' : ''}`
      const preview = body.text.replace(/<[^>]+>/g, '').slice(0, 200)

      await setSession(fromId, 'waiting_email_confirm', {
        ...session.context,
        subject,
        body_html: body.text,
      })
      await sendMessage(chatId,
        `📧 郵件預覽\n\n主旨：${subject}\n\n${preview}${preview.length >= 200 ? '...' : ''}`,
        { reply_markup: { inline_keyboard: [[
          { text: '✅ 確認發送', callback_data: 'confirm_email' },
          { text: '❌ 取消', callback_data: 'cancel_email' },
        ]] } }
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await sendMessage(chatId, `❌ AI 生成失敗：${msg}`)
    }
    return
    } // end command escape
  }

  // ── Session: waiting_email_supplement ─────────────────────────────────────
  if (session?.state === 'waiting_email_supplement') {
    if (cmd.startsWith('/')) { await clearSession(fromId) } else {
    await sendMessage(chatId, '⏳ AI 生成中，請稍候...')
    try {
      const templateContent = session.context.template_body as string
      const supplement = text.trim().toLowerCase() === 'skip' ? '' : text.trim()
      const body = await generateEmailContent(supplement || '請依照範本生成', templateContent, user.ai_model_id)
      const subject = session.context.template_subject as string || '（無主旨）'
      const preview = body.text.replace(/<[^>]+>/g, '').slice(0, 200)

      await setSession(fromId, 'waiting_email_confirm', {
        ...session.context,
        subject,
        body_html: body.text,
      })
      await sendMessage(chatId,
        `📧 郵件預覽\n\n主旨：${subject}\n\n${preview}${preview.length >= 200 ? '...' : ''}`,
        { reply_markup: { inline_keyboard: [[
          { text: '✅ 確認發送', callback_data: 'confirm_email' },
          { text: '❌ 取消', callback_data: 'cancel_email' },
        ]] } }
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await sendMessage(chatId, `❌ AI 生成失敗：${msg}`)
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
    await sendMessage(chatId, '⏳ 上傳中...')
    await processPersonalPhoto(chatId, fromId, contactId, fileIds, contactNameHint, text.trim())
    return
    } // end command escape
  }

  // ── Session: waiting_for_note_contact ─────────────────────────────────────
  if (session?.state === 'waiting_for_note_contact') {
    if (cmd.startsWith('/')) { await clearSession(fromId) } else {
    const contacts = await searchContacts(text.trim())
    if (contacts.length === 0) {
      await setSession(fromId, 'waiting_for_note_content', { contact_id: null })
      await sendMessage(chatId, '找不到此聯絡人，筆記將存為未歸類，可至網頁手動歸類。\n\n請輸入筆記內容：')
    } else if (contacts.length === 1) {
      await setSession(fromId, 'waiting_for_note_content', { contact_id: contacts[0].id, contact_name: contacts[0].name })
      await sendMessage(chatId, `找到：${contacts[0].name}（${contacts[0].company ?? ''}）\n\n請輸入筆記內容：`)
    } else {
      const buttons = contacts.map((c) => [{ text: `${c.name}（${c.company ?? ''}）`, callback_data: `select_contact_${c.id}` }])
      await sendMessage(chatId, '找到多筆聯絡人，請選擇：', { reply_markup: { inline_keyboard: buttons } })
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
      const parsed = await parseVisitNote(text.trim(), new Date().toISOString(), user.ai_model_id)
      logType = parsed.type
      meetingDate = parsed.meeting_date ?? null
      meetingTime = parsed.meeting_time ?? null
      meetingLocation = parsed.meeting_location ?? null
    } catch { /* fall back to plain note */ }

    await supabase.from('interaction_logs').insert({
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

    await sendMessage(chatId, contactName
      ? `✅ 已儲存${logType === 'meeting' ? '拜訪紀錄' : '筆記'}（${contactName}）${detail}`
      : `✅ 已儲存為未歸類${logType === 'meeting' ? '拜訪紀錄' : '筆記'}${detail}`
    )
    return
    } // end command escape
  }

  // ── Session: waiting_for_visit_contact ────────────────────────────────────
  if (session?.state === 'waiting_for_visit_contact') {
    if (cmd.startsWith('/')) { await clearSession(fromId) } else {
    const contacts = await searchContacts(text.trim())
    if (contacts.length === 0) {
      await setSession(fromId, 'waiting_for_visit_datetime', { contact_id: null, contact_name: null })
      await sendMessage(chatId, '找不到此聯絡人，拜訪紀錄將存為未歸類。\n\n請輸入拜訪日期時間（例：2026-03-29 14:00），或輸入「略過」：')
    } else if (contacts.length === 1) {
      await setSession(fromId, 'waiting_for_visit_datetime', { contact_id: contacts[0].id, contact_name: contacts[0].name })
      await sendMessage(chatId, `找到：${contacts[0].name}（${contacts[0].company ?? ''}）\n\n請輸入拜訪日期時間（例：2026-03-29 14:00），或輸入「略過」：`)
    } else {
      const buttons = contacts.map((c) => [{ text: `${c.name}（${c.company ?? ''}）`, callback_data: `select_visit_contact_${c.id}` }])
      await sendMessage(chatId, '找到多筆聯絡人，請選擇：', { reply_markup: { inline_keyboard: buttons } })
    }
    return
    } // end command escape
  }

  // ── Session: waiting_for_visit_datetime ───────────────────────────────────
  if (session?.state === 'waiting_for_visit_datetime') {
    if (cmd.startsWith('/')) { await clearSession(fromId) } else {
    const skip = text.trim() === '略過' || text.trim().toLowerCase() === 'skip'
    let meetingDate: string | null = null
    let meetingTime: string | null = null
    if (!skip) {
      const match = text.trim().match(/^(\d{4}-\d{2}-\d{2})(?:\s+(\d{2}:\d{2}))?/)
      if (match) {
        meetingDate = match[1]
        meetingTime = match[2] ?? null
      } else {
        await sendMessage(chatId, '格式不正確，請輸入 YYYY-MM-DD 或 YYYY-MM-DD HH:MM，或輸入「略過」：')
        return
      }
    }
    await setSession(fromId, 'waiting_for_visit_location', {
      ...session.context,
      meeting_date: meetingDate,
      meeting_time: meetingTime,
    })
    await sendMessage(chatId, '請輸入拜訪地點，或輸入「略過」：')
    return
    } // end command escape
  }

  // ── Session: waiting_for_visit_location ───────────────────────────────────
  if (session?.state === 'waiting_for_visit_location') {
    if (cmd.startsWith('/')) { await clearSession(fromId) } else {
    const skip = text.trim() === '略過' || text.trim().toLowerCase() === 'skip'
    await setSession(fromId, 'waiting_for_visit_content', {
      ...session.context,
      meeting_location: skip ? null : text.trim(),
    })
    await sendMessage(chatId, '請輸入拜訪內容（筆記）：')
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
    await supabase.from('interaction_logs').insert({
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
    await sendMessage(chatId, ctx.contact_name
      ? `✅ 已儲存拜訪紀錄（${ctx.contact_name}）${detail}`
      : `✅ 已儲存為未歸類拜訪紀錄${detail}`
    )
    return
    } // end command escape
  }

  // ── /work /w ───────────────────────────────────────────────────────────────
  const workMatch = cmd.match(/^\/(?:work|w)\s+(.+)/s)
  if (workMatch) {
    await handleWork(chatId, user, workMatch[1].trim(), session?.last_contact_id, m)
    return
  }

  // ── /met (must be before /meet to avoid /m catching /met) ─────────────────
  const metMatch = cmd.match(/^\/met\s+(\d+)\s+([\s\S]+)/)
  console.log('[bot] /met check:', { cmd: cmd.slice(0, 60), matched: !!metMatch })
  if (metMatch) {
    const count = Math.min(parseInt(metMatch[1], 10), 20)
    await handleMet(chatId, user, count, metMatch[2].trim(), m)
    return
  }

  // ── /meet /m ───────────────────────────────────────────────────────────────
  const meetMatch = text.match(/^\/(?:meet|m)(?:@\S+)?\s*([\s\S]*)$/i)
  if (meetMatch) {
    await handleMeet(chatId, user, meetMatch[1].trim(), m)
    return
  }

  // ── /tasks /t ──────────────────────────────────────────────────────────────
  if (cmd === '/tasks' || cmd === '/t') {
    await handleTasks(chatId, user, m)
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
      await sendMessage(chatId, '無法解析日期，請輸入格式如：2026-03-20 15:00 或 tomorrow 3pm')
      return
    }
    await supabase.from('tasks').update({ due_at: new Date(parsed).toISOString() }).eq('id', taskId)
    await clearSession(fromId)
    await sendMessage(chatId, `✅ 已延後任務截止時間至 ${new Date(parsed).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}`)
    return
    } // end command escape
  }

  // ── /note /n name — shortcut with contact name ────────────────────────────
  const noteNameMatch = cmd.match(/^\/(?:note|n)\s+(.+)/)
  if (noteNameMatch) {
    const contacts = await searchContacts(noteNameMatch[1].trim())
    if (contacts.length === 0) {
      await setSession(fromId, 'waiting_for_note_content', { contact_id: null })
      await sendMessage(chatId, '找不到此聯絡人，筆記將存為未歸類。\n\n請輸入筆記內容：')
    } else if (contacts.length === 1) {
      await setSession(fromId, 'waiting_for_note_content', { contact_id: contacts[0].id, contact_name: contacts[0].name })
      await sendMessage(chatId, `找到：${contacts[0].name}（${contacts[0].company ?? ''}）\n\n請輸入筆記內容：`)
    } else {
      const buttons = contacts.map((c) => [{ text: `${c.name}（${c.company ?? ''}）`, callback_data: `select_contact_${c.id}` }])
      await sendMessage(chatId, '找到多筆聯絡人，請選擇：', { reply_markup: { inline_keyboard: buttons } })
    }
    return
  }

  // ── /note command ──────────────────────────────────────────────────────────
  if (cmd === '/note' || cmd === '/n') {
    const lastContactId = session?.last_contact_id
    if (lastContactId) {
      const { data: lastContact } = await supabase
        .from('contacts').select('id, name, company').eq('id', lastContactId).single()
      if (lastContact) {
        await sendMessage(chatId,
          `要針對上一位聯絡人嗎？\n👤 ${lastContact.name}（${lastContact.company ?? ''}）`,
          { reply_markup: { inline_keyboard: [[
            { text: '✅ 是，就是他', callback_data: `use_last_note_${lastContactId}` },
            { text: '🔍 搜尋其他人', callback_data: 'search_other_note' },
          ]] } }
        )
        return
      }
    }
    await setSession(fromId, 'waiting_for_note_contact', {})
    await sendMessage(chatId, '請輸入聯絡人姓名或 Email：')
    return
  }

  // ── /visit /v name — shortcut with contact name ──────────────────────────
  const visitNameMatch = cmd.match(/^\/(?:visit|v)\s+(.+)/)
  if (visitNameMatch) {
    const contacts = await searchContacts(visitNameMatch[1].trim())
    if (contacts.length === 0) {
      await setSession(fromId, 'waiting_for_visit_datetime', { contact_id: null, contact_name: null })
      await sendMessage(chatId, '找不到此聯絡人，拜訪紀錄將存為未歸類。\n\n請輸入拜訪日期時間（例：2026-03-29 14:00），或輸入「略過」：')
    } else if (contacts.length === 1) {
      await setSession(fromId, 'waiting_for_visit_datetime', { contact_id: contacts[0].id, contact_name: contacts[0].name })
      await sendMessage(chatId, `找到：${contacts[0].name}（${contacts[0].company ?? ''}）\n\n請輸入拜訪日期時間（例：2026-03-29 14:00），或輸入「略過」：`)
    } else {
      const buttons = contacts.map((c) => [{ text: `${c.name}（${c.company ?? ''}）`, callback_data: `select_visit_contact_${c.id}` }])
      await sendMessage(chatId, '找到多筆聯絡人，請選擇：', { reply_markup: { inline_keyboard: buttons } })
    }
    return
  }

  // ── /visit /v command ─────────────────────────────────────────────────────
  if (cmd === '/visit' || cmd === '/v') {
    const lastContactId = session?.last_contact_id
    if (lastContactId) {
      const { data: lastContact } = await supabase
        .from('contacts').select('id, name, company').eq('id', lastContactId).single()
      if (lastContact) {
        await sendMessage(chatId,
          `要為上一位聯絡人新增拜訪紀錄嗎？\n👤 ${lastContact.name}（${lastContact.company ?? ''}）`,
          { reply_markup: { inline_keyboard: [[
            { text: '✅ 是，就是他', callback_data: `use_last_visit_${lastContactId}` },
            { text: '🔍 搜尋其他人', callback_data: 'search_other_visit' },
          ]] } }
        )
        return
      }
    }
    await setSession(fromId, 'waiting_for_visit_contact', {})
    await sendMessage(chatId, '請輸入聯絡人姓名或 Email：')
    return
  }

  // ── /a — add card to last session contact ────────────────────────────────
  if (cmd === '/a') {
    const lastContactId = session?.last_contact_id
    if (lastContactId) {
      const { data: lastContact } = await supabase.from('contacts').select('id, name, company').eq('id', lastContactId).single()
      if (lastContact) {
        await setSession(fromId, 'waiting_for_add_card', { contact_id: lastContactId, contact_name: lastContact.name })
        await sendMessage(chatId, `上一位聯絡人：<b>${lastContact.name}</b>（${lastContact.company ?? ''}）\n\n請傳送名片照片`)
        return
      }
    }
    await sendMessage(chatId, '找不到上一位聯絡人，請先掃描名片或用 <code>/a 姓名</code> 指定。')
    return
  }

  // ── /a name — add card to specified contact ──────────────────────────────
  const addCardMatch = cmd.match(/^\/a\s+(.+)/)
  if (addCardMatch) {
    const query = addCardMatch[1].trim()
    const contacts = await searchContacts(query)
    if (contacts.length === 0) {
      await sendMessage(chatId, `找不到聯絡人「${query}」`)
    } else if (contacts.length === 1) {
      await setSession(fromId, 'waiting_for_add_card', { contact_id: contacts[0].id, contact_name: contacts[0].name })
      await sendMessage(chatId, `找到：${contacts[0].name}\n\n請傳送名片照片`)
    } else {
      const buttons = contacts.map((c) => [{ text: `${c.name}（${c.company ?? ''}）`, callback_data: `select_add_card_${c.id}` }])
      await sendMessage(chatId, '找到多筆聯絡人，請選擇要新增名片的對象：', { reply_markup: { inline_keyboard: buttons } })
    }
    return
  }

  // ── /p — add personal photo to last session contact ───────────────────────
  if (cmd === '/p') {
    const lastContactId = session?.last_contact_id
    if (lastContactId) {
      const { data: lastContact } = await supabase.from('contacts').select('id, name, company').eq('id', lastContactId).single()
      if (lastContact) {
        await setSession(fromId, 'waiting_for_photo', { contact_id: lastContactId, contact_name: lastContact.name })
        await sendMessage(chatId, `上一位聯絡人：<b>${lastContact.name}</b>（${lastContact.company ?? ''}）\n\n請傳送合照\n\n💡 長按照片 → <b>以檔案傳送</b>，可保留拍攝時間和 GPS 地點`)
        return
      }
    }
    await sendMessage(chatId, '找不到上一位聯絡人，請先掃描名片或用 <code>/p 姓名</code> 指定。')
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
      const createLabel = queryCompany ? `✅ 建立「${queryName} · ${queryCompany}」` : `✅ 建立「${queryName}」`
      await sendMessage(chatId, `找不到聯絡人「${queryName}」，要建立新聯絡人嗎？`, {
        reply_markup: {
          inline_keyboard: [[
            { text: createLabel, callback_data: 'confirm_create_p' },
            { text: '❌ 取消', callback_data: 'cancel_p' },
          ]],
        },
      })
    } else if (contacts.length === 1) {
      await setSession(fromId, 'waiting_for_photo', { contact_id: contacts[0].id, contact_name: contacts[0].name })
      await sendMessage(chatId, `找到：${contacts[0].name}\n\n請傳送合照\n\n💡 長按照片 → <b>以檔案傳送</b>，可保留拍攝時間和 GPS 地點`)
    } else {
      const buttons = contacts.map((c) => [{ text: `${c.name}（${c.company ?? ''}）`, callback_data: `select_photo_${c.id}` }])
      await sendMessage(chatId, '找到多筆聯絡人，請選擇：', { reply_markup: { inline_keyboard: buttons } })
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
        await sendMessage(chatId, '找不到此聯絡人，筆記將存為未歸類。\n\n請輸入筆記內容：')
      } else if (contacts.length === 1) {
        await setSession(fromId, 'waiting_for_note_content', { contact_id: contacts[0].id, contact_name: contacts[0].name })
        await sendMessage(chatId, `找到：${contacts[0].name}\n\n請輸入筆記內容：`)
      } else {
        const buttons = contacts.map((c) => [{ text: `${c.name}（${c.company ?? ''}）`, callback_data: `select_contact_${c.id}` }])
        await sendMessage(chatId, '找到多筆聯絡人，請選擇：', { reply_markup: { inline_keyboard: buttons } })
      }
      return
    }

    let contactId: string | null = null
    let contactName: string | undefined
    if (contacts.length === 1) {
      contactId = contacts[0].id
      contactName = contacts[0].name
    } else if (contacts.length === 0) {
      contactId = null
    } else {
      await setSession(fromId, 'waiting_for_note_content_after_select', { content })
      const buttons = contacts.map((c) => [{ text: `${c.name}（${c.company ?? ''}）`, callback_data: `select_contact_${c.id}` }])
      await sendMessage(chatId, '找到多筆聯絡人，請選擇：', { reply_markup: { inline_keyboard: buttons } })
      return
    }

    await supabase.from('interaction_logs').insert({
      contact_id: contactId,
      type: 'note',
      content,
      created_by: user.id,
    })
    await sendMessage(chatId, contactName
      ? `✅ 已儲存筆記（${contactName}）`
      : '✅ 已儲存為未歸類筆記'
    )
    return
  }

  // ── /li: LinkedIn screenshot ───────────────────────────────────────────────
  if (cmd === '/li' || cmd === '/linkedin') {
    await setSession(fromId, 'waiting_for_li', {})
    await sendMessage(chatId, '📸 請傳送 LinkedIn 個人頁截圖，AI 將自動解析聯絡人資料。')
    return
  }

  // Default
  await sendMessage(chatId, '請傳送名片照片，或輸入 /help（/h）查看可用指令。')
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

  try {
    const body = await req.json()
    const supabase = createServiceClient()

    // --- Deduplication: skip already-processed updates ---
    const updateId = body.update_id as number | undefined
    if (updateId) {
      const { error: dedupError } = await supabase
        .from('telegram_dedup')
        .insert({ update_id: updateId })
      if (dedupError) {
        // Unique constraint violation = duplicate, return immediately
        return NextResponse.json({ ok: true })
      }
    }

    // --- Callback Query ---
    if (body.callback_query) {
      const { id: callbackQueryId, from, message, data } = body.callback_query

      try {
        const user = await getAuthorizedUser(from.id)
        const lang = await getBotLanguage(from, supabase)
        const m = BOT_MESSAGES[lang]
        if (!user) {
          await answerCallbackQuery(callbackQueryId, m.unauthorized)
          return NextResponse.json({ ok: true })
        }

        // ── Save card ─────────────────────────────────────────────────────────
        if (data?.startsWith('save_')) {
          const pendingId = data.replace('save_', '')
          const { data: pending } = await supabase
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
          const { data: inserted, error } = await supabase
            .from('contacts')
            .insert({ ...contactFields, created_by: user.id })
            .select('id')
            .single()
          if (error || !inserted) throw new Error(error?.message ?? '存檔失敗')

          await supabase.from('interaction_logs').insert({
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
            await supabase.from('contact_cards').insert({
              contact_id: inserted.id,
              card_img_url: pendingData.card_img_url,
              storage_path: pending.storage_path,
              label: cardLabel,
            })
          }

          await supabase.from('pending_contacts').delete().eq('id', pendingId)
          await updateLastContact(from.id, inserted.id)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          const appUrl = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? ''
          const contactLink = appUrl ? `\n\n👤 <a href="${appUrl}/contacts/${inserted.id}">查看聯絡人頁面</a>` : ''
          await sendMessage(from.id, `✅ 已成功存檔！${contactLink}`)

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
              await sendMessage(from.id, enrichStatusMessage(r, 'zh-TW'))
            } catch { /* non-fatal */ }
          }
        }

        // ── Merge to existing contact (when dup detected) ─────────────────────
        else if (data?.startsWith('merge_')) {
          const pendingId = data.replace('merge_', '')
          const { data: pending } = await supabase
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
            await answerCallbackQuery(callbackQueryId, '無合併目標')
            await sendMessage(from.id, '❌ 找不到合併目標聯絡人，請重新掃描。')
            return NextResponse.json({ ok: true })
          }

          await answerCallbackQuery(callbackQueryId, '處理中...')

          // Fetch target contact's current fields
          const { data: existing } = await supabase
            .from('contacts')
            .select('id, name, name_en, name_local, company, job_title, email, phone, second_phone, address, website')
            .eq('id', targetId)
            .single()
          if (!existing) {
            await sendMessage(from.id, '❌ 目標聯絡人已不存在')
            return NextResponse.json({ ok: true })
          }

          // Compute toFill (OCR has, contact empty) + conflicts
          const FIELD_LABELS: Record<string, string> = {
            name: '姓名', name_en: '英文名', name_local: '當地語名',
            company: '公司', job_title: '職稱', email: 'Email',
            phone: '電話', second_phone: '備用電話', address: '地址', website: '網站',
          }
          const toFill: Record<string, string> = {}
          const conflicts: Array<{ key: string; label: string; newVal: string; oldVal: string }> = []
          for (const key of Object.keys(FIELD_LABELS)) {
            const newVal = pdata[key] as string | null | undefined
            const oldVal = (existing as Record<string, unknown>)[key] as string | null | undefined
            if (!newVal) continue
            if (!oldVal) toFill[key] = newVal
            else if (oldVal !== newVal) conflicts.push({ key, label: FIELD_LABELS[key], newVal, oldVal })
          }

          // Apply: fill empty fields
          if (Object.keys(toFill).length > 0) {
            await supabase.from('contacts').update(toFill).eq('id', targetId)
          }

          // Insert card image to contact_cards
          if (pdata.card_img_url) {
            const now = new Date()
            const cardLabel = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
            await supabase.from('contact_cards').insert({
              contact_id: targetId,
              card_img_url: pdata.card_img_url as string,
              storage_path: pending.storage_path,
              label: cardLabel,
            })
          }

          // Conflicts → system log so info isn't lost
          if (conflicts.length > 0) {
            const noteLines = conflicts.map(c => `${c.label}：${c.newVal}（現有：${c.oldVal}）`).join('\n')
            await supabase.from('interaction_logs').insert({
              contact_id: targetId,
              type: 'system',
              content: `合併新名片資料（與現有不同的欄位）：\n${noteLines}`,
              created_by: user.id,
            })
          }

          await supabase.from('pending_contacts').delete().eq('id', pendingId)
          await updateLastContact(from.id, targetId)
          await editMessageReplyMarkup(message.chat.id, message.message_id)

          const summary = []
          if (Object.keys(toFill).length > 0) summary.push(`✅ 填入 ${Object.keys(toFill).length} 個空白欄位`)
          if (conflicts.length > 0) summary.push(`📝 ${conflicts.length} 個衝突欄位寫入互動紀錄`)
          summary.push('🖼 名片圖已加入')
          const appUrl = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? ''
          const link = appUrl ? `\n\n👤 <a href="${appUrl}/contacts/${targetId}">查看 ${existing.name}</a>` : ''
          await sendMessage(from.id, `已加到「${existing.name}」：\n${summary.join('\n')}${link}`)
        }

        // ── Cancel card ───────────────────────────────────────────────────────
        else if (data?.startsWith('cancel_')) {
          const pendingId = data.replace('cancel_', '')
          const { data: pending } = await supabase
            .from('pending_contacts')
            .select('storage_path')
            .eq('id', pendingId)
            .single()
          if (pending?.storage_path) {
            await supabase.storage.from('cards').remove([pending.storage_path])
          }
          await supabase.from('pending_contacts').delete().eq('id', pendingId)
          await answerCallbackQuery(callbackQueryId, m.cbCardCancelled)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await sendMessage(from.id, m.cardCancelled)
        }

        // ── Meet confirm ──────────────────────────────────────────────────────
        else if (data?.startsWith('meet_confirm_')) {
          const draftId = data.replace('meet_confirm_', '')
          const { data: draft } = await supabase
            .from('meeting_drafts')
            .select('*')
            .eq('id', draftId)
            .single()

          if (!draft) {
            await answerCallbackQuery(callbackQueryId, '已過期或不存在')
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
            await supabase.from('meeting_drafts').delete().eq('id', draftId)
            await answerCallbackQuery(callbackQueryId, m.cbMeetConfirmed)
            await editMessageReplyMarkup(message.chat.id, message.message_id)
            const timeLabel = formatTaipeiRange(draft.start_at, draft.duration_minutes)
            const linkText = webLink ? `\n\n🔗 <a href="${webLink}">在 Outlook 開啟</a>` : ''
            await sendMessage(from.id, `✅ <b>行程已建立！</b>\n\n📅 ${draft.title}\n🕐 ${timeLabel}${linkText}`)
          } catch (e) {
            await answerCallbackQuery(callbackQueryId, '❌ 建立失敗')
            await sendMessage(from.id, `❌ 建立行程失敗：${e instanceof Error ? e.message : '請稍後再試'}`)
          }
        }

        // ── Meet cancel ───────────────────────────────────────────────────────
        else if (data?.startsWith('meet_cancel_')) {
          const draftId = data.replace('meet_cancel_', '')
          await supabase.from('meeting_drafts').delete().eq('id', draftId)
          await answerCallbackQuery(callbackQueryId, m.cbMeetCancelled)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await sendMessage(from.id, m.meetCancelled)
        }

        // ── /visit: use last contact ─────────────────────────────────────────
        else if (data?.startsWith('use_last_visit_')) {
          const contactId = data.replace('use_last_visit_', '')
          const { data: contact } = await supabase
            .from('contacts').select('id, name').eq('id', contactId).single()
          await setSession(from.id, 'waiting_for_visit_datetime', { contact_id: contactId, contact_name: contact?.name })
          await answerCallbackQuery(callbackQueryId)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await sendMessage(from.id, `聯絡人：${contact?.name}\n\n請輸入拜訪日期時間（例：2026-03-29 14:00），或輸入「略過」：`)
        }

        // ── /visit: search other contact ─────────────────────────────────────
        else if (data === 'search_other_visit') {
          await setSession(from.id, 'waiting_for_visit_contact', {})
          await answerCallbackQuery(callbackQueryId)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await sendMessage(from.id, '請輸入聯絡人姓名或 Email：')
        }

        // ── /visit: select contact from search results ───────────────────────
        else if (data?.startsWith('select_visit_contact_')) {
          const contactId = data.replace('select_visit_contact_', '')
          const { data: contact } = await supabase
            .from('contacts').select('id, name').eq('id', contactId).single()
          await setSession(from.id, 'waiting_for_visit_datetime', { contact_id: contactId, contact_name: contact?.name })
          await answerCallbackQuery(callbackQueryId)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await sendMessage(from.id, `找到：${contact?.name}\n\n請輸入拜訪日期時間（例：2026-03-29 14:00），或輸入「略過」：`)
        }

        // ── Select contact for note ───────────────────────────────────────────
        else if (data?.startsWith('select_contact_')) {
          const contactId = data.replace('select_contact_', '')
          const { data: contact } = await supabase
            .from('contacts')
            .select('id, name')
            .eq('id', contactId)
            .single()

          const session = await getSession(from.id)

          if (session?.state === 'waiting_for_note_content_after_select') {
            const content = session.context.content as string
            await supabase.from('interaction_logs').insert({
              contact_id: contactId,
              type: 'note',
              content,
              created_by: user.id,
            })
            await clearSession(from.id)
            await answerCallbackQuery(callbackQueryId)
            await editMessageReplyMarkup(message.chat.id, message.message_id)
            await sendMessage(from.id, `✅ 已儲存筆記（${contact?.name ?? ''}）`)
          } else {
            await setSession(from.id, 'waiting_for_note_content', { contact_id: contactId, contact_name: contact?.name })
            await answerCallbackQuery(callbackQueryId)
            await editMessageReplyMarkup(message.chat.id, message.message_id)
            await sendMessage(from.id, `找到：${contact?.name}\n\n請輸入筆記內容：`)
          }
        }

        // ── Select contact for /a add card ───────────────────────────────────
        else if (data?.startsWith('select_add_card_')) {
          const contactId = data.replace('select_add_card_', '')
          const { data: contact } = await supabase.from('contacts').select('id, name').eq('id', contactId).single()
          await setSession(from.id, 'waiting_for_add_card', { contact_id: contactId, contact_name: contact?.name })
          await answerCallbackQuery(callbackQueryId)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await sendMessage(from.id, `找到：${contact?.name}\n\n請傳送名片照片`)
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
            await sendMessage(from.id, '❌ 找不到待處理照片，請重新傳送。')
            await clearSession(from.id)
          } else {
            await processAddCardPhoto(from.id, from.id, user, contactId, fileId, contactNameHint)
          }
        }

        // ── Cancel /a ─────────────────────────────────────────────────────────
        else if (data === 'cancel_add_card') {
          await clearSession(from.id)
          await answerCallbackQuery(callbackQueryId)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await sendMessage(from.id, '已取消。')
        }

        // ── Apply OCR diff to contact ─────────────────────────────────────────
        else if (data?.startsWith('apply_card_')) {
          const contactId = data.replace('apply_card_', '')
          await answerCallbackQuery(callbackQueryId)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await applyCardDiff(from.id, from.id, contactId, true)
        }

        // ── Skip OCR diff — save card only ────────────────────────────────────
        else if (data?.startsWith('skip_card_apply_')) {
          const contactId = data.replace('skip_card_apply_', '')
          await answerCallbackQuery(callbackQueryId)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await applyCardDiff(from.id, from.id, contactId, false)
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
            await sendMessage(from.id, '❌ 建立失敗，請重新輸入 /p 姓名')
          } else {
            const insertPayload: Record<string, unknown> = { name: nameQuery, created_by: user.id }
            if (companyQuery) insertPayload.company = companyQuery
            const { data: inserted, error } = await supabase
              .from('contacts')
              .insert(insertPayload)
              .select('id')
              .single()
            if (error || !inserted) {
              await sendMessage(from.id, `❌ 建立失敗：${error?.message ?? '未知錯誤'}`)
            } else {
              await supabase.from('interaction_logs').insert({
                contact_id: inserted.id,
                type: 'system',
                content: companyQuery
                  ? '透過 Telegram Bot /p 手動建立（姓名 + 公司）'
                  : '透過 Telegram Bot /p 手動建立（僅姓名）',
                created_by: user.id,
              })
              await updateLastContact(from.id, inserted.id)
              await setSession(from.id, 'waiting_for_photo', { contact_id: inserted.id, contact_name: nameQuery })
              const appUrl = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? ''
              const link = appUrl ? `\n\n👤 <a href="${appUrl}/contacts/${inserted.id}">查看聯絡人頁面</a>` : ''
              const displayLine = companyQuery ? `<b>${nameQuery}</b>（${companyQuery}）` : `<b>${nameQuery}</b>`
              await sendMessage(from.id, `✅ 已建立聯絡人：${displayLine}${link}\n\n請傳送合照\n\n💡 長按照片 → <b>以檔案傳送</b>，可保留拍攝時間和 GPS 地點`)

              try {
                const { enrichContactEmail, enrichStatusMessage } = await import('@/lib/hunter')
                const r = await enrichContactEmail(inserted.id, null, nameQuery, companyQuery)
                await sendMessage(from.id, enrichStatusMessage(r, 'zh-TW'))
              } catch { /* non-fatal */ }
            }
          }
        }

        // ── /p name not found, cancel create ──────────────────────────────────
        else if (data === 'cancel_p') {
          await answerCallbackQuery(callbackQueryId)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await clearSession(from.id)
          await sendMessage(from.id, '已取消')
        }

        // ── Select contact for /p photo ───────────────────────────────────────
        else if (data?.startsWith('select_photo_')) {
          const contactId = data.replace('select_photo_', '')
          const { data: contact } = await supabase.from('contacts').select('id, name').eq('id', contactId).single()
          await setSession(from.id, 'waiting_for_photo', { contact_id: contactId, contact_name: contact?.name })
          await answerCallbackQuery(callbackQueryId)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await sendMessage(from.id, `找到：${contact?.name}\n\n請傳送合照\n\n💡 長按照片 → <b>以檔案傳送</b>，可保留拍攝時間和 GPS 地點`)
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
            await sendMessage(from.id, '❌ 找不到待處理照片，請重新傳送。')
            await clearSession(from.id)
          } else {
            await setSession(from.id, 'waiting_for_photo_note', { contact_id: contactId, contact_name: contactNameHint, pending_file_ids: fileIds })
            await sendMessage(from.id, `📝 要幫這 ${fileIds.length === 1 ? '張' : fileIds.length + ' 張'}照片加共同附註嗎？直接回覆文字，或按「跳過」`, {
              reply_markup: { inline_keyboard: [[
                { text: '⏭ 跳過，直接存入', callback_data: 'skip_photo_note' },
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
            await sendMessage(from.id, '❌ 找不到待處理照片，請重新傳送。')
            await clearSession(from.id)
          } else {
            await setSession(from.id, 'waiting_for_photo_note', { contact_id: contactId, contact_name: contactNameHint, pending_file_ids: [fileId] })
            await sendMessage(from.id, '📝 要加附註嗎？直接回覆文字會存入互動紀錄。', {
              reply_markup: { inline_keyboard: [[
                { text: '⏭ 跳過，直接存入', callback_data: 'skip_photo_note' },
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
            await sendMessage(from.id, '❌ 找不到待處理照片，請重新傳送。')
            await clearSession(from.id)
          } else {
            await sendMessage(from.id, '⏳ 上傳中...')
            await processPersonalPhoto(from.id, from.id, contactId, fileIds, contactNameHint)
          }
        }

        // ── Cancel /p ─────────────────────────────────────────────────────────
        else if (data === 'cancel_photo') {
          await clearSession(from.id)
          await answerCallbackQuery(callbackQueryId)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await sendMessage(from.id, '已取消。')
        }

        // ── Confirm LinkedIn contact ───────────────────────────────────────────
        else if (data === 'confirm_li') {
          const session = await getSession(from.id)
          const parsed = session?.context?.parsed as Record<string, string> | undefined
          const liFileId = session?.context?.file_id as string | undefined
          await answerCallbackQuery(callbackQueryId)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          if (!parsed) {
            await sendMessage(from.id, '❌ 找不到解析資料，請重新傳送截圖。')
            await clearSession(from.id)
          } else {
            // Name fallback: use English name if no local language name
            const contactName = parsed.name || parsed.name_en || null
            const { data: inserted, error } = await supabase
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
              await sendMessage(from.id, `❌ 新增失敗：${error?.message ?? '未知錯誤'}`)
            } else {
              // Upload LinkedIn screenshot to Storage
              if (liFileId) {
                try {
                  const imgBuffer = await downloadTelegramPhoto(liFileId)
                  const compressed = await processCardImage(imgBuffer)
                  const storagePath = `cards/linkedin_${inserted.id}_${Date.now()}.jpg`
                  const { error: uploadError } = await supabase.storage
                    .from('cards').upload(storagePath, compressed, { contentType: 'image/jpeg', upsert: false })
                  if (!uploadError) {
                    const { data: publicUrlData } = supabase.storage.from('cards').getPublicUrl(storagePath)
                    await supabase.from('contacts').update({ card_img_url: publicUrlData.publicUrl }).eq('id', inserted.id)
                  }
                } catch {
                  // Screenshot upload failure is non-fatal
                }
              }
              if (parsed.notes) {
                await supabase.from('interaction_logs').insert({
                  contact_id: inserted.id,
                  type: 'note',
                  content: parsed.notes,
                  created_by: user.id,
                })
              }
              await updateLastContact(from.id, inserted.id)
              const appUrl = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? ''
              const contactLink = appUrl ? `\n\n👤 <a href="${appUrl}/contacts/${inserted.id}">查看聯絡人頁面</a>` : ''
              const displayName = parsed.name || parsed.name_en || '聯絡人'
              await sendMessage(from.id, `✅ 已新增聯絡人：<b>${displayName}</b>${contactLink}`)

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
                  await sendMessage(from.id, enrichStatusMessage(r, 'zh-TW'))
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
          await sendMessage(from.id, '已取消。')
        }

        // ── /search: quick email from contact ────────────────────────────────
        else if (data?.startsWith('email_contact_')) {
          const contactId = data.replace('email_contact_', '')
          const { data: contact } = await supabase
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
            `收件人：<b>${contact?.name}</b>（${contact?.email || '無 email'}）\n\n` +
            `請選擇發信方式：`,
            { reply_markup: { inline_keyboard: [[
              { text: '1️⃣ 使用 Template', callback_data: 'email_method_1' },
              { text: '2️⃣ AI 生成', callback_data: 'email_method_2' },
            ]] } }
          )
        }

        // ── /search: quick note from contact ─────────────────────────────────
        else if (data?.startsWith('note_contact_')) {
          const contactId = data.replace('note_contact_', '')
          const { data: contact } = await supabase
            .from('contacts')
            .select('id, name')
            .eq('id', contactId)
            .single()
          await setSession(from.id, 'waiting_for_note_content', { contact_id: contactId, contact_name: contact?.name })
          await answerCallbackQuery(callbackQueryId)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await sendMessage(from.id, `聯絡人：${contact?.name}\n\n請輸入筆記內容：`)
        }

        // ── /email: select contact from list ─────────────────────────────────
        else if (data?.startsWith('select_email_contact_')) {
          const contactId = data.replace('select_email_contact_', '')
          const { data: contact } = await supabase
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
            `收件人：<b>${contact?.name}</b>（${contact?.email || '無 email'}）\n\n` +
            `請選擇發信方式：`,
            { reply_markup: { inline_keyboard: [[
              { text: '1️⃣ 使用 Template', callback_data: 'email_method_1' },
              { text: '2️⃣ AI 生成', callback_data: 'email_method_2' },
            ]] } }
          )
        }

        // ── /email: method choice 1 (template) ───────────────────────────────
        else if (data === 'email_method_1') {
          const session = await getSession(from.id)
          const { data: templates } = await supabase
            .from('email_templates')
            .select('id, title, subject')
            .order('created_at', { ascending: false })
            .limit(10)

          if (!templates || templates.length === 0) {
            await answerCallbackQuery(callbackQueryId, '目前無可用範本')
            await sendMessage(from.id, '目前沒有郵件範本，請先至網頁新增。')
            return NextResponse.json({ ok: true })
          }

          const buttons = templates.map((t) => [{
            text: t.title,
            callback_data: `select_email_tpl_${t.id}`,
          }])
          await setSession(from.id, 'waiting_template_choice', session?.context ?? {})
          await answerCallbackQuery(callbackQueryId)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await sendMessage(from.id, '請選擇郵件範本：', { reply_markup: { inline_keyboard: buttons } })
        }

        // ── /email: method choice 2 (AI generate) ────────────────────────────
        else if (data === 'email_method_2') {
          const session = await getSession(from.id)
          await setSession(from.id, 'waiting_email_description', session?.context ?? {})
          await answerCallbackQuery(callbackQueryId)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await sendMessage(from.id, '請描述這封信的目的：')
        }

        // ── /email: select template ───────────────────────────────────────────
        else if (data?.startsWith('select_email_tpl_')) {
          const templateId = data.replace('select_email_tpl_', '')
          const { data: tpl } = await supabase
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
          await sendMessage(from.id,
            `已選擇範本：<b>${tpl?.title}</b>\n\n` +
            `有要補充的內容嗎？（直接傳送請回覆 <code>skip</code>）`
          )
        }

        // ── /email: confirm send ──────────────────────────────────────────────
        else if (data === 'confirm_email') {
          const session = await getSession(from.id)
          if (!session?.context) throw new Error('找不到郵件資料')

          const contactEmail = session.context.contact_email as string
          const contactId = session.context.contact_id as string
          const subject = session.context.subject as string
          const bodyHtml = session.context.body_html as string

          if (!contactEmail) {
            await answerCallbackQuery(callbackQueryId, '此聯絡人無 email')
            await sendMessage(from.id, '❌ 此聯絡人沒有 email，無法發送。')
            await clearSession(from.id)
            return NextResponse.json({ ok: true })
          }

          await sendMessage(from.id, '⏳ 發送中...')
          try {
            const accessToken = await getValidProviderToken(user.id)
            await sendMail({
              accessToken,
              to: contactEmail,
              subject,
              body: bodyHtml,
            })
            await supabase.from('interaction_logs').insert({
              contact_id: contactId,
              type: 'email',
              content: bodyHtml,
              email_subject: subject,
              created_by: user.id,
            })
            await clearSession(from.id)
            await answerCallbackQuery(callbackQueryId, '✅ 已發送！')
            await editMessageReplyMarkup(message.chat.id, message.message_id)
            await sendMessage(from.id, `✅ 郵件已發送！\n主旨：${subject}`)
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            throw new Error(`發送失敗：${msg}`)
          }
        }

        // ── /search: load interaction logs (on demand) ───────────────────────
        else if (data?.startsWith('log_contact_')) {
          // format: log_contact_{contactId}_{offset}
          const parts = data.split('_')
          const offset = parseInt(parts[parts.length - 1], 10) || 0
          const contactId = parts.slice(2, parts.length - 1).join('_')

          const { data: contact } = await supabase
            .from('contacts').select('name').eq('id', contactId).single()
          const { data: logs } = await supabase
            .from('interaction_logs')
            .select('type, content, created_at')
            .eq('contact_id', contactId)
            .order('created_at', { ascending: false })
            .range(offset, offset + 4)

          await answerCallbackQuery(callbackQueryId)

          if (!logs || logs.length === 0) {
            await sendMessage(from.id, `📋 ${contact?.name ?? ''} 無互動紀錄`)
          } else {
            const TYPE_LABEL: Record<string, string> = { note: '筆記', meeting: '會議', email: '郵件', system: '系統' }
            const lines = logs.map((l) => {
              const label = TYPE_LABEL[l.type] ?? l.type
              const date = new Date(l.created_at).toLocaleDateString('zh-TW')
              const preview = (l.content ?? '').replace(/<[^>]+>/g, '').slice(0, 80)
              return `[${label}] ${date}\n${preview}`
            }).join('\n\n')

            const hasMore = logs.length === 5
            const buttons = hasMore
              ? [[{ text: '載入更多', callback_data: `log_contact_${contactId}_${offset + 5}` }]]
              : []

            await sendMessage(from.id,
              `📋 <b>${contact?.name ?? ''} 互動紀錄</b>（第 ${offset + 1}–${offset + logs.length} 筆）\n\n${lines}`,
              buttons.length > 0 ? { reply_markup: { inline_keyboard: buttons } } : {}
            )
          }
        }

        // ── /note: use last contact ───────────────────────────────────────────
        else if (data?.startsWith('use_last_note_')) {
          const contactId = data.replace('use_last_note_', '')
          const { data: contact } = await supabase
            .from('contacts').select('id, name').eq('id', contactId).single()
          await setSession(from.id, 'waiting_for_note_content', { contact_id: contactId, contact_name: contact?.name })
          await answerCallbackQuery(callbackQueryId)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await sendMessage(from.id, `聯絡人：${contact?.name}\n\n請輸入筆記內容：`)
        }

        // ── /note: search other contact ───────────────────────────────────────
        else if (data === 'search_other_note') {
          await setSession(from.id, 'waiting_for_note_contact', {})
          await answerCallbackQuery(callbackQueryId)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await sendMessage(from.id, '請輸入聯絡人姓名或 Email：')
        }

        // ── /email: use last contact ──────────────────────────────────────────
        else if (data?.startsWith('use_last_email_')) {
          const contactId = data.replace('use_last_email_', '')
          const { data: contact } = await supabase
            .from('contacts').select('id, name, email').eq('id', contactId).single()
          await setSession(from.id, 'waiting_email_method', {
            contact_id: contactId,
            contact_name: contact?.name,
            contact_email: contact?.email,
          })
          await answerCallbackQuery(callbackQueryId)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await sendMessage(from.id,
            `收件人：<b>${contact?.name}</b>（${contact?.email || '無 email'}）\n\n請選擇發信方式：`,
            { reply_markup: { inline_keyboard: [[
              { text: '1️⃣ 使用 Template', callback_data: 'email_method_1' },
              { text: '2️⃣ AI 生成', callback_data: 'email_method_2' },
            ]] } }
          )
        }

        // ── /email: search other contact ──────────────────────────────────────
        else if (data === 'search_other_email') {
          await setSession(from.id, 'waiting_contact_for_email', {})
          await answerCallbackQuery(callbackQueryId)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await sendMessage(from.id, '請輸入聯絡人姓名或公司關鍵字：')
        }

        // ── /email: cancel ────────────────────────────────────────────────────
        else if (data === 'cancel_email') {
          await clearSession(from.id)
          await answerCallbackQuery(callbackQueryId, '已取消')
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await sendMessage(from.id, '已取消發信。')
        }

        // ── /met: confirm apply ───────────────────────────────────────────────
        else if (data === 'met_confirm') {
          await answerCallbackQuery(callbackQueryId, '套用中...')
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          try {
            const session = await getSession(from.id)
            const ctx = session?.context as { contact_ids: string[]; met_at: string | null; met_date: string; referred_by: string | null } | undefined
            if (!ctx?.contact_ids?.length) throw new Error('找不到待套用資料')
            const { contact_ids, met_at, met_date, referred_by } = ctx
            await supabase.from('contacts').update({
              met_at: met_at ?? null,
              met_date: met_date ?? null,
              referred_by: referred_by ?? null,
            }).in('id', contact_ids)
            const logContent =
              `認識於：${met_at ?? '—'}（${met_date}）` +
              (referred_by ? `，介紹人：${referred_by}` : '')
            await supabase.from('interaction_logs').insert(
              contact_ids.map((contact_id) => ({ contact_id, type: 'meeting', content: logContent, created_by: user.id }))
            )
            await clearSession(from.id)
            await sendMessage(from.id, `✅ 已套用至 ${contact_ids.length} 位聯絡人`)
          } catch (e) {
            await sendMessage(from.id, `❌ 套用失敗：${e instanceof Error ? e.message : '請再試一次'}`)
          }
        }

        // ── /met: cancel ──────────────────────────────────────────────────────
        else if (data === 'met_cancel') {
          await clearSession(from.id)
          await answerCallbackQuery(callbackQueryId, '已取消')
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await sendMessage(from.id, '已取消。')
        }

        // ── /tasks: mark done ─────────────────────────────────────────────────
        else if (data?.startsWith('task_done_')) {
          const taskId = data.replace('task_done_', '')
          const { data: task } = await supabase
            .from('tasks')
            .select('title, created_by, task_assignees(assignee_email)')
            .eq('id', taskId)
            .single()
          await supabase.from('tasks').update({
            status: 'done',
            completed_by: user.email,
            completed_at: new Date().toISOString(),
          }).eq('id', taskId)
          await answerCallbackQuery(callbackQueryId, '✅ 已完成')
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await sendMessage(from.id, `✅ 任務已完成：${task?.title ?? ''}`)

          // Notify task creator + other assignees via Teams
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
                    `✅ 任務已完成：${task.title}\n由 ${completedBy} 標記完成`)
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
          await sendMessage(from.id, '請輸入新的截止時間（例：2026-03-20 15:00）：')
        }

        // ── /tasks: cancel task ───────────────────────────────────────────────
        else if (data?.startsWith('task_cancel_')) {
          const taskId = data.replace('task_cancel_', '')
          const { data: task } = await supabase.from('tasks').select('title').eq('id', taskId).single()
          await supabase.from('tasks').update({ status: 'cancelled' }).eq('id', taskId)
          await answerCallbackQuery(callbackQueryId, '已取消任務')
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await sendMessage(from.id, `❌ 任務已取消：${task?.title ?? ''}`)
        }

      } catch (err) {
        const msg = err instanceof Error
          ? err.message
          : (typeof err === 'object' && err !== null ? JSON.stringify(err) : String(err))
        console.error('[bot] callback error:', msg)
        await answerCallbackQuery(callbackQueryId, '❌ 操作失敗')
        await sendMessage(from.id, `❌ 處理失敗：${msg}`)
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
        await sendMessage(chatId, '🔧 系統維護中，請稍後再試。')
        return NextResponse.json({ ok: true })
      }
    }

    const session = await getSession(fromId)

    if (message.photo) {
      const photo = message.photo[message.photo.length - 1]
      await handlePhoto(chatId, fromId, user, photo, session, m)
    } else if (message.document && message.document.mime_type?.startsWith('image/')) {
      // Image sent as file — route to same handlers; EXIF will be preserved
      const doc = { file_id: message.document.file_id }
      await handlePhoto(chatId, fromId, user, doc, session, m)
    } else if (message.text) {
      await handleText(chatId, fromId, user, message.text, session, m)
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: true })
  }
}
