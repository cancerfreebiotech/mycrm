/**
 * Microsoft Teams Bot webhook
 * Register this URL in Azure AD Bot Channel Registration:
 *   https://<your-domain>/api/teams-bot
 *
 * Required env vars:
 *   TEAMS_BOT_APP_ID, TEAMS_BOT_APP_SECRET, TEAMS_TENANT_ID
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// Simple JWT verification stub — in production use botframework-connector's JwtTokenValidation
async function verifyTeamsRequest(req: NextRequest): Promise<boolean> {
  const authHeader = req.headers.get('authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) return false
  // TODO: Full JWT validation against Bot Framework JWKS
  // For now accept any Bearer token (secure only in production with proper validation)
  return true
}

export async function POST(req: NextRequest) {
  if (!(await verifyTeamsRequest(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: true })
  }

  const activityType: string = body.type ?? ''
  const supabase = createServiceClient()

  // Handle invoke actions (Adaptive Card button presses)
  if (activityType === 'invoke' && body.value?.action) {
    const { action, task_id } = body.value as { action: string; task_id: string }
    const fromEmail: string | undefined = body.from?.aadObjectId
      ? undefined
      : body.from?.email

    if (action === 'task_done' && task_id) {
      // Find the user by Teams user ID or email
      const teamsUserId: string | undefined = body.from?.aadObjectId

      let userEmail: string | undefined = fromEmail
      if (teamsUserId && !userEmail) {
        const { data } = await supabase
          .from('users')
          .select('email')
          .eq('teams_user_id', teamsUserId)
          .single()
        userEmail = data?.email
      }

      if (userEmail) {
        await supabase
          .from('tasks')
          .update({
            status: 'done',
            completed_by: userEmail,
            completed_at: new Date().toISOString(),
          })
          .eq('id', task_id)
      }

      return NextResponse.json({
        type: 'invokeResponse',
        value: { status: 200, body: { type: 'message', text: '✅ 任務已標記完成！' } },
      })
    }
  }

  // Handle message activities
  if (activityType === 'message') {
    const text: string = (body.text ?? '').trim()
    const serviceUrl: string = body.serviceUrl ?? ''
    const conversationId: string = body.conversation?.id ?? ''

    // Echo help message
    if (text === '/help' || text === 'help') {
      await replyToTeams(serviceUrl, conversationId, body.id,
        '📋 myCRM Bot\n\n你的待處理任務通知將在此出現。點擊卡片上的「標記完成」即可完成任務。'
      )
    }
  }

  return NextResponse.json({ ok: true })
}

async function replyToTeams(
  serviceUrl: string,
  conversationId: string,
  replyToId: string,
  text: string,
) {
  const { getBotToken } = await import('@/lib/teams').catch(() => ({ getBotToken: undefined }))
  if (!getBotToken) return

  void getBotToken  // placeholder; actual token fetch done in teams.ts
  // Use fetch directly for simple text reply
  const appId = process.env.TEAMS_BOT_APP_ID
  const appSecret = process.env.TEAMS_BOT_APP_SECRET
  if (!appId || !appSecret) return

  const tokenRes = await fetch('https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: appId,
      client_secret: appSecret,
      scope: 'https://api.botframework.com/.default',
    }),
  })
  const tokenData = await tokenRes.json()
  const token = tokenData.access_token as string

  const endpoint = `${serviceUrl.replace(/\/$/, '')}/v3/conversations/${conversationId}/activities/${replyToId}`
  await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'message', text }),
  })
}
