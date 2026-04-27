import { NextResponse, after } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import { processPendingForUser } from '@/lib/pending-ocr-worker'

// User-triggered rescue: re-processes the caller's pending rows.
// Useful when the every-2-min cron is delayed or rows got stuck.
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data: u } = await service
    .from('users')
    .select('id, telegram_id')
    .eq('email', user.email)
    .single()
  if (!u?.id) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const { count } = await service
    .from('pending_contacts')
    .select('*', { count: 'exact', head: true })
    .eq('created_by', u.id)
    .eq('status', 'pending')

  if (!count || count === 0) {
    return NextResponse.json({ ok: true, queued: 0, message: 'no pending rows' })
  }

  // Reset retry_count so previously-failed rows get another chance
  await service
    .from('pending_contacts')
    .update({ retry_count: 0, error_message: null })
    .eq('created_by', u.id)
    .eq('status', 'pending')

  const userId = u.id as string
  const telegramId = (u.telegram_id as number | null) ?? null

  after(async () => {
    const sb = createServiceClient()
    console.log('[rescue] starting for', { userId, count })
    const result = await processPendingForUser(sb, userId, telegramId)
    console.log('[rescue] done', result)
  })

  return NextResponse.json({ ok: true, queued: count })
}

export const maxDuration = 300
