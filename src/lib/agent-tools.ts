import { createServiceClient } from '@/lib/supabase'

// 共用的 CRM agent 工具實作（唯一真相）。
// MCP server（src/app/api/mcp/route.ts，JSON-RPC + token 授權）與
// AI Chatbot（src/app/api/ai-chat，web session + Gemini function calling）都 import 這裡。
// 工具實作不做授權；授權（scope / acting user / 白名單）由各 caller 負責。

export type Scope =
  | 'read:contacts' | 'read:newsletter' | 'read:tags'
  | 'write:contacts' | 'write:notes' | 'write:newsletter'

export interface ToolDef {
  name: string
  description: string
  scope: Scope
  write: boolean
  inputSchema: Record<string, unknown>
}

// update_contact 可寫欄位白名單。其餘（email, email_status, email_opt_out, deleted_at,
// created_by, 名片圖, 系統欄）一律拒絕 — 見 docs/mcp-v2-plan.md。
export const CONTACT_WRITABLE_FIELDS = new Set([
  'name', 'name_en', 'name_local', 'company', 'company_en', 'company_local',
  'job_title', 'department', 'phone', 'mobile', 'second_email',
  'linkedin_url', 'facebook_url', 'address', 'address_en', 'country_code',
  'met_at', 'met_date', 'referred_by', 'notes', 'importance', 'language', 'hospital',
])

const EMAIL_RX = /^[A-Za-z0-9](?:[A-Za-z0-9._%+-]*[A-Za-z0-9])?@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/
export function isValidEmail(e: string): boolean {
  if (e.length > 254) return false
  if (e.includes('..')) return false
  return EMAIL_RX.test(e)
}

// update_contact patch 限制（DoS 硬化，security review v7.0.0）
const MAX_PATCH_FIELDS = 50
const MAX_FIELD_LEN = 20_000

export const TOOLS: ToolDef[] = [
  {
    name: 'search_contacts',
    scope: 'read:contacts', write: false,
    description: 'Search CRM contacts by name (any locale), email, or company. Case-insensitive substring. Max 100, default 20. Excludes soft-deleted.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'number', default: 20 } }, required: ['query'] },
  },
  {
    name: 'get_contact',
    scope: 'read:contacts', write: false,
    description: 'Full details for one contact by UUID + tags + 5 most recent interaction logs.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'list_newsletter_lists',
    scope: 'read:newsletter', write: false,
    description: 'All newsletter lists with member counts.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'search_subscribers_in_list',
    scope: 'read:newsletter', write: false,
    description: 'Subscribers in a list, optional substring filter. Max 500, default 50.',
    inputSchema: { type: 'object', properties: { list_id: { type: 'string' }, query: { type: 'string' }, limit: { type: 'number', default: 50 } }, required: ['list_id'] },
  },
  {
    name: 'list_tags',
    scope: 'read:tags', write: false,
    description: 'All CRM tags + email-blacklist flag.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'update_contact',
    scope: 'write:contacts', write: true,
    description: 'Update a contact. `patch` is an object of fields to change. Only descriptive/relationship fields are writable (name, company, job_title, phone, mobile, second_email, linkedin_url, facebook_url, address, country_code, met_at, met_date, referred_by, notes, importance, language, hospital, …). Forbidden: email, email_status, email_opt_out, deletion, system fields. Requires X-Acting-User.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, patch: { type: 'object' } }, required: ['id', 'patch'] },
  },
  {
    name: 'add_contact_note',
    scope: 'write:notes', write: true,
    description: 'Add a note to a contact (interaction_logs type=note). Requires X-Acting-User.',
    inputSchema: { type: 'object', properties: { contact_id: { type: 'string' }, body: { type: 'string' }, meeting_date: { type: 'string', description: 'optional YYYY-MM-DD' } }, required: ['contact_id', 'body'] },
  },
  {
    name: 'add_to_newsletter_list',
    scope: 'write:newsletter', write: true,
    description: 'Add an email to a newsletter list (find-or-create subscriber, then attach). Requires X-Acting-User.',
    inputSchema: { type: 'object', properties: { list_id: { type: 'string' }, email: { type: 'string' }, first_name: { type: 'string' }, last_name: { type: 'string' } }, required: ['list_id', 'email'] },
  },
  {
    name: 'tag_contact',
    scope: 'write:newsletter', write: true,
    description: "Add or remove a tag on a contact. action='add'|'remove'. Requires X-Acting-User.",
    inputSchema: { type: 'object', properties: { contact_id: { type: 'string' }, tag_id: { type: 'string' }, action: { type: 'string', enum: ['add', 'remove'] } }, required: ['contact_id', 'tag_id', 'action'] },
  },
]

export const TOOL_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]))

// ─────────────────────────── read tools ───────────────────────────

