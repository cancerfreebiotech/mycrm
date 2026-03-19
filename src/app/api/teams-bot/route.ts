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
import { parseMeetingCommand } from '@/lib/gemini'
import { createCalendarEvent } from '@/lib/graph'
import { sendTeamsMeetingConfirmCard } from '@/lib/teams'

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
  const tenantId = process.env.TEAMS_TENANT_ID ?? 'botframework.com'
  if (!appId || !appSecret) {
    console.error('[teams-bot] getBotToken: TEAMS_BOT_APP_ID or TEAMS_BOT_APP_SECRET not set')
    return null
  }
  try {
    const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
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
    if (!data.access_token) console.error('[teams-bot] getBotToken failed:', data.error, data.error_description)
    return (data.access_token as string) ?? null
  } catch (e) {
    console.error('[teams-bot] getBotToken exception:', e)
    return null
  }
}

/** Resolve a Teams AAD Object ID to email via Microsoft Graph (app-level token).
 *  Requires User.ReadBasic.All application permission on the Azure AD app. */
async function resolveAadEmail(aadObjectId: string): Promise<string | null> {
  const appId = process.env.TEAMS_BOT_APP_ID
  const appSecret = process.env.TEAMS_BOT_APP_SECRET
  const tenantId = process.env.TEAMS_TENANT_ID
  if (!appId || !appSecret || !tenantId) {
    console.error('[teams-bot] resolveAadEmail: missing env vars', { appId: !!appId, appSecret: !!appSecret, tenantId: !!tenantId })
    return null
  }
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
    if (!userRes.ok) {
      const errBody = await userRes.text()
      console.error('[teams-bot] resolveAadEmail Graph error:', userRes.status, errBody)
      return null
    }
    const userData = await userRes.json()
    console.log('[teams-bot] resolveAadEmail result:', userData.mail ?? userData.userPrincipalName)
    return (userData.mail ?? userData.userPrincipalName ?? null) as string | null
  } catch (e) {
    console.error('[teams-bot] resolveAadEmail exception:', e)
    return null
  }
}

async function sendToTeams(serviceUrl: string, conversationId: string, text: string, replyToId?: string) {
  const token = await getBotToken()
  if (!token) {
    console.error('[teams-bot] sendToTeams: no token, skipping reply')
    return
  }
  const base = serviceUrl.replace(/\/$/, '')
  const url = replyToId
    ? `${base}/v3/conversations/${conversationId}/activities/${replyToId}`
    : `${base}/v3/conversations/${conversationId}/activities`
  console.log('[teams-bot] sendToTeams →', url)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'message', text }),
    })
    if (!res.ok) {
      const body = await res.text()
      console.error('[teams-bot] sendToTeams failed:', res.status, body)
    } else {
      console.log('[teams-bot] sendToTeams ok:', res.status)
    }
  } catch (e) {
    console.error('[teams-bot] sendToTeams exception:', e)
  }
}

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

async function linkUser(
  supabase: ReturnType<typeof createServiceClient>,
  aadId: string,
  conversationId: string,
  serviceUrl: string,
): Promise<string | null> {
  // Try to resolve email from AAD object ID via Graph
  const email = await resolveAadEmail(aadId)
  if (!email) return null

  // Check if this email is a registered CRM user (case-insensitive)
  const emailLower = email.toLowerCase()
  console.log('[teams-bot] linkUser resolved email:', emailLower)
  const { data } = await supabase.from('users').select('email').ilike('email', emailLower).single()
  if (!data) {
    console.error('[teams-bot] linkUser: email not found in users table:', emailLower)
    return null
  }

  await supabase
    .from('users')
    .update({ teams_user_id: aadId, teams_conversation_id: conversationId, teams_service_url: serviceUrl })
    .eq('email', data.email)

  console.log('[teams-bot] linkUser: linked', data.email, '←', aadId)
  return data.email
}

