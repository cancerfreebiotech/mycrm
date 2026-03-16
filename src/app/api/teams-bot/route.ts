/**
 * Microsoft Teams Bot webhook
 * Register this URL in Azure AD Bot Channel Registration:
 *   https://<your-domain>/api/teams-bot
 *
 * Required env vars:
 *   TEAMS_BOT_APP_ID, TEAMS_BOT_APP_SECRET, TEAMS_TENANT_ID
 *
 * The Azure AD app needs "User.ReadBasic.All" application permission on Graph
 * so the bot can resolve aadObjectId → email automatically on first message.
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

/** Resolve a Teams AAD Object ID to email via Microsoft Graph (app-level token).
 *  Requires User.ReadBasic.All application permission on the Azure AD app. */
async function resolveAadEmail(aadObjectId: string): Promise<string | null> {
  const appId = process.env.TEAMS_BOT_APP_ID
  const appSecret = process.env.TEAMS_BOT_APP_SECRET
  const tenantId = process.env.TEAMS_TENANT_ID
  if (!appId || !appSecret || !tenantId) return null
  try {
    // Get app-level Graph token
    const tokenRes = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: appId,
        client_secret: appSecret,
        scope: 'https://graph.microsoft.com/.default',
      }),
    })
    const tokenData = await tokenRes.json()
    const graphToken = tokenData.access_token as string
    if (!graphToken) return null

    // Look up user by AAD object ID
    const userRes = await fetch(
      `https://graph.microsoft.com/v1.0/users/${aadObjectId}?$select=mail,userPrincipalName`,
      { headers: { Authorization: `Bearer ${graphToken}` } },
    )
    if (!userRes.ok) return null
    const userData = await userRes.json()
    return (userData.mail ?? userData.userPrincipalName ?? null) as string | null
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

async function linkUser(
  supabase: ReturnType<typeof createServiceClient>,
  aadId: string,
  conversationId: string,
  serviceUrl: string,
): Promise<string | null> {
  // Try to resolve email from AAD object ID via Graph
  const email = await resolveAadEmail(aadId)
  if (!email) return null

  // Check if this email is a registered CRM user
  const { data } = await supabase.from('users').select('email').eq('email', email).single()
  if (!data) return null

  await supabase
    .from('users')
    .update({ teams_user_id: aadId, teams_conversation_id: conversationId, teams_service_url: serviceUrl })
    .eq('email', email)

  return email
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
  const conversationId = ((body.conversation as Record<string, string>)?.id) ?? ''
  const from = body.from as Record<string, string> | undefined
  const aadId = from?.aadObjectId ?? ''
  const supabase = createServiceClient()

  // ── conversationUpdate: user added/messaged the bot for the first time ───
  if (activityType === 'conversationUpdate') {
    const membersAdded = (body.membersAdded as Array<{ id?: string; aadObjectId?: string }>) ?? []
    const botAppId = process.env.TEAMS_BOT_APP_ID ?? ''
    for (const member of membersAdded) {
      if (member.id?.includes(botAppId)) continue
      const memberAadId = member.aadObjectId ?? ''
      if (!memberAadId || !conversationId || !serviceUrl) continue
      await linkUser(supabase, memberAadId, conversationId, serviceUrl)
    }
    return NextResponse.json({ ok: true })
  }

  // ── invoke: Adaptive Card button press ───────────────────────────────────
  if (activityType === 'invoke' && (body.value as Record<string, string>)?.action) {
    const { action, task_id } = body.value as { action: string; task_id: string }

    if (action === 'task_done' && task_id) {
      // Look up user by teams_user_id; auto-link if not yet linked
      let userRow = aadId
        ? (await supabase.from('users').select('email').eq('teams_user_id', aadId).single()).data
        : null

      if (!userRow && aadId && conversationId && serviceUrl) {
        const email = await linkUser(supabase, aadId, conversationId, serviceUrl)
        if (email) userRow = { email }
      }

      if (userRow?.email) {
        await supabase
          .from('tasks')
          .update({ status: 'done', completed_by: userRow.email, completed_at: new Date().toISOString() })
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

    // Ensure user is linked (auto-resolve via Graph)
    let userRow = aadId
      ? (await supabase.from('users').select('email').eq('teams_user_id', aadId).single()).data
      : null

    if (!userRow && aadId && conversationId && serviceUrl) {
      const email = await linkUser(supabase, aadId, conversationId, serviceUrl)
      if (email) {
        userRow = { email }
        // Silently linked — no need to notify user
      }
    }

    if (text.toLowerCase() === '/help' || text.toLowerCase() === 'help') {
      const msg = userRow
        ? `📋 myCRM Bot（已綁定：${userRow.email}）\n\n任務通知會自動傳送到這裡。點擊卡片上的「✅ 標記完成」即可完成任務。`
        : `📋 myCRM Bot\n\n⚠️ 無法自動綁定帳號，請聯絡管理員確認 Azure AD 應用程式已授予 User.ReadBasic.All 權限。`
      await sendToTeams(serviceUrl, conversationId, msg, body.id as string)
    }
  }

  return NextResponse.json({ ok: true })
}
