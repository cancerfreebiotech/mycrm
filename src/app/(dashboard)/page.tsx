'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { Users, CalendarPlus, X, Search } from 'lucide-react'

interface UnassignedNote {
  id: string
  content: string
  type: string
  created_at: string
  creator: string | null
}

interface ContactOption {
  id: string
  name: string
  company: string | null
  email: string | null
}

export default function DashboardPage() {
  const [totalContacts, setTotalContacts] = useState<number>(0)
  const [monthlyContacts, setMonthlyContacts] = useState<number>(0)
  const [notes, setNotes] = useState<UnassignedNote[]>([])
  const [assigningNote, setAssigningNote] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<ContactOption[]>([])
  const [searching, setSearching] = useState(false)

  const supabase = createBrowserSupabaseClient()

  useEffect(() => {
    loadStats()
    loadUnassignedNotes()
  }, [])

  async function loadStats() {
    const { count: total } = await supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
    setTotalContacts(total ?? 0)

    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)
    const { count: monthly } = await supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startOfMonth.toISOString())
    setMonthlyContacts(monthly ?? 0)
  }

  async function loadUnassignedNotes() {
    const { data } = await supabase
      .from('interaction_logs')
      .select('id, content, type, created_at, created_by')
      .is('contact_id', null)
      .order('created_at', { ascending: false })
      .limit(5)

    if (!data) return

    const userIds = [...new Set(data.map((n) => n.created_by).filter(Boolean))]
    let userMap: Record<string, string> = {}
    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('id, display_name')
        .in('id', userIds)
      users?.forEach((u) => { userMap[u.id] = u.display_name ?? u.id })
    }

    setNotes(data.map((n) => ({
      id: n.id,
      content: n.content ?? '',
      type: n.type,
      created_at: n.created_at,
      creator: n.created_by ? (userMap[n.created_by] ?? null) : null,
    })))
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
    await supabase
      .from('interaction_logs')
      .update({ contact_id: contactId })
      .eq('id', noteId)
    setAssigningNote(null)
    setSearchQuery('')
    setSearchResults([])
    loadUnassignedNotes()
  }

  const typeLabel: Record<string, string> = { note: '筆記', meeting: '會議', email: '郵件' }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Dashboard</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">歡迎使用 myCRM</p>
      </div>

      {/* 統計卡片 */}
      <div className="grid grid-cols-2 gap-4 max-w-lg">
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-2">
            <Users size={20} className="text-blue-500" />
            <span className="text-sm text-gray-500 dark:text-gray-400">聯絡人總數</span>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{totalContacts}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-2">
            <CalendarPlus size={20} className="text-green-500" />
            <span className="text-sm text-gray-500 dark:text-gray-400">本月新增名片</span>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{monthlyContacts}</p>
        </div>
      </div>

      {/* 待處理未歸類筆記 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">待處理</h2>
          <Link href="/unassigned-notes" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
            查看全部未歸類筆記 →
          </Link>
        </div>

        {notes.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">目前沒有未歸類筆記</p>
        ) : (
          <div className="space-y-2">
            {notes.map((note) => (
              <div
                key={note.id}
                className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3 flex items-start justify-between gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded">
                      {typeLabel[note.type] ?? note.type}
                    </span>
                    {note.creator && (
                      <span className="text-xs text-gray-400 dark:text-gray-500">{note.creator}</span>
                    )}
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      {new Date(note.created_at).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300 truncate">{note.content}</p>
                </div>
                <button
                  onClick={() => { setAssigningNote(note.id); setSearchQuery(''); setSearchResults([]) }}
                  className="shrink-0 text-xs text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
                >
                  指定聯絡人
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 指定聯絡人 Modal */}
      {assigningNote && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">指定聯絡人</h3>
              <button onClick={() => setAssigningNote(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X size={20} />
              </button>
            </div>
            <div className="relative mb-3">
              <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
              <input
                type="text"
                placeholder="搜尋姓名或 Email..."
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {searching && <p className="text-sm text-gray-400 px-2">搜尋中...</p>}
              {!searching && searchQuery && searchResults.length === 0 && (
                <p className="text-sm text-gray-400 px-2">找不到聯絡人</p>
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
  )
}
