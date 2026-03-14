import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { analyzeBusinessCard, generateEmailContent } from '@/lib/gemini'
import { processCardImage, generateCardFilename } from '@/lib/imageProcessor'
import { checkDuplicates } from '@/lib/duplicate'
import { sendMail } from '@/lib/graph'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`

// ── Telegram helpers ──────────────────────────────────────────────────────────

async function sendMessage(chatId: number, text: string, extra?: object) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', ...extra }),
  })
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
    .select('state, context')
    .eq('telegram_id', telegramId)
    .maybeSingle()
  return data as { state: string; context: Record<string, unknown> } | null
}

async function setSession(telegramId: number, state: string, context: Record<string, unknown>) {
  const supabase = createServiceClient()
  await supabase.from('bot_sessions').upsert(
    { telegram_id: telegramId, state, context, updated_at: new Date().toISOString() },
    { onConflict: 'telegram_id' }
  )
}

async function clearSession(telegramId: number) {
  const supabase = createServiceClient()
  await supabase.from('bot_sessions').delete().eq('telegram_id', telegramId)
}

// ── Auth helper ───────────────────────────────────────────────────────────────

async function getAuthorizedUser(telegramId: number) {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('users')
    .select('id, gemini_model, provider_token')
    .eq('telegram_id', telegramId)
    .single()
  return data as { id: string; gemini_model: string; provider_token: string | null } | null
}

// ── Download photo from Telegram ──────────────────────────────────────────────

async function downloadTelegramPhoto(fileId: string): Promise<Buffer> {
  const fileRes = await fetch(`${TELEGRAM_API}/getFile?file_id=${fileId}`)
  const fileData = await fileRes.json()
  const filePath = fileData.result.file_path
  const imgRes = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`)
  return Buffer.from(await imgRes.arrayBuffer())
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

// ── Handle /help ──────────────────────────────────────────────────────────────

async function handleHelp(chatId: number) {
  const text =
    `🤖 <b>myCRM Bot 指令列表</b>\n\n` +
    `📷 <b>傳送照片</b> — 掃描名片，AI 辨識後存入 CRM\n\n` +
    `/search [關鍵字]　/s — 搜尋聯絡人\n` +
    `/note — 新增筆記\n` +
    `/email　/e — 發送郵件給聯絡人\n` +
    `/add_back @姓名　/ab @姓名 — 補充名片反面\n` +
    `/user　/u — 列出組織成員\n` +
    `/help　/h — 顯示此說明`
  await sendMessage(chatId, text)
}

