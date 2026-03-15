'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { Search, FileText, Users, Mail, Calendar } from 'lucide-react'

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

const TYPE_LABEL: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  note:    { label: '筆記',   color: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',    icon: FileText },
  meeting: { label: '會議',   color: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300', icon: Users },
  email:   { label: '郵件',   color: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300', icon: Mail },
}

const PAGE_SIZE = 20

export default function NotesPage() {
  const supabase = createBrowserSupabaseClient()

  const [logs, setLogs] = useState<NoteRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [keyword, setKeyword] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [typeFilter, setTypeFilter] = useState<LogType>('all')
  const [page, setPage] = useState(1)

  useEffect(() => { setPage(1) }, [keyword, dateFrom, dateTo, typeFilter])
  useEffect(() => { fetchLogs() }, [keyword, dateFrom, dateTo, typeFilter, page])

  async function fetchLogs() {
    setLoading(true)
    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    let query = supabase
      .from('interaction_logs')
      .select('id, type, content, email_subject, meeting_date, created_at, contact_id, contacts(name), users(display_name, email)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to)

    if (typeFilter !== 'all') query = query.eq('type', typeFilter)
    if (dateFrom) query = query.gte('created_at', dateFrom)
    if (dateTo) query = query.lte('created_at', dateTo + 'T23:59:59')
    if (keyword) {
      query = query.or(`content.ilike.%${keyword}%,email_subject.ilike.%${keyword}%`)
    }

    const { data, count } = await query
    setLogs((data ?? []) as NoteRow[])
    setTotal(count ?? 0)
    setLoading(false)
  }

  function formatDate(str: string) {
    return new Date(str).toLocaleString('zh-TW', { dateStyle: 'short', timeStyle: 'short' })
  }

  function snippet(text: string | null, max = 120) {
    if (!text) return '—'
    const plain = text.replace(/<[^>]+>/g, '')
    return plain.length > max ? plain.slice(0, max) + '...' : plain
  }

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">筆記搜尋</h1>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-5 space-y-3">
        <div className="flex gap-3 flex-wrap">
          {/* Keyword */}
          <div className="relative flex-1 min-w-48">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜尋內容或主旨..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Type filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as LogType)}
            className="text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">全部類型</option>
            <option value="note">筆記</option>
            <option value="meeting">會議</option>
            <option value="email">郵件</option>
          </select>
        </div>

        {/* Date range */}
        <div className="flex gap-3 items-center flex-wrap">
          <Calendar size={14} className="text-gray-400 shrink-0" />
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-gray-400 text-sm">至</span>
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
              清除
            </button>
          )}
        </div>
      </div>

      {/* Results header */}
      {!loading && (
        <div className="flex items-center justify-between mb-2 text-sm text-gray-500 dark:text-gray-400">
          <span>共 {total} 筆</span>
          {total > PAGE_SIZE && <span>第 {page}/{Math.ceil(total / PAGE_SIZE)} 頁</span>}
        </div>
      )}

      {/* Results */}
      <div className="space-y-2">
        {loading ? (
          <div className="text-sm text-gray-400 py-8 text-center">載入中...</div>
        ) : logs.length === 0 ? (
          <div className="text-sm text-gray-400 py-8 text-center">無符合條件的紀錄</div>
        ) : (
          logs.map((log) => {
            const typeMeta = TYPE_LABEL[log.type] ?? TYPE_LABEL.note
            const TypeIcon = typeMeta.icon
            const contactName = (log.contacts as { name: string } | null)?.name
            const creatorName = (log.users as { display_name: string | null; email: string } | null)?.display_name
              || (log.users as { display_name: string | null; email: string } | null)?.email
              || '—'

            return (
              <div
                key={log.id}
                className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4"
              >
                <div className="flex items-start gap-3">
                  <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium shrink-0 mt-0.5 ${typeMeta.color}`}>
                    <TypeIcon size={11} />
                    {typeMeta.label}
                  </span>
                  <div className="flex-1 min-w-0">
                    {log.type === 'email' && log.email_subject && (
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">
                        {log.email_subject}
                      </p>
                    )}
                    {log.type === 'meeting' && log.meeting_date && (
                      <p className="text-xs text-gray-400 mb-1">會議日期：{log.meeting_date}</p>
                    )}
                    <p className="text-sm text-gray-600 dark:text-gray-400 break-words">
                      {snippet(log.content)}
                    </p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-400 flex-wrap">
                      {log.contact_id && contactName ? (
                        <Link
                          href={`/contacts/${log.contact_id}`}
                          className="text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          {contactName}
                        </Link>
                      ) : (
                        <span className="text-gray-400">未歸類</span>
                      )}
                      <span>·</span>
                      <span>{creatorName}</span>
                      <span>·</span>
                      <span>{formatDate(log.created_at)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Pagination */}
      {Math.ceil(total / PAGE_SIZE) > 1 && (
        <div className="flex items-center justify-center gap-1 mt-4">
          <button onClick={() => setPage(1)} disabled={page === 1}
            className="px-2 py-1 text-sm rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40">«</button>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
            className="px-2 py-1 text-sm rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40">‹</button>
          {Array.from({ length: Math.ceil(total / PAGE_SIZE) }, (_, i) => i + 1)
            .filter((p) => p === 1 || p === Math.ceil(total / PAGE_SIZE) || Math.abs(p - page) <= 2)
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
          <button onClick={() => setPage((p) => Math.min(Math.ceil(total / PAGE_SIZE), p + 1))} disabled={page === Math.ceil(total / PAGE_SIZE)}
            className="px-2 py-1 text-sm rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40">›</button>
          <button onClick={() => setPage(Math.ceil(total / PAGE_SIZE))} disabled={page === Math.ceil(total / PAGE_SIZE)}
            className="px-2 py-1 text-sm rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40">»</button>
        </div>
      )}
    </div>
  )
}
