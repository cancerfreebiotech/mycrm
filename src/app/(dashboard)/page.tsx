'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { Users, CalendarPlus, X, Search, StickyNote, Tag, Globe, ChevronRight } from 'lucide-react'

interface UnassignedNote {
  id: string
  content: string
  type: string
  created_at: string
  creator: string | null
}

interface TagStat {
  name: string
  count: number
}

interface CountryStat {
  code: string
  name: string
  emoji: string | null
  count: number
}

interface ContactOption {
  id: string
  name: string
  company: string | null
  email: string | null
}

export default function DashboardPage() {
  const t = useTranslations('dashboard')
  const tc = useTranslations('contacts')
  const tu = useTranslations('unassignedNotes')
  const [totalContacts, setTotalContacts] = useState<number>(0)
  const [monthlyContacts, setMonthlyContacts] = useState<number>(0)
  const [unassignedCount, setUnassignedCount] = useState<number>(0)
  const [tagStats, setTagStats] = useState<TagStat[]>([])
  const [countryStats, setCountryStats] = useState<CountryStat[]>([])
  const [notes, setNotes] = useState<UnassignedNote[]>([])
  const [assigningNote, setAssigningNote] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<ContactOption[]>([])
  const [searching, setSearching] = useState(false)
  const [displayName, setDisplayName] = useState<string>('')

  const supabase = createBrowserSupabaseClient()

  useEffect(() => {
    loadStats()
    loadUnassignedNotes()
    loadTagStats()
    loadCountryStats()
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) {
        supabase.from('users').select('display_name').eq('email', data.user.email).single()
          .then(({ data: u }) => { if (u?.display_name) setDisplayName(u.display_name) })
      }
    })
  }, [])

  async function loadStats() {
    const { count: total } = await supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .is('deleted_at', null)
    setTotalContacts(total ?? 0)

    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)
    const { count: monthly } = await supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .is('deleted_at', null)
      .gte('created_at', startOfMonth.toISOString())
    setMonthlyContacts(monthly ?? 0)

    const { count: unassigned } = await supabase
      .from('interaction_logs')
      .select('*', { count: 'exact', head: true })
      .is('contact_id', null)
    setUnassignedCount(unassigned ?? 0)
  }

  async function loadTagStats() {
    const { data } = await supabase.rpc('dashboard_tag_stats')
    if (!data) return
    setTagStats(data.map((r: { name: string; count: number }) => ({ name: r.name, count: Number(r.count) })))
  }

  async function loadCountryStats() {
    const { data } = await supabase.rpc('dashboard_country_stats')
    if (!data) return

    const stats: CountryStat[] = []
    let otherCount = 0

    data.forEach((r: { country_code: string | null; name_zh: string | null; emoji: string | null; count: number }) => {
      if (!r.country_code) {
        otherCount += Number(r.count)
      } else {
        stats.push({ code: r.country_code, name: r.name_zh ?? r.country_code, emoji: r.emoji ?? null, count: Number(r.count) })
      }
    })

    if (otherCount > 0) stats.push({ code: '__other__', name: '', emoji: null, count: otherCount })
    setCountryStats(stats)
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
      .is('deleted_at', null)
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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('title')}</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">{displayName ? t('welcome', { name: displayName }) : ''}</p>
      </div>

      {/* 統計卡片 */}
      <div className="grid grid-cols-3 gap-4 max-w-2xl">
        <Link href="/contacts" className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5 hover:border-blue-300 dark:hover:border-blue-700 transition-colors">
          <div className="flex items-center gap-2 mb-2">
            <Users size={18} className="text-blue-500" />
            <span className="text-sm text-gray-500 dark:text-gray-400">{t('totalContacts')}</span>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{totalContacts}</p>
        </Link>
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <CalendarPlus size={18} className="text-green-500" />
            <span className="text-sm text-gray-500 dark:text-gray-400">{t('recentContacts')}</span>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{monthlyContacts}</p>
        </div>
        <Link href="/unassigned-notes" className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5 hover:border-orange-300 dark:hover:border-orange-700 transition-colors">
          <div className="flex items-center gap-2 mb-2">
            <StickyNote size={18} className="text-orange-500" />
            <span className="text-sm text-gray-500 dark:text-gray-400">{t('unassignedNotes')}</span>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{unassignedCount}</p>
        </Link>
      </div>

      {/* Tag 分布 */}
      {tagStats.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Tag size={16} className="text-gray-400" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{t('tagDistribution')}</h2>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4 max-w-lg space-y-2">
            {tagStats.map((tag) => {
              const max = tagStats[0]?.count || 1
              const pct = Math.round((tag.count / max) * 100)
              return (
                <Link
                  key={tag.name}
                  href={`/contacts?tag=${encodeURIComponent(tag.name)}`}
                  className="flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg px-2 -mx-2 cursor-pointer"
                >
                  <span className="text-sm text-gray-600 dark:text-gray-400 w-28 shrink-0 truncate">{tag.name}</span>
                  <div className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-full h-2">
                    <div
                      className="bg-blue-500 h-2 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300 w-6 text-right shrink-0">{tag.count}</span>
                  <ChevronRight size={14} className="text-gray-300 dark:text-gray-600 shrink-0" />
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* 國家分布 */}
      {countryStats.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Globe size={16} className="text-gray-400" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{t('countryDistribution')}</h2>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4 max-w-lg space-y-2">
            {countryStats.map((stat) => {
              const max = countryStats[0]?.count || 1
              const pct = Math.round((stat.count / max) * 100)
              const label = stat.code === '__other__'
                ? t('countryOther')
                : `${stat.emoji ?? ''} ${stat.name}`.trim()
              return (
                <Link
                  key={stat.code}
                  href={`/contacts?country=${stat.code}`}
                  className="flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg px-2 -mx-2 cursor-pointer"
                >
                  <span className="text-sm text-gray-600 dark:text-gray-400 w-28 shrink-0 truncate">{label}</span>
                  <div className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-full h-2">
                    <div
                      className="bg-green-500 h-2 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300 w-6 text-right shrink-0">{stat.count}</span>
                  <ChevronRight size={14} className="text-gray-300 dark:text-gray-600 shrink-0" />
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* 待處理未歸類筆記 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{t('pendingNotes')}</h2>
          <Link href="/unassigned-notes" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
            {t('viewAll')}
          </Link>
        </div>

        {notes.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">{t('noNotes')}</p>
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
                      {tc(`logTypes.${note.type as 'note' | 'meeting' | 'email' | 'system'}`)}
                    </span>
                    {note.creator && (
                      <span className="text-xs text-gray-400 dark:text-gray-500">{note.creator}</span>
                    )}
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      {new Date(note.created_at).toLocaleString(undefined, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300 truncate">{note.content}</p>
                </div>
                <button
                  onClick={() => { setAssigningNote(note.id); setSearchQuery(''); setSearchResults([]) }}
                  className="shrink-0 text-xs text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
                >
                  {tu('assignContact')}
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
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">{tu('assignTitle')}</h3>
              <button onClick={() => setAssigningNote(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X size={20} />
              </button>
            </div>
            <div className="relative mb-3">
              <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
              <input
                type="text"
                placeholder={tu('assignSearch')}
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {searching && <p className="text-sm text-gray-400 px-2">{tu('searching')}</p>}
              {!searching && searchQuery && searchResults.length === 0 && (
                <p className="text-sm text-gray-400 px-2">{tu('notFound')}</p>
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
