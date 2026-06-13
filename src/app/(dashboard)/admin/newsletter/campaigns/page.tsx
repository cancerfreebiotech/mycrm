'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { PermissionGate } from '@/components/PermissionGate'
import { Loader2, Send, Rss, Mail, Plus, Copy, Wand2, Package, Pencil, Trash2 } from 'lucide-react'

interface CampaignRow {
  id: string
  title: string | null
  subject: string | null
  status: string
  sent_at: string | null
  sent_count: number | null
  total_recipients: number | null
  published_at: string | null
  created_at: string
  slug: string | null
  opened?: number
  clicked?: number
  recipients?: number
}

export default function CampaignsIndexPage() {
  const t = useTranslations('campaignsIndex')
  const supabase = createBrowserSupabaseClient()
  const router = useRouter()
  const [rows, setRows] = useState<CampaignRow[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [savingTitleId, setSavingTitleId] = useState<string | null>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)

  async function createBlank() {
    setCreating(true)
    try {
      const res = await fetch('/api/newsletter/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: t('defaultTitle') }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? t('createFailed'))
      router.push(`/admin/newsletter/quick-send/${data.id}`)
    } catch (e) {
      alert(e instanceof Error ? e.message : t('createFailed'))
    } finally { setCreating(false) }
  }

  async function saveTitle(id: string) {
    const title = editingTitle.trim()
    if (!title) { setEditingId(null); return }
    setSavingTitleId(id)
    try {
      const res = await fetch(`/api/newsletter/campaigns/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
      if (res.ok) setRows((prev) => prev.map((r) => r.id === id ? { ...r, title } : r))
    } finally {
      setSavingTitleId(null)
      setEditingId(null)
    }
  }

  async function deleteCampaign(id: string, title: string | null) {
    if (!confirm(t('confirmDelete', { title: title ?? t('untitled') }))) return
    const res = await fetch(`/api/newsletter/campaigns/${id}`, { method: 'DELETE' })
    if (res.ok) setRows((prev) => prev.filter((r) => r.id !== id))
    else alert((await res.json()).error ?? t('deleteFailed'))
  }

  async function duplicate(id: string) {
    setDuplicatingId(id)
    try {
      const res = await fetch(`/api/newsletter/campaigns/${id}/duplicate`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? t('duplicateFailed'))
      router.push(`/admin/newsletter/quick-send/${data.id}`)
    } catch (e) {
      alert(e instanceof Error ? e.message : t('duplicateFailed'))
    } finally { setDuplicatingId(null) }
  }

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('newsletter_campaigns')
        .select('id, title, subject, status, sent_at, sent_count, total_recipients, published_at, created_at, slug')
        .order('created_at', { ascending: false })
        .limit(50)
      const baseRows = (data ?? []) as CampaignRow[]
      setRows(baseRows)
      setLoading(false)
      // Merge in open/click engagement for sent campaigns (one RPC call)
      const sentIds = baseRows.filter((r) => r.sent_at).map((r) => r.id)
      if (sentIds.length > 0) {
        const { data: eng } = await supabase.rpc('get_campaign_engagement', { p_campaign_ids: sentIds })
        if (eng) {
          const byId = new Map((eng as { campaign_id: string; recipients: number; opened: number; clicked: number }[]).map((e) => [e.campaign_id, e]))
          setRows((prev) => prev.map((r) => {
            const e = byId.get(r.id)
            return e ? { ...r, recipients: e.recipients, opened: e.opened, clicked: e.clicked } : r
          }))
        }
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <PermissionGate feature="newsletter">
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <Mail size={22} className="text-blue-500" />
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t('title')}</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{t('subtitle')}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a href="/admin/newsletter/draft" className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
              {t('storyDraftLink')}
            </a>
            <a href="/admin/newsletter/lists" className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
              {t('listsLink')}
            </a>
            <Link
              href="/admin/newsletter/import"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700"
              title={t('skillImportTooltip')}
            >
              <Package size={14} />
              {t('skillImport')}
            </Link>
            <Link
              href="/admin/newsletter/ai-compose"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700"
            >
              <Wand2 size={14} />
              {t('aiCompose')}
            </Link>
            <button
              onClick={createBlank}
              disabled={creating}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
            >
              {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              {t('createBlank')}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 text-gray-400">{t('empty')}</div>
        ) : (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('colTitle')}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400 hidden sm:table-cell">{t('colSubject')}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('colStatus')}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400 hidden sm:table-cell">{t('colEngagement')}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400 hidden md:table-cell">{t('colCreatedAt')}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                    <td className="px-4 py-3">
                      {editingId === r.id ? (
                        <input
                          ref={titleInputRef}
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          onBlur={() => saveTitle(r.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); saveTitle(r.id) }
                            if (e.key === 'Escape') setEditingId(null)
                          }}
                          className="w-full text-sm px-2 py-1 border border-blue-400 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      ) : (
                        <div className="flex items-center gap-1.5 group">
                          <Link href={`/admin/newsletter/quick-send/${r.id}`} className="font-medium text-blue-600 dark:text-blue-400 hover:underline">
                            {r.title ?? t('untitledParen')}
                          </Link>
                          <button
                            onClick={() => { setEditingId(r.id); setEditingTitle(r.title ?? ''); setTimeout(() => titleInputRef.current?.select(), 0) }}
                            className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-opacity"
                            title={t('editTitle')}
                          >
                            <Pencil size={12} />
                          </button>
                          {savingTitleId === r.id && <Loader2 size={12} className="animate-spin text-gray-400" />}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 hidden sm:table-cell truncate max-w-[260px]">{r.subject ?? '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full w-fit ${
                          r.status === 'sent'
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                            : r.status === 'scheduled'
                            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                        }`}>
                          {r.status === 'sent' ? <Send size={10} /> : null}
                          {r.status}
                        </span>
                        {r.published_at && (
                          <span className="inline-flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400 w-fit">
                            <Rss size={10} /> {t('published')}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-xs">
                      {r.sent_at && r.opened !== undefined ? (
                        <div className="flex flex-col gap-0.5 text-gray-600 dark:text-gray-400">
                          <span title={t('engagementTooltip')}>
                            📤 {r.recipients ?? r.sent_count ?? 0}
                            {' · '}
                            <span className="text-green-700 dark:text-green-400">👁 {r.opened}{r.recipients ? ` (${Math.round((r.opened / r.recipients) * 100)}%)` : ''}</span>
                            {' · '}
                            <span className="text-blue-700 dark:text-blue-400">🔗 {r.clicked}</span>
                          </span>
                        </div>
                      ) : r.sent_at ? (
                        <span className="text-gray-400">{t('sentCount', { count: r.sent_count ?? 0 })}</span>
                      ) : (
                        <span className="text-gray-300 dark:text-gray-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 hidden md:table-cell text-xs">
                      {new Date(r.created_at).toLocaleDateString('zh-TW')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => duplicate(r.id)}
                          disabled={duplicatingId === r.id}
                          title={t('duplicateTooltip')}
                          className="text-xs px-2 py-1 border border-gray-200 dark:border-gray-700 rounded hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 disabled:opacity-50"
                        >
                          {duplicatingId === r.id ? <Loader2 size={12} className="animate-spin" /> : <Copy size={12} />}
                        </button>
                        <Link
                          href={`/admin/newsletter/quick-send/${r.id}`}
                          className="text-xs px-3 py-1 border border-gray-200 dark:border-gray-700 rounded hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
                        >
                          {t('open')}
                        </Link>
                        <button
                          onClick={() => deleteCampaign(r.id, r.title)}
                          title={t('delete')}
                          className="text-xs px-2 py-1 border border-red-200 dark:border-red-800 rounded hover:bg-red-50 dark:hover:bg-red-950/30 text-red-500 dark:text-red-400"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PermissionGate>
  )
}
