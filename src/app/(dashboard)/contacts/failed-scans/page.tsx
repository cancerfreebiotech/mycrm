'use client'

import { useEffect, useState, useCallback } from 'react'
import Image from 'next/image'
import { Loader2, Trash2, ExternalLink } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'

interface FailedScan {
  id: string
  storage_path: string
  card_img_url: string
  created_at: string
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString()
}

export default function MyFailedScansPage() {
  const t = useTranslations('myFailedScans')
  const tc = useTranslations('common')
  const supabase = createBrowserSupabaseClient()
  const [rows, setRows] = useState<FailedScan[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)

  const fetchRows = useCallback(async () => {
    const { data } = await supabase
      .from('failed_scans')
      .select('id, storage_path, card_img_url, created_at')
      .order('created_at', { ascending: false })
    setRows((data as unknown as FailedScan[]) ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { fetchRows() }, [fetchRows])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === rows.length) setSelected(new Set())
    else setSelected(new Set(rows.map((r) => r.id)))
  }

  async function deleteRow(row: FailedScan) {
    if (!confirm(t('deleteConfirm'))) return
    setBusyId(row.id)
    if (row.storage_path) {
      await supabase.storage.from('cards').remove([row.storage_path])
    }
    await supabase.from('failed_scans').delete().eq('id', row.id)
    setBusyId(null)
    setRows((prev) => prev.filter((r) => r.id !== row.id))
    setSelected((prev) => {
      const next = new Set(prev)
      next.delete(row.id)
      return next
    })
  }

  async function bulkDelete() {
    if (selected.size === 0) return
    if (!confirm(t('bulkDeleteConfirm', { count: selected.size }))) return
    setBulkBusy(true)
    const ids = Array.from(selected)
    const targets = rows.filter((r) => selected.has(r.id))
    const paths = targets.map((r) => r.storage_path).filter(Boolean) as string[]
    if (paths.length > 0) {
      await supabase.storage.from('cards').remove(paths)
    }
    await supabase.from('failed_scans').delete().in('id', ids)
    setRows((prev) => prev.filter((r) => !selected.has(r.id)))
    setSelected(new Set())
    setBulkBusy(false)
  }

  const allSelected = rows.length > 0 && selected.size === rows.length

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('title')}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('subtitle')}</p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-400">
          <Loader2 size={16} className="animate-spin" /> {tc('loading')}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 p-8 text-center">
          <p className="text-gray-500 dark:text-gray-400">{t('empty')}</p>
        </div>
      ) : (
        <>
          {/* Bulk toolbar */}
          <div className="flex items-center gap-3 mb-3 px-1">
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded" />
              {allSelected ? t('deselectAll') : t('selectAll')}
            </label>
            {selected.size > 0 && (
              <>
                <span className="text-sm text-gray-500 dark:text-gray-400">{t('selectedCount', { count: selected.size })}</span>
                <button
                  onClick={bulkDelete}
                  disabled={bulkBusy}
                  className="inline-flex items-center gap-1.5 px-3 py-1 text-sm rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-gray-50 transition-colors"
                >
                  {bulkBusy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  {t('bulkDelete')}
                </button>
              </>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {rows.map((r) => {
              const isSelected = selected.has(r.id)
              return (
                <div
                  key={r.id}
                  className={`bg-white dark:bg-gray-900 rounded-xl border overflow-hidden transition-colors ${
                    isSelected
                      ? 'border-blue-500 dark:border-blue-400 ring-2 ring-blue-500/20'
                      : 'border-gray-200 dark:border-gray-700'
                  }`}
                >
                  <div className="relative">
                    <a href={r.card_img_url} target="_blank" rel="noreferrer" className="block aspect-[3/2] bg-gray-100 dark:bg-gray-800 relative">
                      <Image src={r.card_img_url} alt="" fill sizes="(max-width: 640px) 100vw, 33vw" className="object-cover" />
                    </a>
                    <label className="absolute top-2 left-2 bg-white/90 dark:bg-gray-900/90 rounded p-1.5 cursor-pointer">
                      <input type="checkbox" checked={isSelected} onChange={() => toggle(r.id)} className="rounded" />
                    </label>
                  </div>
                  <div className="p-3 flex items-center justify-between gap-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400">{fmtDateTime(r.created_at)}</span>
                    <div className="flex gap-1">
                      <a
                        href={r.card_img_url}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded transition-colors"
                        title={t('actionViewImage')}
                      >
                        <ExternalLink size={14} />
                      </a>
                      <button
                        onClick={() => deleteRow(r)}
                        disabled={busyId === r.id || bulkBusy}
                        className="p-1.5 text-red-500 hover:text-red-700 disabled:opacity-50 rounded transition-colors"
                        title={t('actionDelete')}
                      >
                        {busyId === r.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
