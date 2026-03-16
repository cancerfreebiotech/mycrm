/**
 * Microsoft Teams Bot webhook
 * Register this URL in Azure AD Bot Channel Registration:
 *   https://<your-domain>/api/teams-bot
 *
 * Required env vars:
 *   TEAMS_BOT_APP_ID, TEAMS_BOT_APP_SECRET
 *
 * First-time setup per user:
 *   User sends any message or "/link" to the bot in Teams.
 *   If email is available in the activity, it auto-links.
 *   Otherwise the bot replies asking the user to send: /link your@email.com
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

async function verifyTeamsRequest(req: NextRequest): Promise<boolean> {
  const appId = process.env.TEAMS_BOT_APP_ID
  if (!appId) return false
  const authHeader = req.headers.get('authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) return false
  const token = authHeader.slice(7)
  if (!token || token.split('.').length !== 3) return false
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
    return payload.aud === appId || payload.appid === appId
  } catch {
    return false
  }
}

async function getBotToken(): Promise<string | null> {
  const appId = process.env.TEAMS_BOT_APP_ID
  const appSecret = process.env.TEAMS_BOT_APP_SECRET
  if (!appId || !appSecret) return null
  try {
    const res = await fetch('https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: appId,
        client_secret: appSecret,
        scope: 'https://api.botframework.com/.default',
      }),
    })
    const data = await res.json()
    return (data.access_token as string) ?? null
  } catch {
    return null
  }
}

async function sendToTeams(serviceUrl: string, conversationId: string, text: string, replyToId?: string) {
  const token = await getBotToken()
  if (!token) return
  const base = serviceUrl.replace(/\/$/, '')
  const url = replyToId
    ? `${base}/v3/conversations/${conversationId}/activities/${replyToId}`
    : `${base}/v3/conversations/${conversationId}/activities`
  await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'message', text }),
  })
}

async function saveConversation(
  supabase: ReturnType<typeof createServiceClient>,
  email: string,
  aadId: string,
  conversationId: string,
  serviceUrl: string,
) {
  await supabase
    .from('users')
    .update({ teams_user_id: aadId, teams_conversation_id: conversationId, teams_service_url: serviceUrl })
    .eq('email', email)
}

export async function POST(req: NextRequest) {
  if (!(await verifyTeamsRequest(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: true })
  }

  const activityType = (body.type as string) ?? ''
  const serviceUrl = (body.serviceUrl as string) ?? ''
  const conversation = body.conversation as Record<string, string> | undefined
  const conversationId = conversation?.id ?? ''
  const from = body.from as Record<string, string> | undefined
  const aadId = from?.aadObjectId ?? ''
  const fromEmail = from?.email ?? ''  // available in some tenant configurations
  const supabase = createServiceClient()

  // ── conversationUpdate: user added the bot ───────────────────────────────
  if (activityType === 'conversationUpdate') {
    const membersAdded = (body.membersAdded as Array<{ id?: string; aadObjectId?: string; email?: string }>) ?? []
    const botAppId = process.env.TEAMS_BOT_APP_ID ?? ''
    for (const member of membersAdded) {
      if (member.id?.includes(botAppId)) continue  // skip bot itself
      const memberAadId = member.aadObjectId ?? ''
      const memberEmail = member.email ?? ''
      if (!memberAadId || !conversationId || !serviceUrl) continue
      if (memberEmail) {
        await saveConversation(supabase, memberEmail, memberAadId, conversationId, serviceUrl)
      }
    }
    return NextResponse.json({ ok: true })
  }

  // ── invoke: Adaptive Card button press ───────────────────────────────────
  if (activityType === 'invoke' && (body.value as Record<string, string>)?.action) {
    const { action, task_id } = body.value as { action: string; task_id: string }

    if (action === 'task_done' && task_id) {
      let userEmail: string | undefined = fromEmail || undefined
      if (!userEmail && aadId) {
        const { data } = await supabase.from('users').select('email').eq('teams_user_id', aadId).single()
        userEmail = data?.email
      }
      if (userEmail) {
        await supabase
          .from('tasks')
          .update({ status: 'done', completed_by: userEmail, completed_at: new Date().toISOString() })
          .eq('id', task_id)
      }
      return NextResponse.json({
        type: 'invokeResponse',
        value: { status: 200, body: { type: 'message', text: '✅ 任務已標記完成！' } },
      })
    }
  }

  // ── message ───────────────────────────────────────────────────────────────
  if (activityType === 'message') {
    const text = ((body.text as string) ?? '').trim()

    // Auto-link if email is in the activity
    if (fromEmail && aadId && conversationId && serviceUrl) {
      await saveConversation(supabase, fromEmail, aadId, conversationId, serviceUrl)
    }

    // /link <email> command — manual linking
    const linkMatch = text.match(/^\/link\s+(\S+@\S+\.\S+)$/i)
    if (linkMatch) {
      const targetEmail = linkMatch[1].toLowerCase()
      const { data: found } = await supabase.from('users').select('email').eq('email', targetEmail).single()
      if (found && aadId && conversationId && serviceUrl) {
        await saveConversation(supabase, targetEmail, aadId, conversationId, serviceUrl)
        await sendToTeams(serviceUrl, conversationId, `✅ 已綁定 ${targetEmail}，之後的任務通知會傳到這裡。`, body.id as string)
      } else {
        await sendToTeams(serviceUrl, conversationId, `❌ 找不到帳號 ${targetEmail}，請確認 email 是否正確。`, body.id as string)
      }
      return NextResponse.json({ ok: true })
    }

    // Check if already linked
    const linked = aadId
      ? (await supabase.from('users').select('email').eq('teams_user_id', aadId).single()).data
      : null

    if (text.toLowerCase() === '/help' || text.toLowerCase() === 'help') {
      const msg = linked
        ? `📋 myCRM Bot（已綁定：${linked.email}）\n\n任務通知會自動傳送到這裡。點擊卡片上的「✅ 標記完成」即可完成任務。`
        : `📋 myCRM Bot\n\n請先綁定帳號：\n傳送 \`/link your@email.com\` 來啟用任務通知。`
      await sendToTeams(serviceUrl, conversationId, msg, body.id as string)
    } else if (!linked && text && !text.startsWith('/')) {
      // First message, not yet linked — prompt
      await sendToTeams(serviceUrl, conversationId,
        `👋 你好！請傳送 \`/link your@email.com\` 來綁定 myCRM 帳號，之後任務通知會傳送到這裡。`,
        body.id as string,
      )
    }
  }

  return NextResponse.json({ ok: true })
}