async function handleUser(chatId: number) {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('users')
    .select('display_name, email, telegram_id')
    .order('created_at', { ascending: true })

  if (!data || data.length === 0) {
    await sendMessage(chatId, '目前沒有成員資料。')
    return
  }

  const lines = data.map((u, i) => {
    const name = u.display_name || u.email
    const tg = u.telegram_id ? `📱 Telegram ID：${u.telegram_id}` : `📱 Telegram ID：未設定`
    return `${i + 1}. <b>${name}</b>\n   📧 ${u.email}\n   ${tg}`
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

    const buttons = [[
      { text: '✉️ 發信', callback_data: `email_contact_${c.id}` },
      { text: '📝 筆記', callback_data: `note_contact_${c.id}` },
    ]]

    await sendMessage(chatId, info, { reply_markup: { inline_keyboard: buttons } })

    if (c.card_img_url) await sendPhoto(chatId, c.card_img_url)
    if (c.card_img_back_url) await sendPhoto(chatId, c.card_img_back_url)
  }
}

// ── Handle photo (new card or back card) ──────────────────────────────────────

async function handlePhoto(
  chatId: number,
  fromId: number,
  user: { id: string; gemini_model: string; provider_token: string | null },
  photo: { file_id: string },
  session: { state: string; context: Record<string, unknown> } | null
) {
  const supabase = createServiceClient()

  // Back card flow
  if (session?.state === 'waiting_for_back_card') {
    const contactId = session.context.contact_id as string
    await sendMessage(chatId, '⏳ 處理中，請稍候...')
    try {
      const imgBuffer = await downloadTelegramPhoto(photo.file_id)
      const compressed = await processCardImage(imgBuffer)
      const filename = await generateCardFilename()
      const storagePath = `cards/back_${filename}`

      const { error: uploadError } = await supabase.storage
        .from('cards')
        .upload(storagePath, compressed, { contentType: 'image/jpeg', upsert: false })
      if (uploadError) throw uploadError

      const { data: publicUrlData } = supabase.storage.from('cards').getPublicUrl(storagePath)
      const backUrl = publicUrlData.publicUrl

      const { data: existing } = await supabase
        .from('contacts')
        .select('name, company, job_title, email, phone')
        .eq('id', contactId)
        .single()

      const cardData = await analyzeBusinessCard(compressed, user.gemini_model)

      const updates: Record<string, string> = { card_img_back_url: backUrl }
      if (existing) {
        if (!existing.name && cardData.name) updates.name = cardData.name
        if (!existing.company && cardData.company) updates.company = cardData.company
        if (!existing.job_title && cardData.job_title) updates.job_title = cardData.job_title
        if (!existing.email && cardData.email) updates.email = cardData.email
        if (!existing.phone && cardData.phone) updates.phone = cardData.phone
      }

      await supabase.from('contacts').update(updates).eq('id', contactId)
      await clearSession(fromId)
      await sendMessage(chatId, '✅ 已更新名片反面資訊')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[bot] back card error:', msg)
      await sendMessage(chatId, `❌ 處理失敗：${msg}`)
    }
    return
  }

  // New card scan
  await sendMessage(chatId, '⏳ 處理中，請稍候...')
  try {
    const imgBuffer = await downloadTelegramPhoto(photo.file_id)
    const compressed = await processCardImage(imgBuffer)
    const filename = await generateCardFilename()
    const storagePath = `cards/${filename}`

    const { error: uploadError } = await supabase.storage
      .from('cards')
      .upload(storagePath, compressed, { contentType: 'image/jpeg', upsert: false })
    if (uploadError) throw uploadError

    const { data: publicUrlData } = supabase.storage.from('cards').getPublicUrl(storagePath)
    const cardImgUrl = publicUrlData.publicUrl

    const cardData = await analyzeBusinessCard(compressed, user.gemini_model)

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
      .insert({ data: contactPayload, created_by: user.id })
      .select('id')
      .single()
    if (pendingError || !pending) throw new Error('暫存失敗')

    const resultText =
      `📇 辨識結果：\n\n` +
      `👤 姓名：${cardData.name || '—'}\n` +
      `🏢 公司：${cardData.company || '—'}\n` +
      `💼 職稱：${cardData.job_title || '—'}\n` +
      `📧 Email：${cardData.email || '—'}\n` +
      `📞 電話：${cardData.phone || '—'}` +
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
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[bot] photo processing error:', msg)
    await sendMessage(chatId, `❌ 處理失敗：${msg}`)
  }
}

// ── Handle text messages ──────────────────────────────────────────────────────

async function handleText(
  chatId: number,
  fromId: number,
  user: { id: string; gemini_model: string; provider_token: string | null },
  text: string,
  session: { state: string; context: Record<string, unknown> } | null
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

  // ── /search /s ─────────────────────────────────────────────────────────────
  const searchMatch = cmd.match(/^\/(?:search|s)\s+(.+)/)
  if (searchMatch) {
    await handleSearch(chatId, searchMatch[1].trim())
    return
  }

  // ── /email /e ──────────────────────────────────────────────────────────────
  if (cmd === '/email' || cmd === '/e') {
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
      const body = await generateEmailContent(text.trim(), undefined, user.gemini_model)
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
      const body = await generateEmailContent(supplement || '請依照範本生成', templateContent, user.gemini_model)
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

  // ── /note command ──────────────────────────────────────────────────────────
  if (cmd === '/note') {
    await setSession(fromId, 'waiting_for_note_contact', {})
    await sendMessage(chatId, '請輸入聯絡人姓名或 Email：')
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
  try {
    const body = await req.json()
    const supabase = createServiceClient()

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
          const { data: pending, error: pendingError } = await supabase
            .from('pending_contacts')
            .select('data')
            .eq('id', pendingId)
            .single()

          if (pendingError || !pending) throw new Error('找不到暫存資料')

          const contact = pending.data
          const { data: inserted, error } = await supabase
            .from('contacts')
            .insert({ ...contact, created_by: user.id })
            .select('id')
            .single()
          if (error || !inserted) throw error

          await supabase.from('interaction_logs').insert({
            contact_id: inserted.id,
            type: 'note',
            content: '透過 Telegram Bot 新增名片',
            created_by: user.id,
          })
          await supabase.from('pending_contacts').delete().eq('id', pendingId)
          await answerCallbackQuery(callbackQueryId, '✅ 已成功存檔！')
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await sendMessage(from.id, '✅ 已成功存檔！')
        }

        // ── Cancel card ───────────────────────────────────────────────────────
        else if (data?.startsWith('cancel_')) {
          const pendingId = data.replace('cancel_', '')
          await supabase.from('pending_contacts').delete().eq('id', pendingId)
          await answerCallbackQuery(callbackQueryId, '已取消')
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await sendMessage(from.id, '已取消，名片未存檔。')
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

          if (!user.provider_token) {
            await answerCallbackQuery(callbackQueryId)
            await editMessageReplyMarkup(message.chat.id, message.message_id)
            await sendMessage(from.id,
              '⚠️ 無法取得 Microsoft 存取憑證。\n\n請至 myCRM 網頁重新登入後，再使用 Bot 發信功能。'
            )
            await clearSession(from.id)
            return NextResponse.json({ ok: true })
          }

          await sendMessage(from.id, '⏳ 發送中...')
          try {
            await sendMail({
              accessToken: user.provider_token,
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

        // ── /email: cancel ────────────────────────────────────────────────────
        else if (data === 'cancel_email') {
          await clearSession(from.id)
          await answerCallbackQuery(callbackQueryId, '已取消')
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await sendMessage(from.id, '已取消發信。')
        }

      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
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
      await sendMessage(chatId, '⛔ 你沒有使用權限，請先在 myCRM 網站的個人設定綁定你的 Telegram ID')
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
