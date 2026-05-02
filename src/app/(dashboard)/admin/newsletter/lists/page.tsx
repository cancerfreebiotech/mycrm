'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { PermissionGate } from '@/components/PermissionGate'
import { Loader2, Users, ArrowLeft, Trash2, Pencil, Check, X, Download } from 'lucide-react'

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
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)

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

  function startEdit(r: ListRow) {
    setEditingId(r.id)
    setEditName(r.name)
    setEditDesc(r.description ?? '')
    setBanner(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditName('')
    setEditDesc('')
  }

  async function saveEdit(id: string) {
    if (!editName.trim()) {
      setBanner({ kind: 'err', msg: t('nameRequired') })
      return
    }
    setSavingId(id)
    setBanner(null)
    try {
      const res = await fetch(`/api/newsletter/lists/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim(), description: editDesc.trim() || null }),
      })
      const data = await res.json()
      if (!res.ok) {
        setBanner({ kind: 'err', msg: data.error ?? t('saveFailed') })
        return
      }
      setRows((prev) => prev.map((r) => r.id === id ? { ...r, name: data.list.name, description: data.list.description } : r))
      cancelEdit()
    } catch (e) {
      setBanner({ kind: 'err', msg: e instanceof Error ? e.message : t('saveFailed') })
    } finally {
      setSavingId(null)
    }
  }

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
                {rows.map((r) => {
                  const isEditing = editingId === r.id
                  return (
                  <tr key={r.id} className="border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <input
                          autoFocus
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveEdit(r.id)
                            if (e.key === 'Escape') cancelEdit()
                          }}
                          className="text-sm px-2 py-1 border border-blue-400 rounded bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full max-w-[260px]"
                        />
                      ) : (
                        <Link href={`/admin/newsletter/lists/${r.id}`} className="font-medium text-blue-600 dark:text-blue-400 hover:underline">
                          {r.name}
                        </Link>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 hidden sm:table-cell text-xs font-mono">{r.key}</td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{r.memberCount}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 hidden md:table-cell text-xs">
                      {isEditing ? (
                        <input
                          value={editDesc}
                          onChange={(e) => setEditDesc(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveEdit(r.id)
                            if (e.key === 'Escape') cancelEdit()
                          }}
                          placeholder={t('descriptionPlaceholder')}
                          className="text-xs px-2 py-1 border border-blue-400 rounded bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full max-w-[260px]"
                        />
                      ) : (
                        r.description ?? '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isEditing ? (
                        <div className="flex items-center gap-2 justify-end">
                          <button
                            onClick={() => saveEdit(r.id)}
                            disabled={savingId === r.id || !editName.trim()}
                            title={tc('save')}
                            className="text-green-600 hover:text-green-700 dark:text-green-400 disabled:opacity-40"
                          >
                            {savingId === r.id ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                          </button>
                          <button
                            onClick={cancelEdit}
                            disabled={savingId === r.id}
                            title={tc('cancel')}
                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-40"
                          >
                            <X size={15} />
                          </button>
                        </div>
                      ) : confirmId === r.id ? (
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
                        <div className="flex items-center gap-2 justify-end">
                          <a
                            href={`/api/newsletter/lists/${r.id}/export`}
                            title={t('exportHint')}
                            className="text-gray-400 hover:text-green-600 dark:hover:text-green-400"
                          >
                            <Download size={15} />
                          </a>
                          <button
                            onClick={() => startEdit(r)}
                            title={t('editHint')}
                            className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            onClick={() => setConfirmId(r.id)}
                            title={t('deleteHint')}
                            className="text-gray-400 hover:text-red-500 dark:hover:text-red-400"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PermissionGate>
  )
}
