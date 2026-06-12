import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { createHash, timingSafeEqual } from 'node:crypto'
import { TOOLS, TOOL_BY_NAME, executeTool, type Scope } from '@/lib/agent-tools'

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
// Scopes (per tool): read:contacts / read:newsletter / read:tags /
//   write:contacts / write:notes / write:newsletter
//
// Rate limit: 120 req/min per token (counts agent_actions).
// Every call logs to public.agent_actions.
//
// Tool definitions + implementations live in src/lib/agent-tools.ts (shared with
// the AI chatbot at /api/ai-chat). See docs/mcp-v2-plan.md.

interface JsonRpcRequest {
  jsonrpc?: string
  method?: string
  params?: unknown
  id?: number | string | null
}

const PROTOCOL_VERSION = '2024-11-05'
const RATE_LIMIT_PER_MIN = 120

function timingSafeStrEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

// ─────────────────────────── auth + infra ───────────────────────────

interface TokenContext {
  tokenId: string | null        // null = legacy env token
  scopes: Scope[]
  legacy: boolean
  assignedTo: string | null     // the user this token is bound to (null for legacy)
  allowAnyActor: boolean         // if false, X-Acting-User is forced to assignedTo
}

const LEGACY_SCOPES: Scope[] = ['read:contacts', 'read:newsletter', 'read:tags']

async function resolveToken(bearer: string): Promise<TokenContext | null> {
  const envToken = process.env.MCP_AGENT_TOKEN
  const supabase = createServiceClient()
  const hash = createHash('sha256').update(bearer).digest('hex')
  const { data: row } = await supabase
    .from('agent_tokens')
    .select('id, scopes, disabled_at, expires_at, assigned_to, allow_any_actor')
    .eq('token_hash', hash)
    .maybeSingle()
  if (row) {
    if (row.disabled_at) return null
    if (row.expires_at && new Date(row.expires_at as string).getTime() < Date.now()) return null
    return {
      tokenId: row.id as string,
      scopes: (row.scopes as Scope[]) ?? [],
      legacy: false,
      assignedTo: (row.assigned_to as string) ?? null,
      allowAnyActor: !!row.allow_any_actor,
    }
  }
  // Legacy env fallback — read-only, timing-safe comparison
  if (envToken && timingSafeStrEqual(bearer, envToken)) {
    return { tokenId: null, scopes: LEGACY_SCOPES, legacy: true, assignedTo: null, allowAnyActor: false }
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

  // Resolve the acting identity, then enforce the binding to assigned_to.
  const headerActor = await resolveActingUser(req.headers.get('x-acting-user'))
  let actingAs: string | null = null
  let actingError: string | null = null
  if (!ctx.legacy) {
    if (ctx.allowAnyActor) {
      actingAs = headerActor
    } else if (headerActor && headerActor !== ctx.assignedTo) {
      actingError = 'X-Acting-User does not match this token’s assigned user (token is not allow_any_actor). Omit the header or use the assigned user.'
    } else {
      actingAs = ctx.assignedTo  // locked
    }
  }

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
        // reject up front if the acting identity was invalid (spoof attempt / mismatch)
        if (actingError) throw new Error(actingError)
        // write tools need an acting user
        if (tool.write && !actingAs) {
          throw new Error(`X-Acting-User required for write tool '${toolName}' (must be a known mycrm user; for non-shared tokens it is bound to the assigned user)`)
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
