import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// Model Context Protocol (MCP) server for mycrm.
// JSON-RPC 2.0 over HTTP POST.
//
// Auth: Bearer token from MCP_AGENT_TOKEN env var.
// Every successful or failed tool call logs to public.agent_actions.
//
// Read-only tools (v1):
//   1. search_contacts
//   2. get_contact
//   3. list_newsletter_lists
//   4. search_subscribers_in_list
//   5. list_tags
//
// Connect from a Claude agent / client: POST to https://crm.cancerfree.io/api/mcp
// with Authorization: Bearer <MCP_AGENT_TOKEN>.

interface JsonRpcRequest {
  jsonrpc?: string
  method?: string
  params?: unknown
  id?: number | string | null
}

const PROTOCOL_VERSION = '2024-11-05'

const TOOLS = [
  {
    name: 'search_contacts',
    description: 'Search CRM contacts by name (any locale), email, or company. Case-insensitive substring match. Returns up to `limit` matches, default 20, max 100. Excludes soft-deleted contacts.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query — matched against name / name_en / name_local / email / company' },
        limit: { type: 'number', description: 'Max results (1-100)', default: 20 },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_contact',
    description: 'Get full details for a single contact by UUID. Includes tags and the 5 most recent interaction logs (notes, emails, meetings).',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Contact UUID' } },
      required: ['id'],
    },
  },
  {
    name: 'list_newsletter_lists',
    description: 'List all newsletter lists with their member counts.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'search_subscribers_in_list',
    description: 'List subscribers in a given newsletter list. Optionally filter by query (matched against subscriber email / first_name / last_name). Returns up to `limit` rows (default 50, max 500).',
    inputSchema: {
      type: 'object',
      properties: {
        list_id: { type: 'string', description: 'Newsletter list UUID' },
        query: { type: 'string', description: 'Optional substring filter' },
        limit: { type: 'number', default: 50 },
      },
      required: ['list_id'],
    },
  },
  {
    name: 'list_tags',
    description: 'List all CRM tags (including which ones are flagged as email blacklist).',
    inputSchema: { type: 'object', properties: {} },
  },
]

async function searchContacts(args: { query?: string; limit?: number }) {
  const q = (args.query ?? '').trim()
  if (!q) return []
  const limit = Math.min(Math.max(args.limit ?? 20, 1), 100)
  const supabase = createServiceClient()
  // Escape `%` and `_` so user input doesn't accidentally match wildcards.
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
    supabase
      .from('contacts')
      .select('*')
      .eq('id', args.id)
      .is('deleted_at', null)
      .maybeSingle(),
    supabase
      .from('contact_tags')
      .select('tags(id, name, is_email_blacklist)')
      .eq('contact_id', args.id),
    supabase
      .from('interaction_logs')
      .select('id, type, content, email_subject, direction, meeting_date, created_at')
      .eq('contact_id', args.id)
      .order('created_at', { ascending: false })
      .limit(5),
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
  const { data: lists, error } = await supabase
    .from('newsletter_lists')
    .select('id, key, name, description')
    .order('name')
  if (error) throw new Error(error.message)
  const withCounts = await Promise.all(
    (lists ?? []).map(async (l) => {
      const { count } = await supabase
        .from('newsletter_subscriber_lists')
        .select('subscriber_id', { count: 'exact', head: true })
        .eq('list_id', l.id)
      return { ...l, member_count: count ?? 0 }
    }),
  )
  return withCounts
}

async function searchSubscribersInList(args: { list_id?: string; query?: string; limit?: number }) {
  if (!args.list_id) throw new Error('list_id required')
  const limit = Math.min(Math.max(args.limit ?? 50, 1), 500)
  const supabase = createServiceClient()
  let query = supabase
    .from('newsletter_subscriber_lists')
    .select('added_at, newsletter_subscribers(id, email, first_name, last_name, contact_id, unsubscribed_at)')
    .eq('list_id', args.list_id)
    .order('added_at', { ascending: false })
    .limit(limit)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  type Row = { added_at: string; newsletter_subscribers: { id: string; email: string; first_name: string | null; last_name: string | null; contact_id: string | null; unsubscribed_at: string | null } | null }
  const rows = (data as unknown as Row[]) ?? []
  const flat = rows
    .map((r) => r.newsletter_subscribers ? { ...r.newsletter_subscribers, added_at: r.added_at } : null)
    .filter(Boolean) as Array<{ id: string; email: string; first_name: string | null; last_name: string | null; contact_id: string | null; unsubscribed_at: string | null; added_at: string }>
  const q = (args.query ?? '').trim().toLowerCase()
  if (!q) return flat
  return flat.filter((s) =>
    s.email.toLowerCase().includes(q) ||
    (s.first_name?.toLowerCase().includes(q) ?? false) ||
    (s.last_name?.toLowerCase().includes(q) ?? false),
  )
}