async function searchContacts(args: { query?: string; limit?: number }) {
  const q = (args.query ?? '').trim()
  if (!q) return []
  const limit = Math.min(Math.max(args.limit ?? 20, 1), 100)
  const supabase = createServiceClient()
  const safe = q.replace(/[\\%_,]/g, (c) => `\\${c}`)
  const { data, error } = await supabase
    .from('contacts')
    .select('id, name, name_en, name_local, email, company, job_title, country_code, last_activity_at')
    .or(`name.ilike.%${safe}%,name_en.ilike.%${safe}%,name_local.ilike.%${safe}%,email.ilike.%${safe}%,company.ilike.%${safe}%`)
    .is('deleted_at', null)
    .limit(limit)
  if (error) throw new Error(error.message)
  return data ?? []
}

async function getContact(args: { id?: string }) {
  if (!args.id) throw new Error('id required')
  const supabase = createServiceClient()
  const [{ data: contact, error: ce }, { data: tagRows }, { data: logs }] = await Promise.all([
    supabase.from('contacts').select('*').eq('id', args.id).is('deleted_at', null).maybeSingle(),
    supabase.from('contact_tags').select('tags(id, name, is_email_blacklist)').eq('contact_id', args.id),
    supabase.from('interaction_logs').select('id, type, content, email_subject, direction, meeting_date, created_at').eq('contact_id', args.id).order('created_at', { ascending: false }).limit(5),
  ])
  if (ce) throw new Error(ce.message)
  if (!contact) return null
  return {
    ...contact,
    tags: (tagRows ?? []).map((r) => (r as { tags: unknown }).tags).filter(Boolean),
    recent_interactions: logs ?? [],
  }
}

async function listNewsletterLists() {
  const supabase = createServiceClient()
  const { data: lists, error } = await supabase.from('newsletter_lists').select('id, key, name, description').order('name')
  if (error) throw new Error(error.message)
  return await Promise.all(
    (lists ?? []).map(async (l) => {
      const { count } = await supabase.from('newsletter_subscriber_lists').select('subscriber_id', { count: 'exact', head: true }).eq('list_id', l.id)
      return { ...l, member_count: count ?? 0 }
    }),
  )
}

