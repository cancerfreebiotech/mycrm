'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { PermissionGate } from '@/components/PermissionGate'
import { Loader2, Send, Rss, Mail, Plus, Copy } from 'lucide-react'

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
}

export default function CampaignsIndexPage() {
  const supabase = createBrowserSupabaseClient()
  const router = useRouter()
  const [rows, setRows] = useState<CampaignRow[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null)

  async function createBlank() {
    setCreating(true)
    try {
      const res = await fetch('/api/newsletter/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '未命名電子報' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '建立失敗')
      router.push(`/admin/newsletter/quick-send/${data.id}`)
    } catch (e) {
      alert(e instanceof Error ? e.message : '建立失敗')
    } finally { setCreating(false) }
  }

  async function duplicate(id: string) {
    setDuplicatingId(id)
    try {
      const res = await fetch(`/api/newsletter/campaigns/${id}/duplicate`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '複製失敗')
      router.push(`/admin/newsletter/quick-send/${data.id}`)
    } catch (e) {
      alert(e instanceof Error ? e.message : '複製失敗')
    } finally { setDuplicatingId(null) }
  }

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('newsletter_campaigns')
        .select('id, title, subject, status, sent_at, sent_count, total_recipients, published_at, created_at, slug')
        .order('created_at', { ascending: false })
        .limit(50)
      setRows((data ?? []) as CampaignRow[])
      setLoading(false)
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
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">電子報</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">管理電子報草稿、寄送、發布到 RSS</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a href="/admin/newsletter/lists" className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
              收件名單管理 →
            </a>
            <button
              onClick={createBlank}
              disabled={creating}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              新增電子報
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 text-gray-400">目前沒有電子報</div>
        ) : (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">標題</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400 hidden sm:table-cell">主旨</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">狀態</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400 hidden md:table-cell">建立時間</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                    <td className="px-4 py-3">
                      <Link href={`/admin/newsletter/quick-send/${r.id}`} className="font-medium text-blue-600 dark:text-blue-400 hover:underline">
                        {r.title ?? '(未命名)'}
                      </Link>
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
                            <Rss size={10} /> 已發布
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 hidden md:table-cell text-xs">
                      {new Date(r.created_at).toLocaleDateString('zh-TW')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => duplicate(r.id)}
                          disabled={duplicatingId === r.id}
                          title="複製成新草稿"
                          className="text-xs px-2 py-1 border border-gray-200 dark:border-gray-700 rounded hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 disabled:opacity-50"
                        >
                          {duplicatingId === r.id ? <Loader2 size={12} className="animate-spin" /> : <Copy size={12} />}
                        </button>
                        <Link
                          href={`/admin/newsletter/quick-send/${r.id}`}
                          className="text-xs px-3 py-1 border border-gray-200 dark:border-gray-700 rounded hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
                        >
                          開啟
                        </Link>
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
