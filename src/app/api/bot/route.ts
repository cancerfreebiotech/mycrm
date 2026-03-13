import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { analyzeBusinessCard } from '@/lib/gemini'
import { processCardImage } from '@/lib/imageProcessor'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`

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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const supabase = createServiceClient()

    // --- Callback Query ---
    if (body.callback_query) {
      const { id: callbackQueryId, from, message, data } = body.callback_query

      if (!data?.startsWith('save_')) {
        return NextResponse.json({ ok: true })
      }

      try {
        const jsonStr = Buffer.from(data.replace('save_', ''), 'base64').toString('utf-8')
        const contact = JSON.parse(jsonStr)

        const { data: inserted, error } = await supabase
          .from('contacts')
          .insert({ ...contact, created_by: from.id })
          .select('id')
          .single()

        if (error || !inserted) throw error

        await supabase.from('interaction_logs').insert({
          contact_id: inserted.id,
          content: '透過 Telegram Bot 新增名片',
          created_by: from.id,
        })

        await answerCallbackQuery(callbackQueryId, '✅ 已成功存檔！')
        await editMessageReplyMarkup(from.id, message.message_id)
        await sendMessage(from.id, '✅ 已成功存檔！')
      } catch {
        await answerCallbackQuery(callbackQueryId, '❌ 存檔失敗')
        await sendMessage(from.id, '❌ 處理失敗，請稍後再試')
      }

      return NextResponse.json({ ok: true })
    }

    // --- Message ---
    const message = body.message
    if (!message) return NextResponse.json({ ok: true })

    const chatId: number = message.chat.id
    const fromId: number = message.from?.id

    // 權限檢查
    const { data: user } = await supabase
      .from('authorized_users')
      .select('id')
      .eq('telegram_id', fromId)
      .single()

    if (!user) {
      await sendMessage(chatId, '⛔ 你沒有使用權限')
      return NextResponse.json({ ok: true })
    }

    // 照片處理
    if (message.photo) {
      try {
        const photo = message.photo[message.photo.length - 1]

        // 取得 file_path
        const fileRes = await fetch(`${TELEGRAM_API}/getFile?file_id=${photo.file_id}`)
        const fileData = await fileRes.json()
        const filePath = fileData.result.file_path

        // 下載圖片
        const imgRes = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`)
        const imgBuffer = Buffer.from(await imgRes.arrayBuffer())

        // 壓縮
        const compressed = await processCardImage(imgBuffer)

        // 上傳至 Supabase Storage
        const storagePath = `cards/${fromId}_${Date.now()}.jpg`
        const { error: uploadError } = await supabase.storage
          .from('cards')
          .upload(storagePath, compressed, { contentType: 'image/jpeg', upsert: false })

        if (uploadError) throw uploadError

        const { data: publicUrlData } = supabase.storage.from('cards').getPublicUrl(storagePath)
        const cardImgUrl = publicUrlData.publicUrl

        // OCR
        const cardData = await analyzeBusinessCard(compressed)
        const contactPayload = { ...cardData, card_img_url: cardImgUrl }
        const callbackData = 'save_' + Buffer.from(JSON.stringify(contactPayload)).toString('base64')

        const resultText =
          `📇 辨識結果：\n\n` +
          `👤 姓名：${cardData.name || '—'}\n` +
          `🏢 公司：${cardData.company || '—'}\n` +
          `💼 職稱：${cardData.job_title || '—'}\n` +
          `📧 Email：${cardData.email || '—'}\n` +
          `📞 電話：${cardData.phone || '—'}\n\n` +
          `請確認是否存檔？`

        await sendMessage(chatId, resultText, {
          reply_markup: {
            inline_keyboard: [[{ text: '✅ 確認存檔', callback_data: callbackData }]],
          },
        })
      } catch {
        await sendMessage(chatId, '❌ 處理失敗，請稍後再試')
      }
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: true })
  }
}
