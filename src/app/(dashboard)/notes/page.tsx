'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { Search, FileText, Users, Mail, Calendar, Trash2, ChevronRight } from 'lucide-react'

type LogType = 'all' | 'note' | 'meeting' | 'email'

interface NoteRow {
  id: string
  type: string
  content: string | null
  email_subject: string | null
  meeting_date: string | null
  created_at: string
  contact_id: string | null
  contacts: { name: string } | null
  users: { display_name: string | null; email: string } | null
}

interface ContactGroup {
  contact_id: string
  contactName: string
  notes: NoteRow[]
  hasMore: boolean
  latestAt: string
}

const TYPE_COLOR: Record<string, string> = {
  note:    'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  meeting: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
  email:   'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
}

const TYPE_ICON: Record<string, React.ElementType> = {
  note: FileText,
  meeting: Users,
  email: Mail,
}

const CONTACTS_PER_PAGE = 20
const FETCH_LIMIT = 500

export default function NotesPage() {
  const t = useTranslations('notes')
  const tc = useTranslations('common')
  const supabase = createBrowserSupabaseClient()

  const [groups, setGroups] = useState<ContactGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [keyword, setKeyword] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [typeFilter, setTypeFilter] = useState<LogType>('all')
  const [page, setPage] = useState(1)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => { setPage(1) }, [keyword, dateFrom, dateTo, typeFilter])

  const fetchGroups = useCallback(async () => {
    setLoading(true)

    let query = supabase
      .from('interaction_logs')
      .select('id, type, content, email_subject, meeting_date, created_at, contact_id, contacts(name), users(display_name, email)')
      .not('contact_id', 'is', null)
      .not('content', 'ilike', '透過 Telegram Bot 新增名片%')
      .not('content', 'ilike', '從名片王匯入%')
      .order('created_at', { ascending: false })
      .limit(FETCH_LIMIT)

    if (typeFilter !== 'all') query = query.eq('type', typeFilter)
    if (dateFrom) query = query.gte('created_at', dateFrom)
    if (dateTo) query = query.lte('created_at', dateTo + 'T23:59:59')
    if (keyword) {
      query = query.or(`content.ilike.%${keyword}%,email_subject.ilike.%${keyword}%`)
    }

    const { data } = await query
    const rows = (data ?? []) as NoteRow[]

    // Group by contact_id, keeping order of first appearance (most recent note per contact)
    const groupMap = new Map<string, NoteRow[]>()
    for (const row of rows) {
      if (!row.contact_id) continue
      const existing = groupMap.get(row.contact_id)
      if (existing) {
        existing.push(row)
      } else {
        groupMap.set(row.contact_id, [row])
      }
    }

    const built: ContactGroup[] = []
    for (const [contact_id, notes] of groupMap) {
      built.push({
        contact_id,
        contactName: (notes[0].contacts as { name: string } | null)?.name ?? '—',
        notes: notes.slice(0, 3),
        hasMore: notes.length > 3,
        latestAt: notes[0].created_at,
      })
    }

    setGroups(built)
    setLoading(false)
  }, [keyword, dateFrom, dateTo, typeFilter])

  useEffect(() => { fetchGroups() }, [fetchGroups])

  function formatDate(str: string) {
    return new Date(str).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
  }

  async function handleDelete(logId: string, contactId: string) {
    if (!confirm(t('confirmDelete'))) return
    setDeleting(logId)
    await supabase.from('interaction_logs').delete().eq('id', logId)
    setGroups((prev) =>
      prev
        .map((g) => {
          if (g.contact_id !== contactId) return g
          const updated = g.notes.filter((n) => n.id !== logId)
          return { ...g, notes: updated }
        })
        .filter((g) => g.notes.length > 0)
    )
    setDeleting(null)
  }

  function snippet(text: string | null, max = 120) {
    if (!text) return '—'
    const plain = text.replace(/<[^>]+>/g, '')
    return plain.length > max ? plain.slice(0, max) + '...' : plain
  }

  const totalPages = Math.ceil(groups.length / CONTACTS_PER_PAGE)
  const pageGroups = groups.slice((page - 1) * CONTACTS_PER_PAGE, page * CONTACTS_PER_PAGE)

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">{t('title')}</h1>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-5 space-y-3">
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as LogType)}
            className="text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">{t('allTypes')}</option>
            <option value="note">{t('types.note')}</option>
            <option value="meeting">{t('types.meeting')}</option>
            <option value="email">{t('types.email')}</option>
          </select>
        </div>

        <div className="flex gap-3 items-center flex-wrap">
          <Calendar size={14} className="text-gray-400 shrink-0" />
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-gray-400 text-sm">{t('dateFrom')}</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {(dateFrom || dateTo) && (
            <button
              onClick={() => { setDateFrom(''); setDateTo('') }}
              className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              {t('clearDate')}
            </button>
          )}
        </div>
      </div>

      {/* Summary */}
      {!loading && (
        <div className="flex items-center justify-between mb-3 text-sm text-gray-500 dark:text-gray-400">
          <span>{t('contactCount', { count: groups.length })}</span>
          {totalPages > 1 && <span>{tc('page', { current: page, total: totalPages })}</span>}
        </div>
      )}

      {/* Grouped results */}
      <div className="space-y-4">
        {loading ? (
          <div className="text-sm text-gray-400 py-8 text-center">{tc('loading')}</div>
        ) : pageGroups.length === 0 ? (
          <div className="text-sm text-gray-400 py-8 text-center">{t('noResults')}</div>
        ) : (
          pageGroups.map((group) => (
            <div
              key={group.contact_id}
              className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden"
            >
              {/* Contact header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                <Link
                  href={`/contacts/${group.contact_id}`}
                  className="font-medium text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {group.contactName}
                </Link>
                <span className="text-xs text-gray-400">{formatDate(group.latestAt)}</span>
              </div>

              {/* Notes list */}
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {group.notes.map((log) => {
                  const color = TYPE_COLOR[log.type] ?? TYPE_COLOR.note
                  const TypeIcon = TYPE_ICON[log.type] ?? FileText
                  const creatorName =
                    (log.users as { display_name: string | null; email: string } | null)?.display_name ||
                    (log.users as { display_name: string | null; email: string } | null)?.email ||
                    '—'

                  return (
                    <div key={log.id} className="flex items-start gap-3 px-4 py-3 group">
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium shrink-0 mt-0.5 ${color}`}>
                        <TypeIcon size={11} />
                        {t(`types.${log.type as 'note' | 'meeting' | 'email'}`)}
                      </span>
                      <div className="flex-1 min-w-0">
                        {log.type === 'email' && log.email_subject && (
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">
                            {log.email_subject}
                          </p>
                        )}
                        {log.type === 'meeting' && log.meeting_date && (
                          <p className="text-xs text-gray-400 mb-1">{t('meetingDate', { date: log.meeting_date })}</p>
                        )}
                        <p className="text-sm text-gray-600 dark:text-gray-400 break-words">
                          {snippet(log.content)}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-400">
                          <span>{creatorName}</span>
                          <span>·</span>
                          <span>{formatDate(log.created_at)}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDelete(log.id, group.contact_id)}
                        disabled={deleting === log.id}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 text-gray-300 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 rounded shrink-0"
                        title={tc('delete')}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )
                })}
              </div>

              {/* View all link */}
              {group.hasMore && (
                <div className="px-4 py-2.5 border-t border-gray-100 dark:border-gray-800">
                  <Link
                    href={`/contacts/${group.contact_id}`}
                    className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {t('viewAll')} <ChevronRight size={12} />
                  </Link>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 mt-4">
          <button onClick={() => setPage(1)} disabled={page === 1}
            className="px-2 py-1 text-sm rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40">«</button>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
            className="px-2 py-1 text-sm rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40">‹</button>
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
            .reduce<(number | '…')[]>((acc, p, idx, arr) => {
              if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('…')
              acc.push(p)
              return acc
            }, [])
            .map((p, i) =>
              p === '…' ? (
                <span key={`e-${i}`} className="px-2 py-1 text-sm text-gray-400">…</span>
              ) : (
                <button key={p} onClick={() => setPage(p as number)}
                  className={`px-3 py-1 text-sm rounded border transition-colors ${page === p ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                  {p}
                </button>
              )
            )}
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className="px-2 py-1 text-sm rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40">›</button>
          <button onClick={() => setPage(totalPages)} disabled={page === totalPages}
            className="px-2 py-1 text-sm rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40">»</button>
        </div>
      )}
    </div>
  )
}
