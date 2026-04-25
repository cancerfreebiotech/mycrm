'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { PermissionGate } from '@/components/PermissionGate'
import {
  Loader2, ArrowLeft, Users, Search, Link as LinkIcon,
  Plus, Trash2, ChevronUp, ChevronDown, ChevronsUpDown, X, RefreshCw,
} from 'lucide-react'

interface ListMeta {
  id: string
  key: string
  name: string
  description: string | null
}

type EmailStatus = 'bounced' | 'invalid' | 'unsubscribed' | 'deferred' | 'mailbox_full' | 'sender_blocked' | 'recipient_blocked' | null

interface SubscriberRow {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  contact_id: string | null
  unsubscribed_at: string | null
  added_at: string
  contact_name: string | null
  email_status: EmailStatus
}

interface ContactResult {
  id: string
  name: string | null
  name_en: string | null
  name_local: string | null
  email: string | null
  company: string | null
}

type SortCol = 'email' | 'contact' | 'added_at' | 'status'
type SortDir = 'asc' | 'desc'

function SortIcon({ col, active, dir }: { col: SortCol; active: SortCol; dir: SortDir }) {
  if (col !== active) return <ChevronsUpDown size={12} className="ml-1 text-gray-400 inline" />
  return dir === 'asc'
    ? <ChevronUp size={12} className="ml-1 text-blue-500 inline" />
    : <ChevronDown size={12} className="ml-1 text-blue-500 inline" />
}

