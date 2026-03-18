'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { Plus, Check, Clock, X, Pencil, Trash2 } from 'lucide-react'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'

type TaskStatus = 'pending' | 'done' | 'postponed' | 'cancelled'

interface AssigneeInfo {
  assignee_email: string
  users: { display_name: string | null } | null
}

interface Task {
  id: string
  task_number: number | null
  title: string
  description: string | null
  due_at: string | null
  status: TaskStatus
  created_by: string
  completed_by: string | null
  completed_at: string | null
  created_at: string
  task_assignees: AssigneeInfo[]
  contacts: { id: string; name: string | null; company: string | null } | null
}

interface UserOption {
  email: string
  display_name: string | null
}

type Tab = 'mine' | 'assigned' | 'to_me'

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('zh-TW', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function TasksPage() {
  const t = useTranslations('tasks')
  const tc = useTranslations('common')

  const [tab, setTab] = useState<Tab>('mine')
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [users, setUsers] = useState<UserOption[]>([])

  const [showModal, setShowModal] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [form, setForm] = useState({ title: '', description: '', due_at: '', assignee_emails: [] as string[] })
  const [saving, setSaving] = useState(false)

  const [postponeId, setPostponeId] = useState<string | null>(null)
  const [postponeDate, setPostponeDate] = useState('')

  const supabase = createBrowserSupabaseClient()

  const loadTasks = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/tasks?tab=${tab}`)
    if (res.ok) {
      const data = await res.json()
      setTasks(data.tasks ?? [])
    }
    setLoading(false)
  }, [tab])

  useEffect(() => { loadTasks() }, [loadTasks])

  // Realtime: refresh when tasks table changes
  useEffect(() => {
    const channel = supabase
      .channel('tasks-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        loadTasks()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  useEffect(() => {
    async function loadUsers() {
      const { data } = await supabase.from('users').select('email, display_name').order('display_name')
      setUsers(data ?? [])
    }
    loadUsers()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function openAdd() {
    setEditingTask(null)
    setForm({ title: '', description: '', due_at: '', assignee_emails: [] })
    setShowModal(true)
  }

  function openEdit(task: Task) {
    setEditingTask(task)
    setForm({
      title: task.title,
      description: task.description ?? '',
      due_at: task.due_at ? task.due_at.slice(0, 16) : '',
      assignee_emails: task.task_assignees.map(a => a.assignee_email),
    })
    setShowModal(true)
  }

  async function handleSave() {
    setSaving(true)
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
      assignee_emails: form.assignee_emails,
    }

    if (editingTask) {
      await fetch(`/api/tasks/${editingTask.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: payload.title, description: payload.description, due_at: payload.due_at }),
      })
    } else {
      await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    }

    setSaving(false)
    setShowModal(false)
    loadTasks()
  }

  async function handleStatusChange(id: string, status: TaskStatus) {
    if (status === 'cancelled' && !confirm(t('confirmCancel'))) return
    await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    loadTasks()
  }

  async function handlePostponeSave() {
    if (!postponeId || !postponeDate) return
    await fetch(`/api/tasks/${postponeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'postponed', due_at: new Date(postponeDate).toISOString() }),
    })
    setPostponeId(null)
    setPostponeDate('')
    loadTasks()
  }

  async function handleDelete(id: string) {
    if (!confirm(tc('confirm') + '？')) return
    await fetch(`/api/tasks/${id}`, { method: 'DELETE' })
    loadTasks()
  }

  const filtered = tasks.filter(t =>
    t.title.toLowerCase().includes(search.toLowerCase()) ||
    (t.description ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const statusColor: Record<TaskStatus, string> = {
    pending: 'bg-yellow-100 dark:bg-yellow-950 text-yellow-700 dark:text-yellow-400',
    done: 'bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400',
    postponed: 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-400',
    cancelled: 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'mine', label: t('tabMine') },
    { key: 'assigned', label: t('tabAssigned') },
    { key: 'to_me', label: t('tabToMe') },
  ]

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('title')}</h1>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={15} /> {t('addTask')}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === key
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder={t('searchPlaceholder')}
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {/* Task list */}
      {loading ? (
        <p className="text-sm text-gray-400">{tc('loading')}</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-400">{t('noTasks')}</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((task) => {
            const assigneeNames = task.task_assignees.map(a =>
              a.users?.display_name ?? a.assignee_email.split('@')[0]
            ).join(', ')

            return (
              <div key={task.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {task.task_number && (
                        <span className="text-xs font-mono text-gray-400 dark:text-gray-500 shrink-0">
                          #{task.task_number}
                        </span>
                      )}
                      <span className="font-medium text-gray-900 dark:text-gray-100">{task.title}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[task.status]}`}>
                        {t(`status.${task.status}`)}
                      </span>
                    </div>
                    {task.description && (
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{task.description}</p>
                    )}
                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-400 dark:text-gray-500">
                      {/* Assigned time & by */}
                      <span title="指派時間">📅 {formatDate(task.created_at)}</span>
                      <span title="指派人">🧑‍💼 {task.created_by}</span>
                      {task.due_at && (
                        <span>⏰ {new Date(task.due_at).toLocaleString()}</span>
                      )}
                      {assigneeNames && (
                        <span>👤 {assigneeNames}</span>
                      )}
                      {task.contacts?.name && (
                        <Link
                          href={`/contacts/${task.contacts.id}`}
                          className="text-blue-500 dark:text-blue-400 hover:underline"
                        >
                          🔗 {task.contacts.name}{task.contacts.company ? `（${task.contacts.company}）` : ''}
                        </Link>
                      )}
                      {task.completed_by && (
                        <span className="text-green-600 dark:text-green-400">
                          ✅ {task.completed_by}{task.completed_at ? ` · ${formatDate(task.completed_at)}` : ''}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {task.status === 'pending' && (
                      <>
                        <button
                          onClick={() => handleStatusChange(task.id, 'done')}
                          title={t('markDone')}
                          className="p-1.5 text-gray-400 hover:text-green-600 dark:hover:text-green-400 transition-colors"
                        >
                          <Check size={15} />
                        </button>
                        <button
                          onClick={() => { setPostponeId(task.id); setPostponeDate('') }}
                          title={t('postpone')}
                          className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                        >
                          <Clock size={15} />
                        </button>
                        <button
                          onClick={() => handleStatusChange(task.id, 'cancelled')}
                          title={t('cancel')}
                          className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                        >
                          <X size={15} />
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => openEdit(task)}
                      className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => handleDelete(task.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {editingTask ? t('editTask') : t('addTask')}
            </h3>

            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('titleLabel')}</label>
              <input
                type="text"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                className="w-full text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('descLabel')}</label>
              <textarea
                rows={2}
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="w-full text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('dueLabel')}</label>
              <input
                type="datetime-local"
                value={form.due_at}
                onChange={e => setForm(f => ({ ...f, due_at: e.target.value }))}
                className="w-full text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {!editingTask && (
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('assigneesLabel')}</label>
                <div className="space-y-1 max-h-36 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg p-2">
                  {users.map(u => (
                    <label key={u.email} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.assignee_emails.includes(u.email)}
                        onChange={e => {
                          setForm(f => ({
                            ...f,
                            assignee_emails: e.target.checked
                              ? [...f.assignee_emails, u.email]
                              : f.assignee_emails.filter(x => x !== u.email),
                          }))
                        }}
                        className="rounded"
                      />
                      {u.display_name ?? u.email}
                    </label>
                  ))}
                </div>
                {form.assignee_emails.length === 0 && (
                  <p className="mt-1 text-xs text-gray-400">{t('selfReminder')}</p>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
              >
                {tc('cancel')}
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.title.trim()}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
              >
                {saving ? t('saving') : tc('save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Postpone Modal */}
      {postponeId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('postpone')}</h3>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('dueLabel')}</label>
              <input
                type="datetime-local"
                value={postponeDate}
                onChange={e => setPostponeDate(e.target.value)}
                className="w-full text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPostponeId(null)}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400"
              >
                {tc('cancel')}
              </button>
              <button
                onClick={handlePostponeSave}
                disabled={!postponeDate}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
              >
                {tc('confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