async function searchSubscribersInList(args: { list_id?: string; query?: string; limit?: number }) {
  if (!args.list_id) throw new Error('list_id required')
  const limit = Math.min(Math.max(args.limit ?? 50, 1), 500)
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('newsletter_subscriber_lists')
    .select('added_at, newsletter_subscribers(id, email, first_name, last_name, contact_id, unsubscribed_at)')
    .eq('list_id', args.list_id)
    .order('added_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  type Row = { added_at: string; newsletter_subscribers: { id: string; email: string; first_name: string | null; last_name: string | null; contact_id: string | null; unsubscribed_at: string | null } | null }
  const flat = ((data as unknown as Row[]) ?? [])
    .map((r) => r.newsletter_subscribers ? { ...r.newsletter_subscribers, added_at: r.added_at } : null)
    .filter(Boolean) as Array<{ id: string; email: string; first_name: string | null; last_name: string | null; contact_id: string | null; unsubscribed_at: string | null; added_at: string }>
  const q = (args.query ?? '').trim().toLowerCase()
  if (!q) return flat
  return flat.filter((s) => s.email.toLowerCase().includes(q) || (s.first_name?.toLowerCase().includes(q) ?? false) || (s.last_name?.toLowerCase().includes(q) ?? false))
}

async function listTags() {
  const supabase = createServiceClient()
  const { data, error } = await supabase.from('tags').select('id, name, is_email_blacklist').order('name')
  if (error) throw new Error(error.message)
  return data ?? []
}

// ─────────────────────────── write tools ───────────────────────────
// All write tools receive actingAs (resolved user UUID); caller guarantees non-null.

async function updateContact(args: { id?: string; patch?: Record<string, unknown> }, actingAs: string) {
  if (!args.id) throw new Error('id required')
  const patch = args.patch ?? {}
  const keys = Object.keys(patch)
  if (keys.length > MAX_PATCH_FIELDS) throw new Error(`patch too large (${keys.length} fields, max ${MAX_PATCH_FIELDS})`)
  const clean: Record<string, unknown> = {}
  const rejected: string[] = []
  for (const [k, v] of Object.entries(patch)) {
    if (CONTACT_WRITABLE_FIELDS.has(k)) {
      if (typeof v === 'string' && v.length > MAX_FIELD_LEN) throw new Error(`field '${k}' too long (max ${MAX_FIELD_LEN} chars)`)
      clean[k] = v
    } else {
      rejected.push(k)
    }
  }
  if (Object.keys(clean).length === 0) {
    throw new Error(`No writable fields in patch. Rejected: ${rejected.join(', ') || '(empty)'}. Allowed: ${[...CONTACT_WRITABLE_FIELDS].join(', ')}`)
  }
  clean.last_updated_at = new Date().toISOString()
  clean.last_updated_by = actingAs
  clean.last_updated_via_mcp = true

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('contacts')
    .update(clean)
    .eq('id', args.id)
    .is('deleted_at', null)
    .select('id, name, email')
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('contact not found (or deleted)')
  return { updated: data, fields_changed: Object.keys(clean).filter((k) => !k.startsWith('last_updated')), rejected_fields: rejected }
}

async function addContactNote(args: { contact_id?: string; body?: string; meeting_date?: string }, actingAs: string) {
  if (!args.contact_id) throw new Error('contact_id required')
  if (!args.body?.trim()) throw new Error('body required')
  const supabase = createServiceClient()
  const { data: c } = await supabase.from('contacts').select('id').eq('id', args.contact_id).is('deleted_at', null).maybeSingle()
  if (!c) throw new Error('contact not found (or deleted)')
  const { data, error } = await supabase
    .from('interaction_logs')
    .insert({
      contact_id: args.contact_id,
      type: 'note',
      content: args.body.trim(),
      meeting_date: args.meeting_date && /^\d{4}-\d{2}-\d{2}$/.test(args.meeting_date) ? args.meeting_date : null,
      created_by: actingAs,
      via_mcp: true,
    })
    .select('id, created_at')
    .single()
  if (error) throw new Error(error.message)
  return { note_id: data.id, created_at: data.created_at }
}

async function addToNewsletterList(args: { list_id?: string; email?: string; first_name?: string; last_name?: string }, actingAs: string) {
  if (!args.list_id) throw new Error('list_id required')
  const email = (args.email ?? '').trim().toLowerCase()
  if (!isValidEmail(email)) throw new Error('valid email required')
  const supabase = createServiceClient()
  const { data: list } = await supabase.from('newsletter_lists').select('id').eq('id', args.list_id).maybeSingle()
  if (!list) throw new Error('newsletter list not found')
  const { data: existing } = await supabase.from('newsletter_subscribers').select('id').eq('email', email).maybeSingle()
  let subscriberId = existing?.id as string | undefined
  let created = false
  if (!subscriberId) {
    const { data: ins, error: insErr } = await supabase
      .from('newsletter_subscribers')
      .insert({ email, first_name: args.first_name?.trim() || null, last_name: args.last_name?.trim() || null, source: 'mcp', via_mcp: true, created_by: actingAs })
      .select('id')
      .single()
    if (insErr) throw new Error(insErr.message)
    subscriberId = ins.id
    created = true
  }
  const { error: linkErr } = await supabase
    .from('newsletter_subscriber_lists')
    .upsert({ subscriber_id: subscriberId, list_id: args.list_id, via_mcp: true, added_by: actingAs }, { onConflict: 'subscriber_id,list_id', ignoreDuplicates: true })
  if (linkErr) throw new Error(linkErr.message)
  return { subscriber_id: subscriberId, subscriber_created: created, attached_to_list: args.list_id }
}

async function tagContact(args: { contact_id?: string; tag_id?: string; action?: string }, actingAs: string) {
  if (!args.contact_id) throw new Error('contact_id required')
  if (!args.tag_id) throw new Error('tag_id required')
  if (args.action !== 'add' && args.action !== 'remove') throw new Error("action must be 'add' or 'remove'")
  const supabase = createServiceClient()
  if (args.action === 'add') {
    const { error } = await supabase
      .from('contact_tags')
      .upsert({ contact_id: args.contact_id, tag_id: args.tag_id, via_mcp: true, created_by: actingAs }, { onConflict: 'contact_id,tag_id', ignoreDuplicates: true })
    if (error) throw new Error(error.message)
    return { contact_id: args.contact_id, tag_id: args.tag_id, action: 'add' }
  } else {
    const { error } = await supabase.from('contact_tags').delete().eq('contact_id', args.contact_id).eq('tag_id', args.tag_id)
    if (error) throw new Error(error.message)
    return { contact_id: args.contact_id, tag_id: args.tag_id, action: 'remove' }
  }
}

export async function executeTool(name: string, args: Record<string, unknown>, actingAs: string | null) {
  switch (name) {
    case 'search_contacts': return await searchContacts(args)
    case 'get_contact': return await getContact(args)
    case 'list_newsletter_lists': return await listNewsletterLists()
    case 'search_subscribers_in_list': return await searchSubscribersInList(args)
    case 'list_tags': return await listTags()
    case 'update_contact': return await updateContact(args, actingAs!)
    case 'add_contact_note': return await addContactNote(args, actingAs!)
    case 'add_to_newsletter_list': return await addToNewsletterList(args, actingAs!)
    case 'tag_contact': return await tagContact(args, actingAs!)
    default: throw new Error(`Unknown tool: ${name}`)
  }
}