export async function POST(req: NextRequest) {
  const authOk = await verifyTeamsRequest(req)
  console.log('[teams-bot] auth ok:', authOk)
  if (!authOk) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: true })
  }

  console.log('[teams-bot] RAW body:', JSON.stringify(body))

  const activityType = (body.type as string) ?? ''
  const activityName = (body.name as string) ?? ''
  const serviceUrl = (body.serviceUrl as string) ?? ''
  const conversationId = ((body.conversation as Record<string, string>)?.id) ?? ''
  const from = body.from as Record<string, string> | undefined
  const aadId = from?.aadObjectId ?? ''
  const supabase = createServiceClient()

  console.log('[teams-bot]', { activityType, activityName, aadId: aadId || '(none)', conversationId: conversationId.slice(0, 20) })

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
  if (activityType === 'invoke') {
    const value = body.value as Record<string, unknown> | undefined
    console.log('[teams-bot] invoke value:', JSON.stringify(value))

    // Format 1: Action.Submit data directly → value = { action: "task_done", task_id: "..." }
    // Format 2: adaptiveCard/action invoke → value = { action: { type, data: { action, task_id } } }
    // Format 3: adaptiveCard/action data at root → value = { data: { action, task_id } }
    let action: string | undefined
    let task_id: string | undefined
    if (typeof value?.action === 'string') {
      action = value.action
      task_id = value.task_id as string | undefined
    } else if (value?.action && typeof value.action === 'object') {
      const data = (value.action as Record<string, unknown>)?.data as Record<string, string> | undefined
      action = data?.action
      task_id = data?.task_id
    } else if (value?.data && typeof value.data === 'object') {
      const data = value.data as Record<string, string>
      action = data?.action
      task_id = data?.task_id
    } else if (typeof value?.action === 'undefined' && typeof value?.task_id === 'string') {
      // Flat format: { action: undefined, task_id: "..." } shouldn't happen, but handle direct data
      task_id = value.task_id as string
    }
    console.log('[teams-bot] invoke parsed: action=%s task_id=%s', action ?? '(none)', task_id ?? '(none)')

    if (action === 'task_done' && task_id) {
      // 1. Look up by aadObjectId
      let userRow = aadId
        ? (await supabase.from('users').select('email').eq('teams_user_id', aadId).single()).data
        : null

      // 2. Fallback: look up by conversationId (aadObjectId may be absent in invoke activities)
      if (!userRow && conversationId) {
        userRow = (await supabase.from('users').select('email').eq('teams_conversation_id', conversationId).single()).data
        if (userRow) console.log('[teams-bot] task_done: found user via conversationId:', userRow.email)
      }

      console.log('[teams-bot] task_done: aadId=%s userRow=%s task_id=%s', aadId, userRow?.email ?? 'null', task_id)

      // 3. Last resort: try auto-link via Graph
      if (!userRow && aadId && conversationId && serviceUrl) {
        const email = await linkUser(supabase, aadId, conversationId, serviceUrl)
        if (email) userRow = { email }
        console.log('[teams-bot] task_done: auto-linked email=%s', email ?? 'null')
      }

      if (userRow?.email) {
        const { data: taskRow, error: updateErr } = await supabase
          .from('tasks')
          .update({ status: 'done', completed_by: userRow.email, completed_at: new Date().toISOString() })
          .eq('id', task_id)
          .select('title')
          .single()
        if (updateErr) {
          console.error('[teams-bot] task_done update error:', updateErr.message)
          if (conversationId && serviceUrl) {
            await sendToTeams(serviceUrl, conversationId, '❌ 更新失敗，請至 Web 介面手動標記完成。')
          }
          return NextResponse.json({ type: 'invokeResponse', value: { status: 200 } })
        }
        console.log('[teams-bot] task_done: updated task %s as done by %s', task_id, userRow.email)
        // Send visible confirmation message (invokeResponse alone is not visible in Teams)
        if (conversationId && serviceUrl) {
          const title = taskRow?.title ?? ''
          await sendToTeams(serviceUrl, conversationId, `✅ 任務已標記完成：${title}`)
        }
      } else {
        console.error('[teams-bot] task_done: could not identify user, aadId=%s', aadId)
        if (conversationId && serviceUrl) {
          await sendToTeams(serviceUrl, conversationId, '⚠️ 無法識別帳號，請至 Web 介面手動標記完成。')
        }
        return NextResponse.json({ type: 'invokeResponse', value: { status: 200 } })
      }

      return NextResponse.json({ type: 'invokeResponse', value: { status: 200 } })
    }

    if (action === 'meet_confirm' || action === 'meet_cancel') {
      const draft_id = (value as Record<string, unknown>)?.draft_id as string
        ?? (value as Record<string, Record<string, string>>)?.data?.draft_id
        ?? (value as Record<string, Record<string, Record<string, string>>>)?.action?.data?.draft_id

      let userRow = aadId
        ? (await supabase.from('users').select('email, provider_token').eq('teams_user_id', aadId).single()).data
        : null
      if (!userRow && conversationId) {
        userRow = (await supabase.from('users').select('email, provider_token').eq('teams_conversation_id', conversationId).single()).data
      }

      if (action === 'meet_cancel') {
        if (draft_id) await supabase.from('meeting_drafts').delete().eq('id', draft_id)
        if (conversationId && serviceUrl) await sendToTeams(serviceUrl, conversationId, '已取消，行程未建立。')
        return NextResponse.json({ type: 'invokeResponse', value: { status: 200 } })
      }

      // meet_confirm
      if (!draft_id) return NextResponse.json({ type: 'invokeResponse', value: { status: 200 } })
      const { data: draft } = await supabase.from('meeting_drafts').select('*').eq('id', draft_id).single()
      if (!draft) {
        if (conversationId && serviceUrl) await sendToTeams(serviceUrl, conversationId, '⚠️ 行程草稿已過期。')
        return NextResponse.json({ type: 'invokeResponse', value: { status: 200 } })
      }
      if (!userRow?.provider_token) {
        if (conversationId && serviceUrl) await sendToTeams(serviceUrl, conversationId, '⚠️ 無法建立行程：請至 myCRM 網頁重新登入以取得 Microsoft 存取權限。')
        return NextResponse.json({ type: 'invokeResponse', value: { status: 200 } })
      }
      try {
        const endIso = new Date(new Date(draft.start_at).getTime() + draft.duration_minutes * 60000).toISOString()
        const attendeeEmails: string[] = []
        if (draft.attendee_ids?.length > 0) {
          const { data: members } = await supabase.from('users').select('email').in('id', draft.attendee_ids)
          attendeeEmails.push(...(members ?? []).map((m: { email: string }) => m.email))
        }
        const webLink = await createCalendarEvent({
          accessToken: userRow.provider_token,
          title: draft.title,
          startIso: draft.start_at,
          endIso,
          attendeeEmails,
          location: draft.location ?? undefined,
        })
        await supabase.from('meeting_drafts').delete().eq('id', draft_id)
        const timeLabel = formatTaipeiRange(draft.start_at, draft.duration_minutes)
        const msg = `✅ 行程已建立！\n📅 ${draft.title}\n🕐 ${timeLabel}${webLink ? `\n🔗 ${webLink}` : ''}`
        if (conversationId && serviceUrl) await sendToTeams(serviceUrl, conversationId, msg)
      } catch (e) {
        if (conversationId && serviceUrl) await sendToTeams(serviceUrl, conversationId, `❌ 建立失敗：${e instanceof Error ? e.message : '請稍後再試'}`)
      }
      return NextResponse.json({ type: 'invokeResponse', value: { status: 200 } })
    }

    // Catch-all: always return invokeResponse for invoke activities
    return NextResponse.json({ type: 'invokeResponse', value: { status: 200 } })
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

    const meetMatch = text.match(/^\/(?:meet|m)\s*([\s\S]*)$/i)
    if (meetMatch) {
      const meetText = meetMatch[1].trim()
      if (!meetText) {
        await sendToTeams(serviceUrl, conversationId, '請提供會議資訊，例如：\n/meet 3/25 下午1點 參訪 九州大學實驗室\n/meet 明天下午3點 和 Luna 開產品會議', body.id as string)
      } else if (!userRow?.email) {
        await sendToTeams(serviceUrl, conversationId, '⚠️ 帳號未綁定，無法建立行程。', body.id as string)
      } else {
        await sendToTeams(serviceUrl, conversationId, '⏳ AI 解析中...', body.id as string)
        const { data: userData } = await supabase.from('users').select('id, ai_model_id').eq('email', userRow.email).single()
        let parsed
        try {
          parsed = await parseMeetingCommand(meetText, new Date().toISOString(), userData?.ai_model_id ?? null)
        } catch {
          await sendToTeams(serviceUrl, conversationId, '❌ AI 解析失敗，請確認格式後再試。')
          return NextResponse.json({ ok: true })
        }
        const attendeeEmails: string[] = []
        const attendeeNames: string[] = []
        const attendeeIds: string[] = []
        if (parsed.attendees.length > 0) {
          const { data: members } = await supabase.from('users').select('id, email, display_name')
            .or(parsed.attendees.map((a: string) => `display_name.ilike.%${a}%,email.ilike.%${a}%`).join(','))
          for (const m of members ?? []) {
            if (m.email !== userRow.email) {
              attendeeEmails.push(m.email)
              attendeeNames.push(m.display_name || m.email)
              attendeeIds.push(m.id)
            }
          }
        }
        const { data: draft } = await supabase.from('meeting_drafts').insert({
          created_by: userData?.id,
          title: parsed.title,
          start_at: parsed.start_iso,
          duration_minutes: parsed.duration_minutes,
          attendee_ids: attendeeIds,
          location: parsed.location,
          raw_text: meetText,
        }).select('id').single()

        if (draft) {
          const timeLabel = formatTaipeiRange(parsed.start_iso, parsed.duration_minutes)
          await sendTeamsMeetingConfirmCard(serviceUrl, conversationId, {
            draft_id: draft.id,
            title: parsed.title,
            time_label: timeLabel,
            duration_label: durationLabel(parsed.duration_minutes),
            attendees_label: ['你', ...attendeeNames].join('、'),
            location: parsed.location,
          })
        }
      }
      return NextResponse.json({ ok: true })
    }

    if (text.toLowerCase() === '/help' || text.toLowerCase() === 'help') {
      const msg = userRow
        ? `📋 myCRM Bot（已綁定：${userRow.email}）\n\n任務通知會自動傳送到這裡。點擊卡片上的「✅ 標記完成」即可完成任務。\n\n指令：/help、/AI、/meet [描述]、/m [描述]`
        : `📋 myCRM Bot\n\n⚠️ 無法自動綁定帳號，請聯絡管理員確認 Azure AD 應用程式已授予 User.ReadBasic.All 權限。`
      await sendToTeams(serviceUrl, conversationId, msg, body.id as string)
    } else if (text.toLowerCase() === '/ai') {
      if (!userRow?.email) {
        await sendToTeams(serviceUrl, conversationId, '⚠️ 帳號未綁定，無法查詢 AI 模型。', body.id as string)
      } else {
        const { data: userData } = await supabase
          .from('users')
          .select('ai_model_id')
          .eq('email', userRow.email)
          .single()
        if (!userData?.ai_model_id) {
          await sendToTeams(serviceUrl, conversationId, '🤖 目前使用預設模型：gemini-2.5-flash', body.id as string)
        } else {
          const { data: model } = await supabase
            .from('ai_models')
            .select('display_name, model_id')
            .eq('id', userData.ai_model_id)
            .single()
          const msg = model
            ? `🤖 目前使用的 AI 模型：${model.display_name}（${model.model_id}）`
            : '🤖 目前使用預設模型：gemini-2.5-flash'
          await sendToTeams(serviceUrl, conversationId, msg, body.id as string)
        }
      }
    }
  }

  return NextResponse.json({ ok: true })
}
