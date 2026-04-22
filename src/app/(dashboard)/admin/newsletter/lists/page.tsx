'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { PermissionGate } from '@/components/PermissionGate'
import { Loader2, Users, ArrowLeft } from 'lucide-react'

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
  const [rows, setRows] = useState<ListRow[]>([])
  const [loading, setLoading] = useState(true)

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
