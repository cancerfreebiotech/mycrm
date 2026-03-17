// Microsoft Teams Bot integration via Bot Framework
// Requires: TEAMS_BOT_APP_ID, TEAMS_BOT_APP_SECRET, TEAMS_TENANT_ID

const TEAMS_BOT_APP_ID = process.env.TEAMS_BOT_APP_ID
const TEAMS_BOT_APP_SECRET = process.env.TEAMS_BOT_APP_SECRET

// Get Bot Framework OAuth token
async function getBotToken(): Promise<string> {
  const res = await fetch('https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: TEAMS_BOT_APP_ID!,
      client_secret: TEAMS_BOT_APP_SECRET!,
      scope: 'https://api.botframework.com/.default',
    }),
  })
  const data = await res.json()
  return data.access_token as string
}

export interface TeamsTaskCard {
  title: string
  description?: string
  due_at?: string | null
  task_id: string
  app_url: string
  contact_name?: string
  contact_company?: string
}

// Send an Adaptive Card for a task notification to a Teams conversation
export async function sendTeamsTaskNotification(
  serviceUrl: string,
  conversationId: string,
  card: TeamsTaskCard,
): Promise<void> {
  if (!TEAMS_BOT_APP_ID || !TEAMS_BOT_APP_SECRET) {
    console.warn('[teams] TEAMS_BOT_APP_ID or TEAMS_BOT_APP_SECRET not set, skipping Teams notification')
    return
  }

  const token = await getBotToken()

  const adaptiveCard = {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          type: 'AdaptiveCard',
          version: '1.4',
          body: [
            {
              type: 'TextBlock',
              text: '📋 新任務指派',
              weight: 'Bolder',
              size: 'Medium',
            },
            {
              type: 'TextBlock',
              text: card.title,
              wrap: true,
            },
            ...(card.description ? [{
              type: 'TextBlock',
              text: card.description,
              wrap: true,
              color: 'Default',
              isSubtle: true,
            }] : []),
            ...(card.contact_name ? [{
              type: 'TextBlock',
              text: `🔗 ${card.contact_name}${card.contact_company ? `（${card.contact_company}）` : ''}`,
              isSubtle: true,
            }] : []),
            ...(card.due_at ? [{
              type: 'TextBlock',
              text: `⏰ 截止：${new Date(card.due_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}`,
              isSubtle: true,
            }] : []),
          ],
          actions: [
            {
              type: 'Action.OpenUrl',
              title: '前往任務管理',
              url: `${card.app_url}/tasks`,
            },
            {
              type: 'Action.Submit',
              title: '✅ 標記完成',
              data: { action: 'task_done', task_id: card.task_id },
            },
          ],
        },
      },
    ],
  }

  const endpoint = serviceUrl.endsWith('/')
    ? `${serviceUrl}v3/conversations/${conversationId}/activities`
    : `${serviceUrl}/v3/conversations/${conversationId}/activities`

  await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(adaptiveCard),
  })
}
