import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import { sendTeamsTaskNotification } from '@/lib/teams'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const tab = req.nextUrl.searchParams.get('tab') ?? 'mine'  // mine | assigned | to_me

  let tasks
  if (tab === 'mine') {
    // Tasks I created where I'm the sole assignee (self-reminders)
    const { data } = await service
      .from('tasks')
      .select(`*, task_assignees(assignee_email, users(display_name))`)
      .eq('created_by', user.email!)
      .order('due_at', { ascending: true, nullsFirst: false })
    tasks = (data ?? []).filter((t) => {
      const assignees = (t.task_assignees ?? []) as Array<{ assignee_email: string }>
      return assignees.length === 0 || (assignees.length === 1 && assignees[0].assignee_email === user.email)
    })
  } else if (tab === 'assigned') {
    // Tasks I created with other assignees
    const { data } = await service
      .from('tasks')
      .select(`*, task_assignees(assignee_email, users(display_name))`)
      .eq('created_by', user.email!)
      .order('due_at', { ascending: true, nullsFirst: false })
    tasks = (data ?? []).filter((t) => {
      const assignees = (t.task_assignees ?? []) as Array<{ assignee_email: string }>
      return assignees.some((a) => a.assignee_email !== user.email!)
    })
  } else {
    // Tasks assigned to me (not created by me)
    const { data: assigneeRows } = await service
      .from('task_assignees')
      .select('task_id')
      .eq('assignee_email', user.email!)
    const ids = (assigneeRows ?? []).map((r) => r.task_id)
    if (ids.length === 0) {
      return NextResponse.json({ tasks: [] })
    }
    const { data } = await service
      .from('tasks')
      .select(`*, task_assignees(assignee_email, users(display_name))`)
      .in('id', ids)
      .neq('created_by', user.email!)
      .order('due_at', { ascending: true, nullsFirst: false })
    tasks = data ?? []
  }

  return NextResponse.json({ tasks })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { title, description, due_at, assignee_emails } = await req.json()

  if (!title?.trim()) return NextResponse.json({ error: '標題必填' }, { status: 400 })

  const { data: task, error } = await service
    .from('tasks')
    .insert({ title: title.trim(), description: description ?? null, due_at: due_at ?? null, created_by: user.email! })
    .select('id')
    .single()

  if (error || !task) return NextResponse.json({ error: error?.message ?? 'insert failed' }, { status: 500 })

  const emails: string[] = assignee_emails?.length ? assignee_emails : [user.email!]
  for (const email of emails) {
    await service.from('task_assignees').insert({ task_id: task.id, assignee_email: email })
  }

  // Send Teams notifications to assignees (skip self-reminders)
  const otherAssignees = emails.filter((e) => e !== user.email!)
  if (otherAssignees.length > 0) {
    const { data: teamsUsers } = await service
      .from('users')
      .select('email, teams_conversation_id, teams_service_url')
      .in('email', otherAssignees)
      .not('teams_conversation_id', 'is', null)

    const appUrl = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('.supabase.co', '') ?? ''
    for (const u of teamsUsers ?? []) {
      if (!u.teams_conversation_id || !u.teams_service_url) continue
      sendTeamsTaskNotification(u.teams_service_url, u.teams_conversation_id, {
        title: title.trim(),
        description: description ?? undefined,
        due_at: due_at ?? null,
        task_id: task.id,
        app_url: appUrl,
      }).catch(() => { /* non-blocking */ })
    }
  }

  return NextResponse.json({ task })
}
