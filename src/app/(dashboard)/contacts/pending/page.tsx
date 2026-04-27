'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Loader2, Check, RefreshCw, Trash2, GitMerge, ExternalLink, AlertCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'

type PendingStatus = 'pending' | 'processing' | 'done' | 'failed'

interface PendingRow {
  id: string
  data: Record<string, unknown>
  storage_path: string | null
  status: PendingStatus
  retry_count: number
  error_message: string | null
  created_at: string
  processed_at: string | null
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString()
}

export default function PendingReviewPage() {
  const t = useTranslations('pendingReview')
  const tc = useTranslations('common')
  const router = useRouter()
  const supabase = createBrowserSupabaseClient()
  const [rows, setRows] = useState<PendingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const fetchRows = useCallback(async () => {
    const { data } = await supabase
      .from('pending_contacts')
      .select('id, data, storage_path, status, retry_count, error_message, created_at, processed_at')
      .order('created_at', { ascending: false })
    setRows((data as unknown as PendingRow[]) ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchRows()
    // poll every 5s while any row is still pending/processing — auto-refresh as worker finishes
    const interval = setInterval(() => {
      setRows((prev) => {
        if (prev.some((r) => r.status === 'pending' || r.status === 'processing')) {
          fetchRows()
        }
        return prev
      })
    }, 5000)
    return () => clearInterval(interval)
  }, [fetchRows])

  async function callAction(id: string, action: 'save' | 'merge') {
    setBusyId(id)
    const res = await fetch(`/api/contacts-pending/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    setBusyId(null)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      alert(err.error ?? tc('error'))
      return
    }
    setRows((prev) => prev.filter((r) => r.id !== id))
    if (action === 'save') {
      const body = await res.json()
      if (body.contact_id) router.push(`/contacts/${body.contact_id}`)
    }
  }

  async function deleteRow(id: string) {
    if (!confirm(t('deleteConfirm'))) return
    setBusyId(id)
    const res = await fetch(`/api/contacts-pending/${id}`, { method: 'DELETE' })
    setBusyId(null)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      alert(err.error ?? tc('error'))
      return
    }
    setRows((prev) => prev.filter((r) => r.id !== id))
  }

  async function retryRow(id: string) {
    setBusyId(id)
    await supabase
      .from('pending_contacts')
      .update({ status: 'pending', retry_count: 0, error_message: null })
      .eq('id', id)
    setBusyId(null)
    fetchRows()
  }

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
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">{t('emptyHint')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <PendingCard
              key={r.id}
              row={r}
              busy={busyId === r.id}
              onSave={() => callAction(r.id, 'save')}
              onMerge={() => callAction(r.id, 'merge')}
              onDelete={() => deleteRow(r.id)}
              onRetry={() => retryRow(r.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function PendingCard({
  row,
  busy,
  onSave,
  onMerge,
  onDelete,
  onRetry,
}: {
  row: PendingRow
  busy: boolean
  onSave: () => void
  onMerge: () => void
  onDelete: () => void
  onRetry: () => void
}) {
  const t = useTranslations('pendingReview')
  const data = row.data ?? {}
  const cardImg = data.card_img_url as string | undefined
  const mergeTargetId = data._merge_target_id as string | undefined
  const mergeTargetName = data._merge_target_name as string | undefined

  const StatusBadge = (() => {
    const cls = 'inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded font-medium'
    switch (row.status) {
      case 'pending':
        return <span className={`${cls} bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400`}><Loader2 size={12} className="animate-spin" />{t('statusPending')}</span>
      case 'processing':
        return <span className={`${cls} bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400`}><Loader2 size={12} className="animate-spin" />{t('statusProcessing')}</span>
      case 'done':
        return <span className={`${cls} bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400`}><Check size={12} />{t('statusDone')}</span>
      case 'failed':
        return <span className={`${cls} bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400`}><AlertCircle size={12} />{t('statusFailed')}</span>
    }
  })()

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Image */}
        <div className="sm:w-40 shrink-0">
          {cardImg ? (
            <a href={cardImg} target="_blank" rel="noreferrer" className="block">
              <Image src={cardImg} alt="" width={160} height={108} className="rounded-lg border border-gray-200 dark:border-gray-700 object-cover w-full" />
            </a>
          ) : (
            <div className="aspect-[3/2] rounded-lg border border-dashed border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex items-center justify-center text-gray-400 text-xs">
              {row.status === 'pending' || row.status === 'processing' ? t('imagePendingOcr') : '—'}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            {StatusBadge}
            <span className="text-xs text-gray-400 dark:text-gray-500">{fmtDateTime(row.created_at)}</span>
          </div>

          {row.status === 'done' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <Field label={t('fieldName')} value={data.name as string | undefined} />
              <Field label={t('fieldCompany')} value={data.company as string | undefined} />
              <Field label={t('fieldJobTitle')} value={data.job_title as string | undefined} />
              <Field label={t('fieldEmail')} value={data.email as string | undefined} />
              <Field label={t('fieldPhone')} value={data.phone as string | undefined} />
              <Field label={t('fieldCountry')} value={data.country_code as string | undefined} />
            </div>
          )}

          {row.status === 'failed' && row.error_message && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-1 break-all">{row.error_message}</p>
          )}

          {/* Actions */}
          <div className="mt-3 flex flex-wrap gap-2">
            {row.status === 'done' && (
              <>
                <button
                  onClick={onSave}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 text-gray-50 transition-colors"
                >
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  {t('actionSave')}
                </button>
                {mergeTargetId && (
                  <button
                    onClick={onMerge}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-gray-50 transition-colors"
                  >
                    <GitMerge size={14} />
                    {t('actionMergeTo', { name: mergeTargetName ?? '' })}
                  </button>
                )}
              </>
            )}
            {row.status === 'failed' && (
              <button
                onClick={onRetry}
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-gray-50 transition-colors"
              >
                <RefreshCw size={14} />
                {t('actionRetry')}
              </button>
            )}
            <button
              onClick={onDelete}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              <Trash2 size={14} />
              {t('actionDelete')}
            </button>
            {cardImg && (
              <a
                href={cardImg}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <ExternalLink size={14} />
                {t('actionViewImage')}
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div className="flex gap-2 min-w-0">
      <span className="text-gray-400 dark:text-gray-500 shrink-0">{label}</span>
      <span className="text-gray-900 dark:text-gray-100 truncate">{value || '—'}</span>
    </div>
  )
}
