// Minimal Telegram Bot API helpers for use outside the bot webhook
// (background workers, cron jobs). The webhook itself uses inline helpers
// in src/app/api/bot/route.ts which include retry-on-503 logic.

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const TELEGRAM_API = BOT_TOKEN ? `https://api.telegram.org/bot${BOT_TOKEN}` : null

export interface InlineKeyboardButton {
  text: string
  callback_data: string
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][]
}

// Optional `replyMarkup` attaches an inline keyboard (e.g. done/snooze buttons
// on the daily task digest). Two-arg callers are unaffected.
export async function sendTelegramMessage(
  chatId: number,
  text: string,
  replyMarkup?: InlineKeyboardMarkup
): Promise<void> {
  if (!TELEGRAM_API) return
  const body: Record<string, unknown> = { chat_id: chatId, text, parse_mode: 'HTML' }
  if (replyMarkup) body.reply_markup = replyMarkup
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => {})
}
