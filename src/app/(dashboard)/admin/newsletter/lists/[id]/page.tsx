'use client'

import { useEffect, useState, useMemo } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { PermissionGate } from '@/components/PermissionGate'
import { Loader2, ArrowLeft, Users, Search, Link as LinkIcon } from 'lucide-react'

interface ListMeta {
  id: string
  key: string
  name: string
  description: string | null
}

interface SubscriberRow {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  contact_id: string | null
  unsubscribed_at: string | null
  added_at: string
  contact_name: string | null
}

export default function ListDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const supabase = createBrowserSupabaseClient()
  const [list, setList] = useState<ListMeta | null>(null)
  const [subs, setSubs] = useState<SubscriberRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    (async () => {
      const [{ data: listData }, { data: memberData }] = await Promise.all([
        supabase.from('newsletter_lists').select('id, key, name, description').eq('id', id).maybeSingle(),
        supabase
          .from('newsletter_subscriber_lists')
          .select('added_at, newsletter_subscribers(id, email, first_name, last_name, contact_id, unsubscribed_at)')
          .eq('list_id', id)
          .order('added_at', { ascending: false }),
      ])
      setList((listData ?? null) as ListMeta | null)

      const rows: SubscriberRow[] = []
      const contactIds: string[] = []
      for (const m of memberData ?? []) {
        const s = (m as unknown as { added_at: string; newsletter_subscribers: { id: string; email: string; first_name: string | null; last_name: string | null; contact_id: string | null; unsubscribed_at: string | null } }).newsletter_subscribers
        if (!s) continue
        rows.push({
          id: s.id,
          email: s.email,
          first_name: s.first_name,
          last_name: s.last_name,
          contact_id: s.contact_id,
          unsubscribed_at: s.unsubscribed_at,
          added_at: (m as { added_at: string }).added_at,
          contact_name: null,
        })
        if (s.contact_id) contactIds.push(s.contact_id)
      }

      // Fetch contact names in batch
      if (contactIds.length > 0) {
        const { data: contacts } = await supabase
          .from('contacts')
          .select('id, name, name_en, name_local')
          .in('id', [...new Set(contactIds)])
        const nameMap = new Map<string, string>()
        for (const c of contacts ?? []) {
          const n = (c as { name: string | null; name_en: string | null; name_local: string | null })
          nameMap.set((c as { id: string }).id, n.name || n.name_en || n.name_local || '')
        }
        for (const r of rows) {
          if (r.contact_id) r.contact_name = nameMap.get(r.contact_id) ?? null
        }
      }

      setSubs(rows)
      setLoading(false)
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const filtered = useMemo(() => {
    if (!search.trim()) return subs
    const q = search.toLowerCase()
    return subs.filter((s) =>
      s.email.toLowerCase().includes(q) ||
      s.first_name?.toLowerCase().includes(q) ||
      s.last_name?.toLowerCase().includes(q) ||
      s.contact_name?.toLowerCase().includes(q)
    )
  }, [subs, search])

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
  }

  if (!list) {
    return <div className="p-8 text-center text-gray-400">找不到名單</div>
  }

  const linkedCount = subs.filter((s) => s.contact_id).length
  const unsubCount = subs.filter((s) => s.unsubscribed_at).length

  return (
    <PermissionGate feature="newsletter">
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <Link href="/admin/newsletter/lists" className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
            <ArrowLeft size={18} />
          </Link>
          <Users size={22} className="text-blue-500" />
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{list.name}</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              <code className="font-mono">{list.key}</code>
              {list.description && <> · {list.description}</>}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3">
            <div className="text-xs text-gray-500 dark:text-gray-400">總訂閱者</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{subs.length}</div>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3">
            <div className="text-xs text-gray-500 dark:text-gray-400">已連結聯絡人</div>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{linkedCount}</div>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3">
            <div className="text-xs text-gray-500 dark:text-gray-400">已退訂</div>
            <div className="text-2xl font-bold text-red-500 dark:text-red-400">{unsubCount}</div>
          </div>
        </div>

        <div className="relative mb-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜尋 email、姓名、聯絡人名..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Email</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400 hidden sm:table-cell">姓名</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">CRM 聯絡人</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400 hidden md:table-cell">加入時間</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">狀態</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">{search ? '無符合搜尋結果' : '名單目前沒有訂閱者'}</td></tr>
              ) : filtered.map((s) => {
                const displayName = [s.first_name, s.last_name].filter(Boolean).join(' ').trim()
                return (
                  <tr key={s.id} className="border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                    <td className="px-4 py-3 text-gray-900 dark:text-gray-100">{s.email}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 hidden sm:table-cell">{displayName || '—'}</td>
                    <td className="px-4 py-3">
                      {s.contact_id ? (
                        <Link href={`/contacts/${s.contact_id}`} className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline">
                          <LinkIcon size={11} /> {s.contact_name || '已連結'}
                        </Link>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 hidden md:table-cell text-xs">
                      {new Date(s.added_at).toLocaleDateString('zh-TW')}
                    </td>
                    <td className="px-4 py-3">
                      {s.unsubscribed_at ? (
                        <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">已退訂</span>
                      ) : (
                        <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">訂閱中</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-gray-400 mt-3">顯示 {filtered.length} / {subs.length} 筆</p>
      </div>
    </PermissionGate>
  )
}
