import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { analyzeBusinessCard, generateEmailContent, parseTaskCommand, parseMeetingCommand, parseMetCommand } from '@/lib/gemini'
import { processCardImage, generateCardFilename } from '@/lib/imageProcessor'
import { checkDuplicates } from '@/lib/duplicate'
import { sendMail, createCalendarEvent } from '@/lib/graph'
import { getValidProviderToken } from '@/lib/graph-server'
import { sendTeamsTaskNotification, sendTeamsMessage } from '@/lib/teams'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`

// ── Telegram helpers ──────────────────────────────────────────────────────────

async function sendMessage(chatId: number, text: string, extra?: object) {
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
  }
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
    .select('id, email, display_name, ai_model_id, provider_token')
    .eq('telegram_id', telegramId)
    .single()
  return data as { id: string; email: string; display_name: string | null; ai_model_id: string | null; provider_token: string | null } | null
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

async function handleAI(chatId: number, aiModelId: string | null) {
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
  const endpointName = (model.ai_endpoints as { name: string } | null)?.name ?? ''
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
  user: { id: string; email: string; display_name: string | null; ai_model_id: string | null; provider_token: string | null },
  text: string,
) {
  const supabase = createServiceClient()
  if (!text.trim()) {
    await sendMessage(chatId, '請提供會議資訊，例如：\n<code>/meet 3/25 下午1點 參訪 九州大學實驗室</code>\n<code>/meet 明天下午3點 和 Luna 開產品會議</code>')
    return
  }

  await sendMessage(chatId, '⏳ AI 解析中...')

  let parsed
  try {
    parsed = await parseMeetingCommand(text, new Date().toISOString(), user.ai_model_id)
  } catch {
    await sendMessage(chatId, '❌ AI 解析失敗，請確認格式後再試。')
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
    await sendMessage(chatId, '❌ 暫存行程失敗，請稍後再試。')
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

async function handleHelp(chatId: number) {
  const text =
    `🤖 <b>myCRM Bot 指令列表</b>\n\n` +
    `📷 <b>傳送照片</b> — 掃描名片，AI 辨識後存入 CRM\n\n` +
    `/search [關鍵字]　/s — 搜尋聯絡人\n` +
    `/note　/n — 新增筆記\n` +
    `/email　/e — 發送郵件給聯絡人\n` +
    `/add_back @姓名　/ab @姓名 — 補充名片反面\n` +
    `/work [描述]　/w — AI 解析任務，指派給他人或提醒自己\n` +
    `/meet [描述]　/m — AI 安排會議行程，確認後建立 Outlook 邀請\n` +
    `/met {數量} {描述}　— 批次記錄最近 N 位聯絡人的認識場合\n` +
    `　　例：/met 5 台北生技展 王小明介紹 昨天\n` +
    `/tasks　/t — 列出我的待處理任務\n` +
    `/user　/u — 列出組織成員\n` +
    `/AI — 顯示目前使用的 AI 模型\n` +
    `/help　/h — 顯示此說明`
  await sendMessage(chatId, text)
}

async function handleUser(chatId: number) {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('users')
    .select('display_name, email, telegram_id, teams_user_id')
    .order('created_at', { ascending: true })

  if (!data || data.length === 0) {
    await sendMessage(chatId, '目前沒有成員資料。')
    return
  }

  const lines = data.map((u, i) => {
    const name = u.display_name || u.email
    const tg = u.telegram_id ? `✅ Telegram` : `⬜ Telegram`
    const teams = u.teams_user_id ? `✅ Teams` : `⬜ Teams`
    return `${i + 1}. <b>${name}</b>\n   📧 ${u.email}\n   ${tg} · ${teams}`
  })

  await sendMessage(chatId, `👥 <b>組織成員列表（共 ${data.length} 人）</b>\n\n` + lines.join('\n\n'))
}

// ── Handle /search ────────────────────────────────────────────────────────────

async function handleSearch(chatId: number, keyword: string) {
  const contacts = await searchContacts(keyword)
  if (contacts.length === 0) {
    await sendMessage(chatId, `找不到符合「${keyword}」的聯絡人`)
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

async function processBackCardPhoto(
  chatId: number,
  fromId: number,
  user: { id: string; ai_model_id: string | null },
  contactId: string,
  fileId: string,
  contactNameHint?: string
) {
  const supabase = createServiceClient()
  try {
    const imgBuffer = await downloadTelegramPhoto(fileId)
    let compressed = await processCardImage(imgBuffer)

    const { data: existing } = await supabase
      .from('contacts')
      .select('name, company, job_title, email, phone')
      .eq('id', contactId)
      .single()

    const cardData = await analyzeBusinessCard(compressed, user.ai_model_id)

    if (cardData.rotation) {
      const sharp = (await import('sharp')).default
      compressed = await sharp(compressed).rotate(cardData.rotation).jpeg({ quality: 85 }).toBuffer()
    }

    const contactName = (existing?.name || cardData.name || cardData.name_en || '').replace(/[\s,./\\]/g, '')
    const filename = await generateCardFilename({ name: contactName || undefined, side: 'back' })
    const storagePath = `cards/${filename}`

    const { error: uploadError } = await supabase.storage
      .from('cards')
      .upload(storagePath, compressed, { contentType: 'image/jpeg', upsert: false })
    if (uploadError) throw new Error(uploadError.message ?? String(uploadError))

    const { data: publicUrlData } = supabase.storage.from('cards').getPublicUrl(storagePath)
    const backUrl = publicUrlData.publicUrl

    const updates: Record<string, string> = { card_img_back_url: backUrl }
    if (existing) {
      if (!existing.name && cardData.name) updates.name = cardData.name
      if (!existing.company && cardData.company) updates.company = cardData.company
      if (!existing.job_title && cardData.job_title) updates.job_title = cardData.job_title
      if (!existing.email && cardData.email) updates.email = cardData.email
      if (!existing.phone && cardData.phone) updates.phone = cardData.phone
    }

    await supabase.from('contacts').update(updates).eq('id', contactId)
    await updateLastContact(fromId, contactId)
    await clearSession(fromId)
    const label = existing?.name ?? contactNameHint ?? ''
    await sendMessage(chatId, `✅ 已更新 ${label} 的名片反面資訊`)
  } catch (err) {
    const msg = err instanceof Error
      ? err.message
      : (typeof err === 'object' && err !== null ? JSON.stringify(err) : String(err))
    console.error('[bot] back card error JSON:', JSON.stringify(err))
    console.error('[bot] back card error msg:', msg)
    await sendMessage(chatId, `❌ 處理失敗：${msg}`)
  }
}

// ── Handle photo (new card or back card) ──────────────────────────────────────

async function handlePhoto(
  chatId: number,
  fromId: number,
  user: { id: string; email: string; display_name: string | null; ai_model_id: string | null; provider_token: string | null },
  photo: { file_id: string },
  session: { state: string; context: Record<string, unknown> } | null
) {
  const supabase = createServiceClient()

  // Back card flow — confirmation step (prevents stale session sending to wrong contact)
  if (session?.state === 'waiting_for_back_card') {
    const contactId = session.context.contact_id as string
    const contactName = session.context.contact_name as string | undefined
    await setSession(fromId, 'waiting_for_back_card', { ...session.context, pending_file_id: photo.file_id })
    await sendMessage(chatId,
      `收到照片！要儲存為 <b>${contactName ?? '此聯絡人'}</b> 的背面名片嗎？`,
      { reply_markup: { inline_keyboard: [[
        { text: '✅ 確認', callback_data: `confirm_back_photo_${contactId}` },
        { text: '❌ 取消', callback_data: 'cancel_back_photo' },
      ]] } }
    )
    return
  }


  // New card scan — check pending limit
  const { count: pendingCount } = await supabase
    .from('pending_contacts')
    .select('*', { count: 'exact', head: true })
    .eq('created_by', user.id)
  if ((pendingCount ?? 0) >= 5) {
    await sendMessage(chatId, `⚠️ 你目前有 ${pendingCount} 張名片待確認，請先處理後再傳新的`)
    return
  }

  await sendMessage(chatId, '⏳ 處理中，請稍候...')
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
    if (cardData.rotation && cardData.rotation !== 0) {
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

    // Name fallback: use English name if no local language name
    if (!cardData.name && cardData.name_en) cardData.name = cardData.name_en

    // If no name detected at all, save as failed scan and notify user
    if (!cardData.name) {
      await supabase.from('failed_scans').insert({
        user_id: user.id,
        storage_path: storagePath,
        card_img_url: cardImgUrl,
      })
      await sendMessage(chatId,
        '❌ 辨識失敗：無法識別姓名。\n\n照片已保留，已通知管理員查看。\n若需要，管理員可至後台手動建立聯絡人。'
      )
      return
    }

    const { exact, similar } = await checkDuplicates(cardData.email, cardData.name)
    let dupWarning = ''
    if (exact) {
      dupWarning += `\n⚠️ 此 email 已有聯絡人：${exact.name}（${exact.company}），是否仍要新增？`
    } else if (similar.length > 0) {
      dupWarning += `\n🔍 系統有相似聯絡人：${similar[0].name}（${similar[0].company}），請確認是否為同一人`
    }

    const contactPayload = { ...cardData, card_img_url: cardImgUrl }
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
      `\n\n請確認是否存檔？`

    await sendMessage(chatId, resultText, {
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ 確認存檔', callback_data: `save_${pending.id}` },
          { text: '❌ 不存檔', callback_data: `cancel_${pending.id}` },
        ]],
      },
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
  user: { id: string; email: string; display_name: string | null; ai_model_id: string | null; provider_token: string | null },
  naturalText: string,
  lastContactId?: string | null
) {
  const supabase = createServiceClient()
  await sendMessage(chatId, '⏳ AI 解析任務中，請稍候...')

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
    await sendMessage(chatId, '❌ 建立任務失敗，請稍後再試。')
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
  description: string
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
  user: { id: string; email: string; display_name: string | null; ai_model_id: string | null; provider_token: string | null }
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
    await sendMessage(chatId, '✅ 你目前沒有待處理任務！')
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
  user: { id: string; email: string; display_name: string | null; ai_model_id: string | null; provider_token: string | null },
  text: string,
  session: { state: string; context: Record<string, unknown>; last_contact_id: string | null } | null
) {
  const supabase = createServiceClient()

  const cmd = text.trim()

  // ── /help /h ───────────────────────────────────────────────────────────────
  if (cmd === '/help' || cmd === '/h') {
    await handleHelp(chatId)
    return
  }

  // ── /user /u ───────────────────────────────────────────────────────────────
  if (cmd === '/user' || cmd === '/u') {
    await handleUser(chatId)
    return
  }

  // ── /AI ────────────────────────────────────────────────────────────────────
  if (cmd.toLowerCase() === '/ai') {
    await handleAI(chatId, user.ai_model_id)
    return
  }

  // ── /search /s ─────────────────────────────────────────────────────────────
  const searchMatch = cmd.match(/^\/(?:search|s)\s+(.+)/)
  if (searchMatch) {
    await handleSearch(chatId, searchMatch[1].trim())
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

  // ── Session: waiting_email_description ───────────────────────────────────
  if (session?.state === 'waiting_email_description') {
    await sendMessage(chatId, '⏳ AI 生成中，請稍候...')
    try {
      const body = await generateEmailContent(text.trim(), undefined, user.ai_model_id)
      const subject = `關於：${text.trim().slice(0, 40)}${text.trim().length > 40 ? '...' : ''}`
      const preview = body.replace(/<[^>]+>/g, '').slice(0, 200)

      await setSession(fromId, 'waiting_email_confirm', {
        ...session.context,
        subject,
        body_html: body,
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
  }

  // ── Session: waiting_email_supplement ─────────────────────────────────────
  if (session?.state === 'waiting_email_supplement') {
    await sendMessage(chatId, '⏳ AI 生成中，請稍候...')
    try {
      const templateContent = session.context.template_body as string
      const supplement = text.trim().toLowerCase() === 'skip' ? '' : text.trim()
      const body = await generateEmailContent(supplement || '請依照範本生成', templateContent, user.ai_model_id)
      const subject = session.context.template_subject as string || '（無主旨）'
      const preview = body.replace(/<[^>]+>/g, '').slice(0, 200)

      await setSession(fromId, 'waiting_email_confirm', {
        ...session.context,
        subject,
        body_html: body,
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
  }

  // ── Session: waiting_for_note_contact ─────────────────────────────────────
  if (session?.state === 'waiting_for_note_contact') {
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
  }

  // ── Session: waiting_for_note_content ─────────────────────────────────────
  if (session?.state === 'waiting_for_note_content') {
    const contactId = session.context.contact_id as string | null
    await supabase.from('interaction_logs').insert({
      contact_id: contactId ?? null,
      type: 'note',
      content: text.trim(),
      created_by: user.id,
    })
    await clearSession(fromId)
    const contactName = session.context.contact_name as string | undefined
    await sendMessage(chatId, contactName
      ? `✅ 已儲存筆記（${contactName}）`
      : '✅ 已儲存為未歸類筆記'
    )
    return
  }

  // ── /work /w ───────────────────────────────────────────────────────────────
  const workMatch = cmd.match(/^\/(?:work|w)\s+(.+)/s)
  if (workMatch) {
    await handleWork(chatId, user, workMatch[1].trim(), session?.last_contact_id)
    return
  }

  // ── /met (must be before /meet to avoid /m catching /met) ─────────────────
  const metMatch = cmd.match(/^\/met\s+(\d+)\s+([\s\S]+)/)
  console.log('[bot] /met check:', { cmd: cmd.slice(0, 60), matched: !!metMatch })
  if (metMatch) {
    const count = Math.min(parseInt(metMatch[1], 10), 20)
    await handleMet(chatId, user, count, metMatch[2].trim())
    return
  }

  // ── /meet /m ───────────────────────────────────────────────────────────────
  const meetMatch = text.match(/^\/(?:meet|m)(?:@\S+)?\s*([\s\S]*)$/i)
  if (meetMatch) {
    await handleMeet(chatId, user, meetMatch[1].trim())
    return
  }

  // ── /tasks /t ──────────────────────────────────────────────────────────────
  if (cmd === '/tasks' || cmd === '/t') {
    await handleTasks(chatId, user)
    return
  }

  // ── Session: waiting_task_postpone_date ───────────────────────────────────
  if (session?.state === 'waiting_task_postpone_date') {
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

  // ── /add_back /ab (no @name) — use last contact ───────────────────────────
  if (cmd === '/ab' || cmd === '/add_back') {
    const lastContactId = session?.last_contact_id
    if (lastContactId) {
      const { data: lastContact } = await supabase.from('contacts').select('id, name, company').eq('id', lastContactId).single()
      if (lastContact) {
        await sendMessage(chatId,
          `要為上一位聯絡人補充名片反面嗎？\n👤 ${lastContact.name}（${lastContact.company ?? ''}）`,
          { reply_markup: { inline_keyboard: [[
            { text: '✅ 是，補充背面', callback_data: `confirm_ab_${lastContactId}` },
            { text: '🔍 指定其他人', callback_data: 'search_other_ab' },
          ]] } }
        )
        return
      }
    }
    await sendMessage(chatId, '請指定聯絡人姓名，例：\n<code>/ab @王小明</code>')
    return
  }

  // ── /add_back /ab @name command ───────────────────────────────────────────
  const addBackMatch = cmd.match(/^\/(?:add_back|ab)\s+@(.+)/)
  if (addBackMatch) {
    const query = addBackMatch[1].trim()
    const contacts = await searchContacts(query)
    if (contacts.length === 0) {
      await sendMessage(chatId, `找不到聯絡人「${query}」`)
    } else if (contacts.length === 1) {
      await setSession(fromId, 'waiting_for_back_card', { contact_id: contacts[0].id, contact_name: contacts[0].name })
      await sendMessage(chatId, `找到：${contacts[0].name}\n\n請傳送名片反面照片`)
    } else {
      const buttons = contacts.map((c) => [{ text: `${c.name}（${c.company ?? ''}）`, callback_data: `select_back_${c.id}` }])
      await sendMessage(chatId, '找到多筆聯絡人，請選擇要補充反面的名片：', { reply_markup: { inline_keyboard: buttons } })
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
        if (!user) {
          await answerCallbackQuery(callbackQueryId, '⛔ 無使用權限')
          return NextResponse.json({ ok: true })
        }

        // ── Save card ─────────────────────────────────────────────────────────
        if (data?.startsWith('save_')) {
          const pendingId = data.replace('save_', '')
          const { data: pending } = await supabase
            .from('pending_contacts')
            .select('data')
            .eq('id', pendingId)
            .single()

          // Already processed (Telegram retry) — ack silently
          if (!pending) {
            await answerCallbackQuery(callbackQueryId)
            return NextResponse.json({ ok: true })
          }

          await answerCallbackQuery(callbackQueryId, '✅ 已成功存檔！')

          // Strip rotation field (OCR-only, no contacts column)
          const { rotation: _r, ...contactFields } = pending.data as Record<string, unknown>
          const { data: inserted, error } = await supabase
            .from('contacts')
            .insert({ ...contactFields, created_by: user.id })
            .select('id')
            .single()
          if (error || !inserted) throw new Error(error?.message ?? '存檔失敗')

          await supabase.from('interaction_logs').insert({
            contact_id: inserted.id,
            type: 'note',
            content: '透過 Telegram Bot 新增名片',
            created_by: user.id,
          })
          await supabase.from('pending_contacts').delete().eq('id', pendingId)
          await updateLastContact(from.id, inserted.id)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          const appUrl = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? ''
          const contactLink = appUrl ? `\n\n👤 <a href="${appUrl}/contacts/${inserted.id}">查看聯絡人頁面</a>` : ''
          await sendMessage(from.id, `✅ 已成功存檔！${contactLink}`)
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
          await answerCallbackQuery(callbackQueryId, '已取消')
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await sendMessage(from.id, '已取消，名片未存檔。')
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
            await answerCallbackQuery(callbackQueryId, '✅ 行程已建立！')
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
          await answerCallbackQuery(callbackQueryId, '已取消')
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await sendMessage(from.id, '已取消，行程未建立。')
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

        // ── Select contact for back card ──────────────────────────────────────
        else if (data?.startsWith('select_back_')) {
          const contactId = data.replace('select_back_', '')
          const { data: contact } = await supabase
            .from('contacts')
            .select('id, name')
            .eq('id', contactId)
            .single()
          await setSession(from.id, 'waiting_for_back_card', { contact_id: contactId, contact_name: contact?.name })
          await answerCallbackQuery(callbackQueryId)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await sendMessage(from.id, `找到：${contact?.name}\n\n請傳送名片反面照片`)
        }

        // ── Confirm back card photo ───────────────────────────────────────────
        else if (data?.startsWith('confirm_back_photo_')) {
          const contactId = data.replace('confirm_back_photo_', '')
          const session = await getSession(from.id)
          const fileId = session?.context?.pending_file_id as string | undefined
          const contactNameHint = session?.context?.contact_name as string | undefined
          await answerCallbackQuery(callbackQueryId)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          if (!fileId) {
            await sendMessage(from.id, '❌ 找不到待處理照片，請重新傳送。')
            await clearSession(from.id)
          } else {
            await sendMessage(from.id, '⏳ 處理中，請稍候...')
            await processBackCardPhoto(from.id, from.id, user, contactId, fileId, contactNameHint)
          }
        }

        // ── Cancel back card photo ────────────────────────────────────────────
        else if (data === 'cancel_back_photo') {
          await clearSession(from.id)
          await answerCallbackQuery(callbackQueryId)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await sendMessage(from.id, '已取消。如需掃描新名片，請直接傳送照片；如要補充其他人背面，請重新使用 /ab @姓名。')
        }

        // ── /ab: search other contact ─────────────────────────────────────────
        else if (data === 'search_other_ab') {
          await answerCallbackQuery(callbackQueryId)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await sendMessage(from.id, '請輸入聯絡人姓名，例：\n<code>/ab @王小明</code>')
        }

        // ── /ab: confirm use last contact ─────────────────────────────────────
        else if (data?.startsWith('confirm_ab_')) {
          const contactId = data.replace('confirm_ab_', '')
          const { data: contact } = await supabase.from('contacts').select('id, name').eq('id', contactId).single()
          await setSession(from.id, 'waiting_for_back_card', { contact_id: contactId, contact_name: contact?.name })
          await answerCallbackQuery(callbackQueryId)
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await sendMessage(from.id, `找到：${contact?.name}\n\n請傳送名片反面照片`)
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

    const user = await getAuthorizedUser(fromId)
    if (!user) {
      await sendMessage(chatId, '⛔ 此 Bot 為 CancerFree Biotech 內部專用，你的帳號尚未授權。')
      return NextResponse.json({ ok: true })
    }

    const session = await getSession(fromId)

    if (message.photo) {
      const photo = message.photo[message.photo.length - 1]
      await handlePhoto(chatId, fromId, user, photo, session)
    } else if (message.text) {
      await handleText(chatId, fromId, user, message.text, session)
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: true })
  }
}
