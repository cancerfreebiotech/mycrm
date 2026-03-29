'use client'

import { useEffect, useState, useCallback } from 'react'
import { Trash2, RotateCcw, Loader2, AlertTriangle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'

interface TrashedContact {
  id: string
  name: string | null
  name_en: string | null
  company: string | null
  email: string | null
  deleted_at: string
  deleted_by_user: { display_name: string | null } | null
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('zh-TW', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function TrashPage() {
  const t = useTranslations('nav')
  const [contacts, setContacts] = useState<TrashedContact[]>([])
  const [loading, setLoading] = useState(true)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [actionId, setActionId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/contacts/trash')
    if (res.ok) {
      const data = await res.json()
      setContacts(data.contacts ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    const supabase = createBrowserSupabaseClient()
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return
      const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('email', session.user.email!)
        .single()
      if (profile?.role === 'super_admin') {
        setIsSuperAdmin(true)
        load()
      } else {
        setLoading(false)
      }
    })
  }, [load])

  async function handleRestore(id: string) {
    if (!confirm('確定要還原此聯絡人？')) return
    setActionId(id)
    const res = await fetch(`/api/contacts/${id}/restore`, { method: 'POST' })
    if (res.ok) {
      setContacts((prev) => prev.filter((c) => c.id !== id))
    } else {
      const body = await res.json()
      alert(body.error ?? '還原失敗')
    }
    setActionId(null)
  }

  async function handlePermanentDelete(id: string, name: string | null) {
    if (!confirm(`確定要永久刪除「${name || '此聯絡人'}」？此操作無法復原，相關名片圖片也會一併刪除。`)) return
    setActionId(id)
    const res = await fetch(`/api/contacts/${id}/permanent`, { method: 'DELETE' })
    if (res.ok) {
      setContacts((prev) => prev.filter((c) => c.id !== id))
    } else {
      const body = await res.json()
      alert(body.error ?? '永久刪除失敗')
    }
    setActionId(null)
  }

  if (!isSuperAdmin && !loading) {
    return (
      <div className="p-8 text-center text-gray-500 dark:text-gray-400">
        無權限存取此頁面
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Trash2 size={22} className="text-red-500" />
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">回收區</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            已移至回收區的聯絡人可以還原，或由 Super Admin 永久刪除
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={24} className="animate-spin text-gray-400" />
        </div>
      ) : contacts.length === 0 ? (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">
          <Trash2 size={40} className="mx-auto mb-3 opacity-30" />
          <p>回收區是空的</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          {/* Warning banner */}
          <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800 text-sm text-amber-700 dark:text-amber-400">
            <AlertTriangle size={14} />
            共 {contacts.length} 筆聯絡人在回收區。永久刪除後無法復原。
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">姓名</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400 hidden sm:table-cell">公司</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400 hidden md:table-cell">刪除者</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">刪除時間</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {contacts.map((contact) => {
                  const isActing = actionId === contact.id
                  const displayName = contact.name || contact.name_en || '（無姓名）'
                  return (
                    <tr
                      key={contact.id}
                      className="border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/30"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 dark:text-gray-100">{displayName}</div>
                        {contact.email && (
                          <div className="text-xs text-gray-400 mt-0.5">{contact.email}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400 hidden sm:table-cell">
                        {contact.company ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400 hidden md:table-cell">
                        {contact.deleted_by_user?.display_name ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">
                        {formatDate(contact.deleted_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 justify-end">
                          <button
                            onClick={() => handleRestore(contact.id)}
                            disabled={isActing}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 disabled:opacity-50"
                          >
                            {isActing ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                            還原
                          </button>
                          <button
                            onClick={() => handlePermanentDelete(contact.id, contact.name || contact.name_en)}
                            disabled={isActing}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 disabled:opacity-50"
                          >
                            {isActing ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                            永久刪除
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
