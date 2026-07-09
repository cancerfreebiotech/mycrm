'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { PermissionGate } from '@/components/PermissionGate'
import { isImeComposing } from '@/lib/imeGuard'
import { Loader2, Users, ArrowLeft, Trash2, Pencil, Check, X, Download, Upload } from 'lucide-react'

interface ImportStats {
  total: number
  imported: number
  duplicates_in_csv: number
  invalid_format: number
  bounced: number
  unsubscribed: number
}

interface ImportResult {
  list_id: string
  list_key: string
  list_name: string
  stats: ImportStats
}

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
  const [importOpen, setImportOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [importErr, setImportErr] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  function openImport() {
    setImportOpen(true)
    setImportResult(null)
    setImportErr(null)
    setImporting(false)
  }

  function closeImport() {
    setImportOpen(false)
    setImporting(false)
    if (importResult) {
      // Refresh list table after a successful import
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
      })()
    }
    setImportResult(null)
    setImportErr(null)
  }

  async function handleFileChosen(file: File) {
    setImporting(true)
    setImportErr(null)
    setImportResult(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/newsletter/lists/import-csv', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) {
        if (data.error === 'csv_headers') setImportErr(t('importErrHeaders'))
        else if (data.error === 'csv_empty') setImportErr(t('importErrEmpty'))
        else setImportErr(data.error ?? t('importErrGeneric'))
        return
      }
      setImportResult(data as ImportResult)
    } catch (e) {
      setImportErr(e instanceof Error ? e.message : t('importErrGeneric'))
    } finally {
      setImporting(false)
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
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">收件名單</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">電子報訂閱者群組</p>
          </div>
          <button
            onClick={openImport}
            className="min-h-[44px] inline-flex items-center gap-2 px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            <Upload size={16} />
            <span>{t('importButton')}</span>
          </button>
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
                            if (e.key === 'Enter' && !isImeComposing(e)) saveEdit(r.id)
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
                            if (e.key === 'Enter' && !isImeComposing(e)) saveEdit(r.id)
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

        {importOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={(e) => { if (e.target === e.currentTarget && !importing) closeImport() }}
          >
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 w-full max-w-md p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{t('importModalTitle')}</h2>
                <button
                  onClick={closeImport}
                  disabled={importing}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-40"
                >
                  <X size={18} />
                </button>
              </div>

              {!importResult && !importErr && (
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">{t('importPrompt')}</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    disabled={importing}
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) handleFileChosen(f)
                    }}
                    className="block w-full text-sm text-gray-700 dark:text-gray-300 file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-blue-50 dark:file:bg-blue-950/40 file:text-blue-700 dark:file:text-blue-300 hover:file:bg-blue-100 dark:hover:file:bg-blue-950/60"
                  />
                  {importing && (
                    <div className="mt-4 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <Loader2 size={14} className="animate-spin" />
                      <span>{t('importUploading')}</span>
                    </div>
                  )}
                </div>
              )}

              {importErr && (
                <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
                  {importErr}
                </div>
              )}

              {importResult && (
                <div className="space-y-3 text-sm">
                  <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2 text-green-800 dark:text-green-300">
                    {t('importCreatedMsg', { name: importResult.list_name })}
                  </div>
                  <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-3">
                    <div className="font-medium text-gray-900 dark:text-gray-100 mb-2">{t('importStatsHeader')}</div>
                    <dl className="space-y-1 text-gray-700 dark:text-gray-300">
                      <div className="flex justify-between"><dt>{t('importStatsTotal')}</dt><dd className="font-mono">{importResult.stats.total}</dd></div>
                      <div className="flex justify-between text-green-700 dark:text-green-400"><dt>{t('importStatsImported')}</dt><dd className="font-mono">{importResult.stats.imported}</dd></div>
                      {(importResult.stats.invalid_format > 0 || importResult.stats.duplicates_in_csv > 0) && (
                        <div className="pt-2 mt-2 border-t border-gray-100 dark:border-gray-800 text-amber-700 dark:text-amber-400">
                          <div className="flex justify-between"><dt>{t('importStatsSkipped')}</dt><dd className="font-mono">{importResult.stats.invalid_format + importResult.stats.duplicates_in_csv}</dd></div>
                          <div className="flex justify-between pl-3 text-xs"><dt>{t('importStatsInvalidFormat')}</dt><dd className="font-mono">{importResult.stats.invalid_format}</dd></div>
                          <div className="flex justify-between pl-3 text-xs"><dt>{t('importStatsDuplicates')}</dt><dd className="font-mono">{importResult.stats.duplicates_in_csv}</dd></div>
                        </div>
                      )}
                      {(importResult.stats.bounced > 0 || importResult.stats.unsubscribed > 0) && (
                        <div className="pt-2 mt-2 border-t border-gray-100 dark:border-gray-800">
                          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t('importStatsNoteHeader')}</div>
                          <div className="flex justify-between pl-3 text-xs text-orange-700 dark:text-orange-400"><dt>{t('importStatsBounced')}</dt><dd className="font-mono">{importResult.stats.bounced}</dd></div>
                          <div className="flex justify-between pl-3 text-xs text-orange-700 dark:text-orange-400"><dt>{t('importStatsUnsubscribed')}</dt><dd className="font-mono">{importResult.stats.unsubscribed}</dd></div>
                        </div>
                      )}
                    </dl>
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={closeImport}
                      className="min-h-[44px] px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
                    >
                      {t('importClose')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </PermissionGate>
  )
}
