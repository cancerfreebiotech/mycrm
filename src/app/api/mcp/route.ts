import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { createHash } from 'node:crypto'

// Model Context Protocol (MCP) server for mycrm — v2.
// JSON-RPC 2.0 over HTTP POST.
//
// Auth (two layers):
//   1. Authorization: Bearer <token>
//      - matches a row in agent_tokens (sha256 hash) → scoped token (v2)
//      - else matches MCP_AGENT_TOKEN env → legacy read-only fallback (v1)
//   2. X-Acting-User: <email>  (who is making the call right now)
//      - resolved against public.users
//      - REQUIRED for write tools; optional for read tools
//
// Scopes (per tool, see TOOLS): read:contacts / read:newsletter / read:tags /
//   write:contacts / write:notes / write:newsletter
//
// Rate limit: 120 req/min per token (counts agent_actions).
//
// Every call logs to public.agent_actions (token_id + acting_as + tool + args).
//
// See docs/mcp-v2-plan.md.

interface JsonRpcRequest {
  jsonrpc?: string
  method?: string
  params?: unknown
  id?: number | string | null
}

const PROTOCOL_VERSION = '2024-11-05'
const RATE_LIMIT_PER_MIN = 120

// Fields update_contact is allowed to write. Everything else (email,
// email_status, email_opt_out, deleted_at, created_by, card images, system
// cols) is rejected — see docs/mcp-v2-plan.md.
const CONTACT_WRITABLE_FIELDS = new Set([
  'name', 'name_en', 'name_local', 'company', 'company_en', 'company_local',
  'job_title', 'department', 'phone', 'mobile', 'second_email',
  'linkedin_url', 'facebook_url', 'address', 'address_en', 'country_code',
  'met_at', 'met_date', 'referred_by', 'notes', 'importance', 'language', 'hospital',
])

const EMAIL_RX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/

type Scope = 'read:contacts' | 'read:newsletter' | 'read:tags' | 'write:contacts' | 'write:notes' | 'write:newsletter'

interface ToolDef {
  name: string
  description: string
  scope: Scope
  write: boolean
  inputSchema: Record<string, unknown>
}

const TOOLS: ToolDef[] = [
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

const TOOL_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]))

// ─────────────────────────── read tools ───────────────────────────