export default function ListDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const supabase = createBrowserSupabaseClient()

  const [list, setList] = useState<ListMeta | null>(null)
  const [subs, setSubs] = useState<SubscriberRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortCol, setSortCol] = useState<SortCol>('added_at')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  // Add modal state
  const [showAdd, setShowAdd] = useState(false)
  const [contactSearch, setContactSearch] = useState('')
  const [contactResults, setContactResults] = useState<ContactResult[]>([])
  const [contactLoading, setContactLoading] = useState(false)
  const [addingId, setAddingId] = useState<string | null>(null)
  const [addError, setAddError] = useState<string | null>(null)

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Sync state
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)

  const loadList = useCallback(async () => {
    // Page through subscribers (default 1000-row Supabase REST limit not enough for big lists)
    const { data: listData } = await supabase
      .from('newsletter_lists').select('id, key, name, description').eq('id', id).maybeSingle()
    setList((listData ?? null) as ListMeta | null)

    type Mem = { added_at: string; newsletter_subscribers: { id: string; email: string; first_name: string | null; last_name: string | null; contact_id: string | null; unsubscribed_at: string | null } | null }
    const allMembers: Mem[] = []
    const PAGE = 1000
    let from = 0
    for (;;) {
      const { data, error } = await supabase
        .from('newsletter_subscriber_lists')
        .select('added_at, newsletter_subscribers(id, email, first_name, last_name, contact_id, unsubscribed_at)')
        .eq('list_id', id)
        .order('added_at', { ascending: false })
        .range(from, from + PAGE - 1)
      if (error || !data || data.length === 0) break
      allMembers.push(...(data as unknown as Mem[]))
      if (data.length < PAGE) break
      from += PAGE
    }
    const memberData = allMembers

    const rows: SubscriberRow[] = []
    const contactIds: string[] = []
    const emails: string[] = []
    for (const m of memberData ?? []) {
      const s = (m as unknown as { added_at: string; newsletter_subscribers: { id: string; email: string; first_name: string | null; last_name: string | null; contact_id: string | null; unsubscribed_at: string | null } }).newsletter_subscribers
      if (!s) continue
      rows.push({ id: s.id, email: s.email, first_name: s.first_name, last_name: s.last_name, contact_id: s.contact_id, unsubscribed_at: s.unsubscribed_at, added_at: (m as { added_at: string }).added_at, contact_name: null, email_status: null })
      if (s.contact_id) contactIds.push(s.contact_id)
      if (s.email) emails.push(s.email.toLowerCase().trim())
    }

    // Chunk contact lookups (Supabase REST default 1000-row limit + URL length cap on .in())
    const uniqueContactIds = [...new Set(contactIds)]
    const uniqueEmails = [...new Set(emails)]
    const CHUNK = 500
    const contactRows: { id: string; name: string | null; name_en: string | null; name_local: string | null; email_status: EmailStatus }[] = []
    for (let i = 0; i < uniqueContactIds.length; i += CHUNK) {
      const slice = uniqueContactIds.slice(i, i + CHUNK)
      const { data } = await supabase.from('contacts').select('id, name, name_en, name_local, email_status').in('id', slice)
      if (data) contactRows.push(...(data as typeof contactRows))
    }
    const blRows: { email: string; status: EmailStatus }[] = []
    for (let i = 0; i < uniqueEmails.length; i += CHUNK) {
      const slice = uniqueEmails.slice(i, i + CHUNK)
      const { data } = await supabase.from('newsletter_blacklist').select('email, status').in('email', slice)
      if (data) blRows.push(...(data as typeof blRows))
    }
    const unsubRows: { email: string }[] = []
    for (let i = 0; i < uniqueEmails.length; i += CHUNK) {
      const slice = uniqueEmails.slice(i, i + CHUNK)
      const { data } = await supabase.from('newsletter_unsubscribes').select('email').in('email', slice)
      if (data) unsubRows.push(...(data as typeof unsubRows))
    }

    const nameMap = new Map<string, string>()
    const statusByContact = new Map<string, EmailStatus>()
    for (const c of contactRows) {
      nameMap.set(c.id, c.name || c.name_en || c.name_local || '')
      statusByContact.set(c.id, c.email_status)
    }
    const blStatusMap = new Map<string, EmailStatus>()
    for (const r of blRows) {
      blStatusMap.set(r.email.toLowerCase().trim(), r.status)
    }
    const unsubSet = new Set(unsubRows.map((r) => r.email.toLowerCase().trim()))

    for (const r of rows) {
      if (r.contact_id) r.contact_name = nameMap.get(r.contact_id) ?? null
      const em = r.email.toLowerCase().trim()
      const contactStatus = r.contact_id ? statusByContact.get(r.contact_id) : null
      const blStatus = blStatusMap.get(em)
      // Priority: contact.email_status > blacklist.status > unsubscribe
      if (contactStatus) r.email_status = contactStatus
      else if (blStatus) r.email_status = blStatus
      else if (unsubSet.has(em) || r.unsubscribed_at) r.email_status = 'unsubscribed'
    }

    setSubs(rows)
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => { loadList() }, [loadList])

  // Debounced contact search
  useEffect(() => {
    if (!showAdd) return
    if (!contactSearch.trim()) { setContactResults([]); return }
    const timer = setTimeout(async () => {
      setContactLoading(true)
      const q = `%${contactSearch}%`
      const { data } = await supabase
        .from('contacts')
        .select('id, name, name_en, name_local, email, company')
        .is('deleted_at', null)
        .or(`name.ilike.${q},name_en.ilike.${q},email.ilike.${q}`)
        .order('name')
        .limit(20)
      setContactResults((data ?? []) as ContactResult[])
      setContactLoading(false)
    }, 300)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactSearch, showAdd])

  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortCol(col); setSortDir('asc') }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return q
      ? subs.filter((s) =>
          s.email.toLowerCase().includes(q) ||
          s.first_name?.toLowerCase().includes(q) ||
          s.last_name?.toLowerCase().includes(q) ||
          s.contact_name?.toLowerCase().includes(q)
        )
      : subs
  }, [subs, search])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0
      if (sortCol === 'email') cmp = a.email.localeCompare(b.email)
      else if (sortCol === 'contact') {
        const an = a.contact_name ?? ''
        const bn = b.contact_name ?? ''
        // Rows without a linked contact sort last in asc, first in desc
        if (!an && bn) cmp = 1
        else if (an && !bn) cmp = -1
        else cmp = an.localeCompare(bn)
      } else if (sortCol === 'added_at') cmp = a.added_at.localeCompare(b.added_at)
      else if (sortCol === 'status') {
        const order = (s: EmailStatus) =>
          s === null ? 0 :
          s === 'deferred' ? 1 :
          s === 'mailbox_full' ? 2 :
          s === 'sender_blocked' ? 3 :
          s === 'recipient_blocked' ? 4 :
          s === 'unsubscribed' ? 5 :
          s === 'invalid' ? 6 : 7
        cmp = order(a.email_status) - order(b.email_status)
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [filtered, sortCol, sortDir])

  async function handleAdd(contact: ContactResult) {
    if (!contact.email) { setAddError('此聯絡人沒有 email'); return }
    setAddingId(contact.id)
    setAddError(null)
    const res = await fetch('/api/newsletter/list-members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ list_id: id, contact_id: contact.id }),
    })
    const json = await res.json()
    if (!res.ok) { setAddError(json.error ?? '新增失敗'); setAddingId(null); return }
    setAddingId(null)
    setShowAdd(false)
    setContactSearch('')
    setContactResults([])
    setAddError(null)
    await loadList()
  }

  async function handleDelete(subscriberId: string) {
    if (!confirm('確定要將此人從名單移除？')) return
    setDeletingId(subscriberId)
    await fetch('/api/newsletter/list-members', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ list_id: id, subscriber_id: subscriberId }),
    })
    setDeletingId(null)
    await loadList()
  }

  async function handleSync() {
    setSyncing(true)
    setSyncMsg(null)
    try {
      const res = await fetch('/api/sendgrid/import-suppressions', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) { setSyncMsg(`同步失敗：${json.error ?? res.statusText}`); return }
      setSyncMsg(`同步完成：退信 ${json.bounces ?? 0} / 無效 ${json.invalidEmails ?? 0} / 退訂 ${json.unsubscribes ?? 0}`)
      await loadList()
    } catch (e) {
      setSyncMsg(`同步失敗：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSyncing(false)
      setTimeout(() => setSyncMsg(null), 6000)
    }
  }

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
  }
  if (!list) {
    return <div className="p-8 text-center text-gray-400">找不到名單</div>
  }

  const linkedCount = subs.filter((s) => s.contact_id).length
  const unsubCount = subs.filter((s) => s.email_status === 'unsubscribed').length
  const bouncedCount = subs.filter((s) => s.email_status === 'bounced' || s.email_status === 'invalid').length
  const pendingCount = subs.filter((s) =>
    s.email_status === 'deferred' || s.email_status === 'mailbox_full' ||
    s.email_status === 'sender_blocked' || s.email_status === 'recipient_blocked'
  ).length
  const activeCount = subs.filter((s) => s.email_status === null).length

  const thClass = 'text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400 cursor-pointer select-none hover:text-gray-900 dark:hover:text-gray-100 whitespace-nowrap'

  return (
    <PermissionGate feature="newsletter">
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <Link href="/admin/newsletter/lists" className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
            <ArrowLeft size={18} />
          </Link>
          <Users size={22} className="text-blue-500" />
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{list.name}</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              <code className="font-mono">{list.key}</code>
              {list.description && <> · {list.description}</>}
            </p>
          </div>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg font-medium disabled:opacity-60"
            title="從 SendGrid 同步退信/退訂狀態"
          >
            {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            同步 SendGrid
          </button>
          <button
            onClick={() => { setShowAdd(true); setContactSearch(''); setContactResults([]); setAddError(null) }}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
          >
            <Plus size={14} /> 新增聯絡人
          </button>
        </div>

        {syncMsg && (
          <div className="mb-3 text-sm px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
            {syncMsg}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3">
            <div className="text-xs text-gray-500 dark:text-gray-400">總訂閱者</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{subs.length}</div>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3">
            <div className="text-xs text-gray-500 dark:text-gray-400">已連結聯絡人</div>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{linkedCount}</div>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3">
            <div className="text-xs text-gray-500 dark:text-gray-400">可寄送</div>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">{activeCount}</div>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3">
            <div className="text-xs text-gray-500 dark:text-gray-400">退信 / 無效</div>
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">{bouncedCount}</div>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3">
            <div className="text-xs text-gray-500 dark:text-gray-400">待處理</div>
            <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400" title="暫時錯誤 / 信箱滿 / 寄件方問題 / 收件方擋信">{pendingCount}</div>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3">
            <div className="text-xs text-gray-500 dark:text-gray-400">已退訂</div>
            <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">{unsubCount}</div>
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

        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
                <th className={thClass} onClick={() => toggleSort('email')}>
                  Email <SortIcon col="email" active={sortCol} dir={sortDir} />
                </th>
                <th className={thClass} onClick={() => toggleSort('contact')}>
                  CRM 聯絡人 <SortIcon col="contact" active={sortCol} dir={sortDir} />
                </th>
                <th className={`${thClass} hidden md:table-cell`} onClick={() => toggleSort('added_at')}>
                  加入時間 <SortIcon col="added_at" active={sortCol} dir={sortDir} />
                </th>
                <th className={thClass} onClick={() => toggleSort('status')}>
                  狀態 <SortIcon col="status" active={sortCol} dir={sortDir} />
                </th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">{search ? '無符合搜尋結果' : '名單目前沒有訂閱者'}</td></tr>
              ) : sorted.map((s) => {
                return (
                  <tr key={s.id} className="border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                    <td className="px-4 py-3 text-gray-900 dark:text-gray-100">{s.email}</td>
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
                      {s.email_status === 'bounced' ? (
                        <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">退信</span>
                      ) : s.email_status === 'invalid' ? (
                        <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">無效</span>
                      ) : s.email_status === 'unsubscribed' ? (
                        <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400">已退訂</span>
                      ) : s.email_status === 'deferred' ? (
                        <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400" title="網路或對方伺服器暫時錯誤">暫時失敗</span>
                      ) : s.email_status === 'mailbox_full' ? (
                        <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400" title="對方信箱已滿">信箱滿</span>
                      ) : s.email_status === 'sender_blocked' ? (
                        <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400" title="寄件方認證/spam 問題">寄件擋</span>
                      ) : s.email_status === 'recipient_blocked' ? (
                        <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400" title="對方公司政策擋信">收件擋</span>
                      ) : (
                        <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">訂閱中</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleDelete(s.id)}
                        disabled={deletingId === s.id}
                        className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 dark:hover:text-red-400 disabled:opacity-40"
                        title="從名單移除"
                      >
                        {deletingId === s.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-gray-400 mt-3">顯示 {sorted.length} / {subs.length} 筆</p>
      </div>

      {/* Add Contact Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100 dark:border-gray-800">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100">新增聯絡人到名單</h2>
              <button
                onClick={() => setShowAdd(false)}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5">
              <div className="relative mb-3">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  autoFocus
                  type="text"
                  value={contactSearch}
                  onChange={(e) => setContactSearch(e.target.value)}
                  placeholder="搜尋聯絡人姓名或 email..."
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {addError && (
                <p className="mb-3 text-sm text-red-600 dark:text-red-400">{addError}</p>
              )}

              <div className="max-h-72 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
                {contactLoading ? (
                  <div className="flex justify-center py-8"><Loader2 size={18} className="animate-spin text-gray-400" /></div>
                ) : contactSearch.trim() === '' ? (
                  <p className="py-8 text-center text-sm text-gray-400">輸入姓名或 email 搜尋</p>
                ) : contactResults.length === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-400">找不到符合的聯絡人</p>
                ) : contactResults.map((c) => {
                  const displayName = c.name || c.name_en || c.name_local || '（無名）'
                  const alreadyIn = subs.some((s) => s.contact_id === c.id)
                  return (
                    <button
                      key={c.id}
                      disabled={!!alreadyIn || addingId === c.id || !c.email}
                      onClick={() => handleAdd(c)}
                      className="w-full text-left px-4 py-3 border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{displayName}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {c.email ?? <span className="text-red-400">無 email</span>}
                          {c.company && ` · ${c.company}`}
                        </div>
                      </div>
                      <div className="shrink-0 text-xs">
                        {alreadyIn ? (
                          <span className="text-gray-400">已在名單</span>
                        ) : addingId === c.id ? (
                          <Loader2 size={14} className="animate-spin text-blue-500" />
                        ) : (
                          <span className="text-blue-600 dark:text-blue-400">新增</span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </PermissionGate>
  )
}
