import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import { hasFeature } from '@/lib/features'
import { randomBytes } from 'node:crypto'

async function authorize() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return null
  const service = createServiceClient()
  const { data: profile } = await service
    .from('users').select('id, role, granted_features').eq('email', user.email).single()
  if (!profile) return null
  if (!hasFeature(profile.role, profile.granted_features ?? [], 'newsletter')) return null
  return { userId: profile.id }
}

// POST /api/newsletter/drafts/[id]/photo
//   Body: multipart/form-data with 'file' field
//   Uploads to newsletter-assets/drafts/{period}/{uuid}.{ext} and appends to photo_urls.
//
// DELETE /api/newsletter/drafts/[id]/photo?url=<full storage URL>
//   Removes a single URL from photo_urls (does NOT delete the storage object — could be cleanup cron later).

const BUCKET = 'newsletter-assets'
const MAX_SIZE = 10 * 1024 * 1024  // 10 MB
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await ctx.params

  const form = await req.formData()
  const file = form.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 })
  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'file too large (max 10MB)' }, { status: 400 })
  if (!ALLOWED_MIME.has(file.type)) return NextResponse.json({ error: 'unsupported mime type' }, { status: 400 })

  const service = createServiceClient()
  const { data: draft } = await service
    .from('newsletter_drafts').select('period, photo_urls').eq('id', id).single()
  if (!draft) return NextResponse.json({ error: 'draft not found' }, { status: 404 })

  const ext = (file.name.match(/\.([a-zA-Z0-9]+)$/)?.[1] ?? 'jpg').toLowerCase()
  const key = `drafts/${draft.period}/${randomBytes(8).toString('hex')}.${ext}`
  const buf = Buffer.from(await file.arrayBuffer())

  const { error: upErr } = await service.storage.from(BUCKET).upload(key, buf, {
    contentType: file.type, upsert: false,
  })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const url = service.storage.from(BUCKET).getPublicUrl(key).data.publicUrl
  const updated = [...(draft.photo_urls ?? []), url]
  await service.from('newsletter_drafts').update({ photo_urls: updated }).eq('id', id)

  return NextResponse.json({ url, photo_urls: updated })
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await ctx.params
  const target = req.nextUrl.searchParams.get('url')
  if (!target) return NextResponse.json({ error: 'url required' }, { status: 400 })

  const service = createServiceClient()
  const { data: draft } = await service
    .from('newsletter_drafts').select('photo_urls').eq('id', id).single()
  if (!draft) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const next = (draft.photo_urls ?? []).filter((u: string) => u !== target)
  await service.from('newsletter_drafts').update({ photo_urls: next }).eq('id', id)
  return NextResponse.json({ photo_urls: next })
}