async function searchContacts(args: { query?: string; limit?: number }) {
  const q = (args.query ?? '').trim()
  if (!q) return []
  const limit = Math.min(Math.max(args.limit ?? 20, 1), 100)
  const supabase = createServiceClient()
  const safe = q.replace(/[\\%_]/g, (c) => `\\${c}`)
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
// All write tools receive actingAs (resolved user UUID, guaranteed non-null
// because the caller enforces X-Acting-User for write tools).

async function updateContact(args: { id?: string; patch?: Record<string, unknown> }, actingAs: string) {
  if (!args.id) throw new Error('id required')
  const patch = args.patch ?? {}
  const clean: Record<string, unknown> = {}
  const rejected: string[] = []
  for (const [k, v] of Object.entries(patch)) {
    if (CONTACT_WRITABLE_FIELDS.has(k)) clean[k] = v
    else rejected.push(k)
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
  // Confirm the contact exists & isn't deleted before logging against it
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

async function addToNewsletterList(args: { list_id?: string; email?: string; first_name?: string; last_name?: string }) {
  if (!args.list_id) throw new Error('list_id required')
  const email = (args.email ?? '').trim().toLowerCase()
  if (!EMAIL_RX.test(email)) throw new Error('valid email required')
  const supabase = createServiceClient()
  // list must exist
  const { data: list } = await supabase.from('newsletter_lists').select('id').eq('id', args.list_id).maybeSingle()
  if (!list) throw new Error('newsletter list not found')
  // find-or-create subscriber by email
  const { data: existing } = await supabase.from('newsletter_subscribers').select('id').eq('email', email).maybeSingle()
  let subscriberId = existing?.id as string | undefined
  let created = false
  if (!subscriberId) {
    const { data: ins, error: insErr } = await supabase
      .from('newsletter_subscribers')
      .insert({ email, first_name: args.first_name?.trim() || null, last_name: args.last_name?.trim() || null, source: 'mcp', via_mcp: true })
      .select('id')
      .single()
    if (insErr) throw new Error(insErr.message)
    subscriberId = ins.id
    created = true
  }
  // attach to list (ignore if already a member)
  const { error: linkErr } = await supabase
    .from('newsletter_subscriber_lists')
    .upsert({ subscriber_id: subscriberId, list_id: args.list_id, via_mcp: true }, { onConflict: 'subscriber_id,list_id', ignoreDuplicates: true })
  if (linkErr) throw new Error(linkErr.message)
  return { subscriber_id: subscriberId, subscriber_created: created, attached_to_list: args.list_id }
}

async function tagContact(args: { contact_id?: string; tag_id?: string; action?: string }) {
  if (!args.contact_id) throw new Error('contact_id required')
  if (!args.tag_id) throw new Error('tag_id required')
  if (args.action !== 'add' && args.action !== 'remove') throw new Error("action must be 'add' or 'remove'")
  const supabase = createServiceClient()
  if (args.action === 'add') {
    const { error } = await supabase
      .from('contact_tags')
      .upsert({ contact_id: args.contact_id, tag_id: args.tag_id, via_mcp: true }, { onConflict: 'contact_id,tag_id', ignoreDuplicates: true })
    if (error) throw new Error(error.message)
    return { contact_id: args.contact_id, tag_id: args.tag_id, action: 'add' }
  } else {
    const { error } = await supabase.from('contact_tags').delete().eq('contact_id', args.contact_id).eq('tag_id', args.tag_id)
    if (error) throw new Error(error.message)
    return { contact_id: args.contact_id, tag_id: args.tag_id, action: 'remove' }
  }
}

async function executeTool(name: string, args: Record<string, unknown>, actingAs: string | null) {
  switch (name) {
    case 'search_contacts': return await searchContacts(args)
    case 'get_contact': return await getContact(args)
    case 'list_newsletter_lists': return await listNewsletterLists()
    case 'search_subscribers_in_list': return await searchSubscribersInList(args)
    case 'list_tags': return await listTags()
    case 'update_contact': return await updateContact(args, actingAs!)
    case 'add_contact_note': return await addContactNote(args, actingAs!)
    case 'add_to_newsletter_list': return await addToNewsletterList(args)
    case 'tag_contact': return await tagContact(args)
    default: throw new Error(`Unknown tool: ${name}`)
  }
}

// ─────────────────────────── auth + infra ───────────────────────────

interface TokenContext {
  tokenId: string | null      // null = legacy env token
  scopes: Scope[]
  legacy: boolean
}

const LEGACY_SCOPES: Scope[] = ['read:contacts', 'read:newsletter', 'read:tags']

async function resolveToken(bearer: string): Promise<TokenContext | null> {
  const envToken = process.env.MCP_AGENT_TOKEN
  const supabase = createServiceClient()
  const hash = createHash('sha256').update(bearer).digest('hex')
  const { data: row } = await supabase
    .from('agent_tokens')
    .select('id, scopes, disabled_at, expires_at')
    .eq('token_hash', hash)
    .maybeSingle()
  if (row) {
    if (row.disabled_at) return null
    if (row.expires_at && new Date(row.expires_at as string).getTime() < Date.now()) return null
    return { tokenId: row.id as string, scopes: (row.scopes as Scope[]) ?? [], legacy: false }
  }
  // Legacy env fallback — read-only
  if (envToken && bearer === envToken) {
    return { tokenId: null, scopes: LEGACY_SCOPES, legacy: true }
  }
  return null
}

async function resolveActingUser(email: string | null): Promise<string | null> {
  if (!email) return null
  const supabase = createServiceClient()
  const { data } = await supabase.from('users').select('id').ilike('email', email.trim()).maybeSingle()
  return (data?.id as string) ?? null
}

async function checkRateLimit(tokenId: string): Promise<boolean> {
  const supabase = createServiceClient()
  const since = new Date(Date.now() - 60_000).toISOString()
  const { count } = await supabase
    .from('agent_actions')
    .select('id', { count: 'exact', head: true })
    .eq('token_id', tokenId)
    .gte('created_at', since)
  return (count ?? 0) < RATE_LIMIT_PER_MIN
}

async function logAction(toolName: string, args: unknown, succeeded: boolean, errMsg: string | null, tokenId: string | null, actingAs: string | null) {
  try {
    const supabase = createServiceClient()
    await supabase.from('agent_actions').insert({
      tool_name: toolName,
      arguments: args ?? null,
      result_summary: succeeded ? 'ok' : null,
      succeeded,
      error_message: errMsg,
      token_id: tokenId,
      acting_as: actingAs,
    })
  } catch { /* never let logging break the call */ }
}

async function touchToken(tokenId: string | null) {
  if (!tokenId) return
  try {
    const supabase = createServiceClient()
    await supabase.from('agent_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', tokenId)
  } catch { /* ignore */ }
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? ''
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!bearer) {
    return NextResponse.json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Unauthorized — missing bearer token' } }, { status: 401 })
  }
  const ctx = await resolveToken(bearer)
  if (!ctx) {
    return NextResponse.json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Unauthorized — invalid/disabled/expired token' } }, { status: 401 })
  }

  let msg: JsonRpcRequest
  try {
    msg = await req.json() as JsonRpcRequest
  } catch {
    return NextResponse.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, { status: 400 })
  }

  const actingAs = await resolveActingUser(req.headers.get('x-acting-user'))

  let result: unknown = null
  let error: { code: number; message: string } | null = null

  try {
    switch (msg.method) {
      case 'initialize':
        result = { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: 'mycrm-mcp', version: '2.0.0' } }
        break
      case 'notifications/initialized':
        return new NextResponse(null, { status: 202 })
      case 'tools/list':
        // Only advertise tools this token has scope for
        result = { tools: TOOLS.filter((t) => ctx.scopes.includes(t.scope)).map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) }
        break
      case 'tools/call': {
        const params = (msg.params ?? {}) as { name?: string; arguments?: Record<string, unknown> }
        const toolName = params.name
        const toolArgs = params.arguments ?? {}
        if (!toolName) throw new Error('tool name required')
        const tool = TOOL_BY_NAME.get(toolName)
        if (!tool) throw new Error(`Unknown tool: ${toolName}`)
        // scope check
        if (!ctx.scopes.includes(tool.scope)) {
          throw new Error(`Permission denied — this token lacks scope '${tool.scope}' required by ${toolName}`)
        }
        // write tools need an acting user
        if (tool.write && !actingAs) {
          throw new Error(`X-Acting-User header required for write tool '${toolName}' (must be a known mycrm user email)`)
        }
        // rate limit (real tokens only)
        if (ctx.tokenId) {
          const ok = await checkRateLimit(ctx.tokenId)
          if (!ok) {
            error = { code: -32002, message: `Rate limit exceeded (${RATE_LIMIT_PER_MIN}/min). Retry shortly.` }
            await logAction(toolName, toolArgs, false, error.message, ctx.tokenId, actingAs)
            break
          }
        }
        const out = await executeTool(toolName, toolArgs, actingAs)
        await touchToken(ctx.tokenId)
        await logAction(toolName, toolArgs, true, null, ctx.tokenId, actingAs)
        result = { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] }
        break
      }
      case 'ping':
        result = {}
        break
      default:
        error = { code: -32601, message: `Method not found: ${msg.method ?? '<missing>'}` }
    }
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e)
    error = { code: -32000, message: errMsg }
    if (msg.method === 'tools/call') {
      const params = (msg.params ?? {}) as { name?: string; arguments?: Record<string, unknown> }
      await logAction(params.name ?? 'unknown', params.arguments ?? {}, false, errMsg, ctx.tokenId, actingAs)
    }
  }

  if (msg.id === undefined || msg.id === null) {
    return new NextResponse(null, { status: 202 })
  }
  return NextResponse.json(error ? { jsonrpc: '2.0', id: msg.id, error } : { jsonrpc: '2.0', id: msg.id, result })
}

export async function GET() {
  return NextResponse.json({ error: 'GET (SSE) not implemented. Use POST for tool calls.' }, { status: 405 })
}

export const maxDuration = 60
