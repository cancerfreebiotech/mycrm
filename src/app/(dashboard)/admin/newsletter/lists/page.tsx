'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { PermissionGate } from '@/components/PermissionGate'
import { Loader2, Users, ArrowLeft, Trash2 } from 'lucide-react'

interface ListRow {
  id: string
  key: string
  name: string
  description: string | null
  created_at: string
  memberCount: number
}

export default function ListsIndexPage() {
  const supabase = createBrowserSupabaseClient()
  const t = useTranslations('newsletterLists')
  const tc = useTranslations('common')
  const [rows, setRows] = useState<ListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)

  useEffect(() => {
    (async () => {
      const { data: lists } = await supabase
        .from('newsletter_lists')
        .select('id, key, name, description, created_at')
        .order('created_at')
      const withCounts = await Promise.all(
        (lists ?? []).map(async (l) => {
          const { count } = await supabase
            .from('newsletter_subscriber_lists')
            .select('subscriber_id', { count: 'exact', head: true })
            .eq('list_id', l.id)
          return { ...l, memberCount: count ?? 0 } as ListRow
        })
      )
      setRows(withCounts)
      setLoading(false)
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function deleteList(id: string) {
    setDeletingId(id)
    setBanner(null)
    try {
      const res = await fetch(`/api/newsletter/lists/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) {
        setBanner({ kind: 'err', msg: data.error ?? t('deleteFailed') })
        return
      }
      setRows((prev) => prev.filter((r) => r.id !== id))
      setBanner({ kind: 'ok', msg: t('deleteOk', { cleared: data.cleared_from_campaigns ?? 0 }) })
    } catch (e) {
      setBanner({ kind: 'err', msg: e instanceof Error ? e.message : t('deleteFailed') })
    } finally {
      setDeletingId(null)
      setConfirmId(null)
    }
  }

  return (
    <PermissionGate feature="newsletter">
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/admin/newsletter/campaigns" className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
            <ArrowLeft size={18} />
          </Link>
          <Users size={22} className="text-blue-500" />
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">收件名單</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">電子報訂閱者群組</p>
          </div>
        </div>

        {banner && (
          <div className={`mb-4 px-3 py-2 rounded-lg text-sm ${
            banner.kind === 'ok'
              ? 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800'
              : 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'
          }`}>
            {banner.msg}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
        ) : (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">名稱</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400 hidden sm:table-cell">Key</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">訂閱者數</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400 hidden md:table-cell">說明</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                    <td className="px-4 py-3">
                      <Link href={`/admin/newsletter/lists/${r.id}`} className="font-medium text-blue-600 dark:text-blue-400 hover:underline">
                        {r.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 hidden sm:table-cell text-xs font-mono">{r.key}</td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{r.memberCount}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 hidden md:table-cell text-xs">{r.description ?? '—'}</td>
                    <td className="px-4 py-3 text-right">
                      {confirmId === r.id ? (
                        <div className="flex items-center gap-2 justify-end">
                          <span className="text-xs text-red-600 dark:text-red-400">{t('confirmDelete')}</span>
                          <button
                            onClick={() => deleteList(r.id)}
                            disabled={deletingId === r.id}
                            className="text-xs text-red-600 dark:text-red-400 hover:underline disabled:opacity-40"
                          >
                            {deletingId === r.id ? <Loader2 size={12} className="animate-spin inline" /> : tc('confirm')}
                          </button>
                          <button
                            onClick={() => setConfirmId(null)}
                            disabled={deletingId === r.id}
                            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-40"
                          >
                            {tc('cancel')}
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmId(r.id)}
                          title={t('deleteHint')}
                          className="text-gray-400 hover:text-red-500 dark:hover:text-red-400"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
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
