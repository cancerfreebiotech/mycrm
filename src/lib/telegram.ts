// Minimal Telegram Bot API helpers for use outside the bot webhook
// (background workers, cron jobs). The webhook itself uses inline helpers
// in src/app/api/bot/route.ts which include retry-on-503 logic.

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const TELEGRAM_API = BOT_TOKEN ? `https://api.telegram.org/bot${BOT_TOKEN}` : null

export async function sendTelegramMessage(
  chatId: number,
  text: string,
  extra?: Record<string, unknown>
): Promise<void> {
  if (!TELEGRAM_API) return
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', ...extra }),
  }).catch(() => {})
}
