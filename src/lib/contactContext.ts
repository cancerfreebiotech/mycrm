import { createServiceClient } from '@/lib/supabase'

type ServiceClient = ReturnType<typeof createServiceClient>

// Build a context paragraph from a contact's profile, tags, recent interactions and
// latest completed social briefing. Prepended to the AI email description so the draft
// is grounded in the CRM relationship. Returns null if the contact can't be found.
// Shared by /api/ai-email and the summarize_relationship agent tool (agent-tools.ts).
export async function buildContactContext(service: ServiceClient, contactId: string): Promise<string | null> {
  const [{ data: contact }, { data: logs }, { data: briefing }] = await Promise.all([
    service
      .from('contacts')
      .select('name, name_en, company, job_title, notes, contact_tags(tags(name))')
      .eq('id', contactId)
      .is('deleted_at', null)
      .maybeSingle(),
    service
      .from('interaction_logs')
      .select('content, type, created_at')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false })
      .limit(5),
    service
      .from('contact_briefings')
      .select('result_md')
      .eq('contact_id', contactId)
      .eq('status', 'done')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (!contact) return null

  const lines: string[] = ['以下是這位聯絡人的背景資訊，請作為撰寫郵件的脈絡參考（勿直接複製，只作為理解對象之用）：']
  const name = (contact.name as string | null) || (contact.name_en as string | null)
  if (name) lines.push(`姓名：${name}`)
  if (contact.company) lines.push(`公司：${contact.company}`)
  if (contact.job_title) lines.push(`職稱：${contact.job_title}`)

  const tagRows = (contact.contact_tags ?? []) as unknown as Array<{ tags: { name: string } | null }>
  const tags = tagRows.map((r) => r.tags?.name).filter(Boolean)
  if (tags.length) lines.push(`標籤：${tags.join('、')}`)

  if (contact.notes) lines.push(`備註：${contact.notes}`)

  const logRows = (logs ?? []) as Array<{ content: string | null }>
  const recent = logRows.map((l) => l.content?.trim()).filter(Boolean)
  if (recent.length) {
    lines.push('最近互動紀錄：')
    for (const c of recent) lines.push(`- ${c}`)
  }

  const briefingMd = briefing?.result_md as string | null | undefined
  if (briefingMd) lines.push(`會議前情報摘要：\n${briefingMd.slice(0, 2000)}`)

  return lines.join('\n')
}
