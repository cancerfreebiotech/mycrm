import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { analyzeBusinessCard } from '@/lib/gemini'
import { processCardImage, generateCardFilename } from '@/lib/imageProcessor'
import { checkDuplicates } from '@/lib/duplicate'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`

// ── Telegram helpers ──────────────────────────────────────────────────────────

async function sendMessage(chatId: number, text: string, extra?: object) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, ...extra }),
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
    .select('id, gemini_model')
    .eq('telegram_id', telegramId)
    .single()
  return data as { id: string; gemini_model: string } | null
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
    .select('id, name, company, email')
    .or(`name.ilike.%${query}%,email.ilike.%${query}%`)
    .limit(5)
  return data ?? []
}

// ── Handle photo (new card or back card) ──────────────────────────────────────

async function handlePhoto(
  chatId: number,
  fromId: number,
  user: { id: string; gemini_model: string },
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

      // Re-OCR to fill missing fields
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

    // Duplicate check
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
  user: { id: string; gemini_model: string },
  text: string,
  session: { state: string; context: Record<string, unknown> } | null
) {
  const supabase = createServiceClient()

  // --- Session: waiting for note contact ---
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

  // --- Session: waiting for note content ---
  if (session?.state === 'waiting_for_note_content') {
    const contactId = session.context.contact_id as string | null
    await supabase.from('interaction_logs').insert({
      contact_id: contactId ?? null,
      type: 'meeting',
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

  // --- /note command ---
  if (text.trim() === '/note') {
    await setSession(fromId, 'waiting_for_note_contact', {})
    await sendMessage(chatId, '請輸入聯絡人姓名或 Email：')
    return
  }

  // --- /add_back @name command ---
  const addBackMatch = text.trim().match(/^\/add_back\s+@(.+)/)
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

  // --- @ quick format: @name\ncontent ---
  if (text.startsWith('@')) {
    const lines = text.split('\n')
    const query = lines[0].slice(1).trim()
    const content = lines.slice(1).join('\n').trim()
    const contacts = await searchContacts(query)

    if (!content) {
      // No content yet, ask for it after contact selection
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

    // Content provided inline
    let contactId: string | null = null
    let contactName: string | undefined
    if (contacts.length === 1) {
      contactId = contacts[0].id
      contactName = contacts[0].name
    } else if (contacts.length === 0) {
      contactId = null
    } else {
      // Multiple matches — ask to select, save content in session
      await setSession(fromId, 'waiting_for_note_content_after_select', { content })
      const buttons = contacts.map((c) => [{ text: `${c.name}（${c.company ?? ''}）`, callback_data: `select_contact_${c.id}` }])
      await sendMessage(chatId, '找到多筆聯絡人，請選擇：', { reply_markup: { inline_keyboard: buttons } })
      return
    }

    await supabase.from('interaction_logs').insert({
      contact_id: contactId,
      type: 'meeting',
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
  await sendMessage(chatId, '請傳送名片照片，或使用 /note 記錄會議筆記。')
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

        // Save card
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

        // Cancel card
        else if (data?.startsWith('cancel_')) {
          const pendingId = data.replace('cancel_', '')
          await supabase.from('pending_contacts').delete().eq('id', pendingId)
          await answerCallbackQuery(callbackQueryId, '已取消')
          await editMessageReplyMarkup(message.chat.id, message.message_id)
          await sendMessage(from.id, '已取消，名片未存檔。')
        }

        // Select contact for note
        else if (data?.startsWith('select_contact_')) {
          const contactId = data.replace('select_contact_', '')
          const { data: contact } = await supabase
            .from('contacts')
            .select('id, name')
            .eq('id', contactId)
            .single()

          const session = await getSession(from.id)

          // If content is already ready (from @ format)
          if (session?.state === 'waiting_for_note_content_after_select') {
            const content = session.context.content as string
            await supabase.from('interaction_logs').insert({
              contact_id: contactId,
              type: 'meeting',
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

        // Select contact for back card
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