async function listTags() {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('tags')
    .select('id, name, is_email_blacklist')
    .order('name')
  if (error) throw new Error(error.message)
  return data ?? []
}

async function executeTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case 'search_contacts': return await searchContacts(args as { query?: string; limit?: number })
    case 'get_contact': return await getContact(args as { id?: string })
    case 'list_newsletter_lists': return await listNewsletterLists()
    case 'search_subscribers_in_list': return await searchSubscribersInList(args as { list_id?: string; query?: string; limit?: number })
    case 'list_tags': return await listTags()
    default: throw new Error(`Unknown tool: ${name}`)
  }
}

async function logAction(toolName: string, args: unknown, succeeded: boolean, errMsg: string | null, ipHash: string | null) {
  try {
    const supabase = createServiceClient()
    // result_summary is a length-only marker — full results would balloon storage,
    // and the agent already saw the data via the response. Keep just enough to
    // confirm the call returned something useful.
    await supabase.from('agent_actions').insert({
      tool_name: toolName,
      arguments: args ?? null,
      result_summary: succeeded ? 'ok' : null,
      succeeded,
      error_message: errMsg,
      ip_hash: ipHash,
    })
  } catch {
    // Don't let logging failures break the call
  }
}

function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null
  // 8 chars is enough to spot repeated callers without storing raw IPs
  let h = 0
  for (let i = 0; i < ip.length; i++) h = ((h << 5) - h) + ip.charCodeAt(i) | 0
  return Math.abs(h).toString(16).slice(0, 8)
}

export async function POST(req: NextRequest) {
  const expectedToken = process.env.MCP_AGENT_TOKEN
  if (!expectedToken) {
    return NextResponse.json(
      { jsonrpc: '2.0', id: null, error: { code: -32000, message: 'MCP_AGENT_TOKEN not configured on server' } },
      { status: 500 },
    )
  }

  const auth = req.headers.get('authorization') ?? ''
  const provided = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (provided !== expectedToken) {
    return NextResponse.json(
      { jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Unauthorized' } },
      { status: 401 },
    )
  }

  let msg: JsonRpcRequest
  try {
    msg = await req.json() as JsonRpcRequest
  } catch {
    return NextResponse.json(
      { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } },
      { status: 400 },
    )
  }

  const ipHash = hashIp(req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip'))

  let result: unknown = null
  let error: { code: number; message: string } | null = null

  try {
    switch (msg.method) {
      case 'initialize':
        result = {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: 'mycrm-mcp', version: '1.0.0' },
        }
        break
      case 'notifications/initialized':
        // Notification — no response per JSON-RPC spec
        return new NextResponse(null, { status: 202 })
      case 'tools/list':
        result = { tools: TOOLS }
        break
      case 'tools/call': {
        const params = (msg.params ?? {}) as { name?: string; arguments?: Record<string, unknown> }
        const toolName = params.name
        const toolArgs = params.arguments ?? {}
        if (!toolName) throw new Error('tool name required')
        const out = await executeTool(toolName, toolArgs)
        await logAction(toolName, toolArgs, true, null, ipHash)
        result = {
          content: [{ type: 'text', text: JSON.stringify(out, null, 2) }],
        }
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
      await logAction(params.name ?? 'unknown', params.arguments ?? {}, false, errMsg, ipHash)
    }
  }

  // Notification: id absent or null → don't reply
  if (msg.id === undefined || msg.id === null) {
    return new NextResponse(null, { status: 202 })
  }

  return NextResponse.json(
    error
      ? { jsonrpc: '2.0', id: msg.id, error }
      : { jsonrpc: '2.0', id: msg.id, result },
  )
}

export async function GET() {
  // SSE for server-initiated messages — not implemented for v1 (we don't need
  // server → client notifications). Spec-compliant clients accept this 405.
  return NextResponse.json(
    { error: 'GET (SSE) not implemented. Use POST for tool calls.' },
    { status: 405 },
  )
}

export const maxDuration = 60
