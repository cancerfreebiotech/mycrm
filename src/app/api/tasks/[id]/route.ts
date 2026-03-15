import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()

  // Verify user has access to this task (creator or assignee or assistant)
  const { data: task } = await service.from('tasks').select('created_by').eq('id', id).single()
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: assignee } = await service
    .from('task_assignees')
    .select('id')
    .eq('task_id', id)
    .eq('assignee_email', user.email!)
    .maybeSingle()

  const { data: asAssistant } = await service
    .from('user_assistants')
    .select('id')
    .eq('assistant_email', user.email!)
    .eq('manager_email', task.created_by)
    .maybeSingle()

  const hasAccess = task.created_by === user.email! || !!assignee || !!asAssistant
  if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()

  // If marking done, record completed_by
  if (body.status === 'done' && !body.completed_by) {
    body.completed_by = user.email!
    body.completed_at = new Date().toISOString()
  }

  const { error } = await service.from('tasks').update(body).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data: task } = await service.from('tasks').select('created_by').eq('id', id).single()
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (task.created_by !== user.email!) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await service.from('tasks').delete().eq('id', id)
  return NextResponse.json({ ok: true })
}
