'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { Search, Trash2, X } from 'lucide-react'
import { PermissionGate } from '@/components/PermissionGate'

interface Note {
  id: string
  content: string | null
  type: string
  meeting_date: string | null
  created_at: string
  creator: string | null
}

interface ContactOption {
  id: string
  name: string
  company: string | null
  email: string | null
}

const TYPE_COLOR: Record<string, string> = {
  note: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  meeting: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400',
  email: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400',
}

const PAGE_SIZE = 20

export default function UnassignedNotesPage() {
  const t = useTranslations('unassignedNotes')
  const tc = useTranslations('common')
  const tn = useTranslations('notes')
  const supabase = createBrowserSupabaseClient()
  const [notes, setNotes] = useState<Note[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [assigningNote, setAssigningNote] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<ContactOption[]>([])
  const [searching, setSearching] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => { loadNotes() }, [page])

  async function loadNotes() {
    setLoading(true)
    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    const { data, count } = await supabase
      .from('interaction_logs')
      .select('id, content, type, meeting_date, created_at, created_by', { count: 'exact' })
      .is('contact_id', null)
      .order('created_at', { ascending: false })
      .range(from, to)

    if (!data) { setLoading(false); return }

    const userIds = [...new Set(data.map((n) => n.created_by).filter(Boolean))]
    let userMap: Record<string, string> = {}
    if (userIds.length > 0) {
      const { data: users } = await supabase.from('users').select('id, display_name').in('id', userIds)
      users?.forEach((u) => { userMap[u.id] = u.display_name ?? u.id })
    }

    setNotes(data.map((n) => ({
      id: n.id,
      content: n.content,
      type: n.type,
      meeting_date: n.meeting_date,
      created_at: n.created_at,
      creator: n.created_by ? (userMap[n.created_by] ?? null) : null,
    })))
    setTotal(count ?? 0)
    setLoading(false)
  }

  async function handleSearch(q: string) {
    setSearchQuery(q)
    if (!q.trim()) { setSearchResults([]); return }
    setSearching(true)
    const { data } = await supabase
      .from('contacts')
      .select('id, name, company, email')
      .or(`name.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(6)
    setSearchResults(data ?? [])
    setSearching(false)
  }

  async function assignContact(noteId: string, contactId: string) {
    await supabase.from('interaction_logs').update({ contact_id: contactId }).eq('id', noteId)
    setAssigningNote(null); setSearchQuery(''); setSearchResults([])
    if (notes.length === 1 && page > 1) setPage((p) => p - 1)
    else loadNotes()
  }

  async function deleteNote(noteId: string) {
    setDeletingId(noteId)
    await supabase.from('interaction_logs').delete().eq('id', noteId)
    setDeletingId(null)
    if (notes.length === 1 && page > 1) setPage((p) => p - 1)
    else loadNotes()
  }

  return (
    <PermissionGate feature="unassigned_notes">
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('title')}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('subtitle')}</p>
        </div>
        <span className="text-sm text-gray-500 dark:text-gray-400">{tc('total', { count: total })}</span>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">{tc('loading')}</p>
      ) : total === 0 ? (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">
          <p className="text-lg mb-1">{t('empty')}</p>
          <p className="text-sm">{t('emptyHint')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notes.map((note) => (
            <div key={note.id} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3 flex items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className={`text-xs px-2 py-0.5 rounded ${TYPE_COLOR[note.type] ?? TYPE_COLOR.note}`}>
                    {tn(`types.${note.type as 'note' | 'meeting' | 'email'}`)}
                  </span>
                  {note.meeting_date && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">📅 {note.meeting_date}</span>
                  )}
                  {note.creator && (
                    <span className="text-xs text-gray-400 dark:text-gray-500">{note.creator}</span>
                  )}
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {new Date(note.created_at).toLocaleString(undefined, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{note.content || '（空白）'}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => { setAssigningNote(note.id); setSearchQuery(''); setSearchResults([]) }}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
                >
                  {t('assignContact')}
                </button>
                <button
                  onClick={() => deleteNote(note.id)}
                  disabled={deletingId === note.id}
                  className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 disabled:opacity-40"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

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

      {/* Assign Contact Modal */}
      {assigningNote && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">{t('assignTitle')}</h3>
              <button onClick={() => setAssigningNote(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X size={20} />
              </button>
            </div>
            <div className="relative mb-3">
              <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
              <input
                type="text"
                placeholder={t('assignSearch')}
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {searching && <p className="text-sm text-gray-400 px-2">{t('searching')}</p>}
              {!searching && searchQuery && searchResults.length === 0 && (
                <p className="text-sm text-gray-400 px-2">{t('notFound')}</p>
              )}
              {searchResults.map((c) => (
                <button
                  key={c.id}
                  onClick={() => assignContact(assigningNote, c.id)}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <span className="font-medium text-gray-900 dark:text-gray-100">{c.name}</span>
                  {c.company && <span className="text-gray-500 dark:text-gray-400 ml-2">{c.company}</span>}
                  {c.email && <span className="text-gray-400 dark:text-gray-500 ml-2 text-xs">{c.email}</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
    </PermissionGate>
  )
}
