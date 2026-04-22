'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { PermissionGate } from '@/components/PermissionGate'
import { Loader2, Send, Rss, Mail } from 'lucide-react'

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
  const [rows, setRows] = useState<CampaignRow[]>([])
  const [loading, setLoading] = useState(true)

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
          <a href="/admin/newsletter" className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            舊版 Wizard / 訂閱管理 →
          </a>
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
                      <Link
                        href={`/admin/newsletter/quick-send/${r.id}`}
                        className="text-xs px-3 py-1 border border-gray-200 dark:border-gray-700 rounded hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
                      >
                        開啟
                      </Link>
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
