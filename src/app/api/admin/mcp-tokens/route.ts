import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import { createHash, randomBytes } from 'node:crypto'

// GET  /api/admin/mcp-tokens         — list all tokens (super_admin)
// POST /api/admin/mcp-tokens         — create token, returns plaintext ONCE
//
// Both super_admin only. The plaintext token is never stored — only its
// sha256 hash + a 12-char prefix for display.

const VALID_SCOPES = ['read:contacts', 'read:newsletter', 'read:tags', 'write:contacts', 'write:notes', 'write:newsletter']

async function requireSuperAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return null
  const service = createServiceClient()
  const { data: profile } = await service.from('users').select('id, role').eq('email', user.email).single()
  if (profile?.role !== 'super_admin') return null
  return { id: profile.id as string }
}

export async function GET() {
  const admin = await requireSuperAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const service = createServiceClient()
  const { data, error } = await service
    .from('agent_tokens')
    .select('id, name, description, assigned_to, prefix, scopes, created_at, expires_at, last_used_at, disabled_at, disabled_reason, assignee:assigned_to(display_name, email)')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tokens: data ?? [] })
}

export async function POST(req: NextRequest) {
  const admin = await requireSuperAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as {
    name?: string
    description?: string
    assigned_to?: string
    scopes?: string[]
    expires_in?: '24h' | '30d' | '1y' | 'never'
  }
  const name = body.name?.trim()
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  if (!body.assigned_to) return NextResponse.json({ error: 'assigned_to required' }, { status: 400 })
  const scopes = (body.scopes ?? []).filter((s) => VALID_SCOPES.includes(s))
  if (scopes.length === 0) return NextResponse.json({ error: 'at least one scope required' }, { status: 400 })

  let expires_at: string | null = null
  if (body.expires_in === '24h') expires_at = new Date(Date.now() + 24 * 3600 * 1000).toISOString()
  else if (body.expires_in === '30d') expires_at = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString()
  else if (body.expires_in === '1y') expires_at = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString()
  // 'never' or undefined → null

  const plaintext = `mcp_${randomBytes(32).toString('base64url')}`
  const token_hash = createHash('sha256').update(plaintext).digest('hex')
  const prefix = plaintext.slice(0, 12)

  const service = createServiceClient()
  const { data, error } = await service
    .from('agent_tokens')
    .insert({
      name,
      description: body.description?.trim() || null,
      assigned_to: body.assigned_to,
      token_hash,
      prefix,
      scopes,
      created_by: admin.id,
      expires_at,
    })
    .select('id, name, prefix, scopes, expires_at')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Plaintext returned ONCE — never retrievable again
  return NextResponse.json({ token: data, plaintext })
}
