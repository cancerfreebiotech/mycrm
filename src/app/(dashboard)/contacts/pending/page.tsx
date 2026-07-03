'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import Image from 'next/image'
import { Loader2, Check, RefreshCw, Trash2, GitMerge, ExternalLink, AlertCircle, Search, X, CalendarCheck } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { signCardUrls } from '@/lib/cardImageUrl'

type PendingStatus = 'pending' | 'processing' | 'done' | 'failed'
type StatusFilter = 'all' | 'pending' | 'done' | 'failed'

interface UserRef { display_name: string | null; email: string }
interface Tag { id: string; name: string }
interface PendingRow {
  id: string
  data: Record<string, unknown>
  storage_path: string | null
  status: PendingStatus
  retry_count: number
  error_message: string | null
  created_at: string
  processed_at: string | null
  created_by: string | null
  users: UserRef | null
}

const LANGUAGES = ['chinese', 'japanese', 'english'] as const
type Language = typeof LANGUAGES[number]
const IMPORTANCES = ['high', 'medium', 'low'] as const
type Importance = typeof IMPORTANCES[number]

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString()
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString()
}

// OCR sets data.card_img_url; before then, derive public URL from storage_path
// so users see the thumbnail right away rather than a placeholder.
function deriveCardImg(row: PendingRow): string | undefined {
  const data = row.data ?? {}
  const fromData = data.card_img_url as string | undefined
  return fromData ?? (row.storage_path
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/cards/${row.storage_path}`
    : undefined)
}

export default function PendingReviewPage() {
  const t = useTranslations('pendingReview')
  const tc = useTranslations('common')
  const supabase = createBrowserSupabaseClient()
  const [rows, setRows] = useState<PendingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [myUserId, setMyUserId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [uploaderFilter, setUploaderFilter] = useState<string>('all')
  const [rescueBusy, setRescueBusy] = useState(false)
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [cardSignedUrls, setCardSignedUrls] = useState<Map<string, string>>(new Map())

  // cards bucket is private — batch-sign card thumbnails whenever the list changes
  useEffect(() => {
    const urls = rows.map(deriveCardImg).filter((u): u is string => !!u)
    if (urls.length === 0) { setCardSignedUrls(new Map()); return }
    let active = true
    signCardUrls(supabase, urls).then((m) => { if (active) setCardSignedUrls(m) })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows])

  // Load tags once for the picker
  useEffect(() => {
    supabase.from('tags').select('id, name').order('name').then(({ data }) => {
      setAllTags((data as Tag[] | null) ?? [])
    })
  }, [supabase])

  // Resolve own user.id (used to flag "this row is mine") via the users table by email
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email || cancelled) return
      const { data } = await supabase.from('users').select('id').eq('email', user.email).single()
      if (cancelled) return
      setMyUserId(data?.id ?? null)
    })()
    return () => { cancelled = true }
  }, [supabase])

  const fetchRows = useCallback(async () => {
    const { data } = await supabase
      .from('pending_contacts')
      .select('id, data, storage_path, status, retry_count, error_message, created_at, processed_at, created_by, users:created_by(display_name, email)')
      .order('created_at', { ascending: false })
    setRows((data as unknown as PendingRow[]) ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchRows()
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

  const uploaders = useMemo(() => {
    const map = new Map<string, UserRef>()
    for (const r of rows) {
      if (r.created_by && r.users) map.set(r.created_by, r.users)
    }
    return Array.from(map.entries()).map(([id, u]) => ({ id, ...u }))
  }, [rows])

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter !== 'all') {
        if (statusFilter === 'pending' && !(r.status === 'pending' || r.status === 'processing')) return false
        if (statusFilter === 'done' && r.status !== 'done') return false
        if (statusFilter === 'failed' && r.status !== 'failed') return false
      }
      if (uploaderFilter !== 'all' && r.created_by !== uploaderFilter) return false
      return true
    })
  }, [rows, statusFilter, uploaderFilter])

  async function callAction(id: string, action: 'save' | 'merge', opts: { force?: boolean; targetId?: string; mode?: 'fill' | 'replace' } = {}) {
    setBusyId(id)
    const res = await fetch(`/api/contacts-pending/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, force: opts.force, target_id: opts.targetId, mode: opts.mode }),
    })
    setBusyId(null)
    if (res.status === 409) {
      const err = await res.json().catch(() => ({}))
      const targetName = err.suggested_target_name ?? '已存在'
      const ok = confirm(t('duplicateConfirm', { name: targetName }))
      if (ok) callAction(id, action, { ...opts, force: true })
      return
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      alert(err.error ?? tc('error'))
      return
    }
    setRows((prev) => prev.filter((r) => r.id !== id))
    // Stay on this page after save/merge so user can review next pending row
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

  // Inline-edit a field on the pending row's data jsonb (e.g., importance, language)
  async function patchData(id: string, patch: Record<string, unknown>) {
    const row = rows.find((r) => r.id === id)
    if (!row) return
    const newData = { ...row.data, ...patch }
    await supabase.from('pending_contacts').update({ data: newData }).eq('id', id)
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, data: newData } : r))
  }

  // Batch met_at editor
  const [batchMetAt, setBatchMetAt] = useState('')
  const [batchMetDate, setBatchMetDate] = useState('')
  const [applyingBatch, setApplyingBatch] = useState(false)

  async function applyBatchMetAt() {
    if (!batchMetAt.trim() && !batchMetDate) return
    const targets = filteredRows.filter((r) => r.status === 'done')
    if (targets.length === 0) return
    setApplyingBatch(true)
    const patch: Record<string, unknown> = {}
    if (batchMetAt.trim()) patch.met_at = batchMetAt.trim()
    if (batchMetDate) patch.met_date = batchMetDate
    for (const r of targets) {
      const newData = { ...r.data, ...patch }
      await supabase.from('pending_contacts').update({ data: newData }).eq('id', r.id)
    }
    setRows((prev) => prev.map((r) =>
      targets.some((t) => t.id === r.id) ? { ...r, data: { ...r.data, ...patch } } : r
    ))
    setApplyingBatch(false)
  }

  const showUploaderFilter = uploaders.length > 1
  const stuckCount = rows.filter((r) =>
    (r.status === 'pending' || r.status === 'processing') &&
    (!myUserId || r.created_by === myUserId)
  ).length

  async function rescuePending() {
    setRescueBusy(true)
    const res = await fetch('/api/contacts-pending/rescue', { method: 'POST' })
    setRescueBusy(false)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      alert(body.error ?? tc('error'))
      return
    }
    alert(t('rescueQueued', { count: body.queued ?? 0 }))
    setTimeout(fetchRows, 3000)
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('title')}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('subtitle')}</p>
        </div>
        {stuckCount > 0 && (
          <button
            onClick={rescuePending}
            disabled={rescueBusy}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-gray-50 transition-colors"
            title={t('rescueHint')}
          >
            {rescueBusy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {t('rescueButton', { count: stuckCount })}
          </button>
        )}
      </div>

      {/* Filter toolbar */}
      {!loading && rows.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-4 items-center">
          <FilterDropdown
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as StatusFilter)}
            label={t('filterStatus')}
            options={[
              { value: 'all', label: t('filterAll') },
              { value: 'pending', label: t('statusPending') },
              { value: 'done', label: t('statusDone') },
              { value: 'failed', label: t('statusFailed') },
            ]}
          />
          {showUploaderFilter && (
            <FilterDropdown
              value={uploaderFilter}
              onChange={setUploaderFilter}
              label={t('filterUploader')}
              options={[
                { value: 'all', label: t('filterAll') },
                ...uploaders.map((u) => ({
                  value: u.id,
                  label: u.display_name ?? u.email,
                })),
              ]}
            />
          )}
          <span className="text-sm text-gray-500 dark:text-gray-400 ml-auto">
            {t('shownCount', { shown: filteredRows.length, total: rows.length })}
          </span>
        </div>
      )}

      {/* Batch met_at editor — shown when there are done rows */}
      {!loading && filteredRows.some((r) => r.status === 'done') && (
        <div className="flex flex-wrap items-center gap-2 mb-4 px-3 py-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40">
          <CalendarCheck size={14} className="text-amber-600 dark:text-amber-400 shrink-0" />
          <span className="text-xs text-amber-700 dark:text-amber-400 font-medium shrink-0">批次設定 Met at</span>
          <input
            type="text"
            value={batchMetAt}
            onChange={(e) => setBatchMetAt(e.target.value)}
            placeholder="活動 / 地點名稱"
            className="text-sm px-2 py-1 border border-amber-200 dark:border-amber-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-400 min-w-40"
          />
          <input
            type="date"
            value={batchMetDate}
            onChange={(e) => setBatchMetDate(e.target.value)}
            className="text-sm px-2 py-1 border border-amber-200 dark:border-amber-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          <button
            onClick={applyBatchMetAt}
            disabled={applyingBatch || (!batchMetAt.trim() && !batchMetDate)}
            className="flex items-center gap-1.5 px-3 py-1 text-xs bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded font-medium"
          >
            {applyingBatch ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            套用到全部 {filteredRows.filter((r) => r.status === 'done').length} 筆
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-gray-400">
          <Loader2 size={16} className="animate-spin" /> {tc('loading')}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 p-8 text-center">
          <p className="text-gray-500 dark:text-gray-400">{t('empty')}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">{t('emptyHint')}</p>
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 p-8 text-center">
          <p className="text-gray-500 dark:text-gray-400">{t('noMatchingRows')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRows.map((r) => (
            <PendingCard
              key={r.id}
              row={r}
              isMine={r.created_by === myUserId}
              busy={busyId === r.id}
              allTags={allTags}
              cardSignedUrls={cardSignedUrls}
              onSave={() => callAction(r.id, 'save')}
              onMerge={(mode) => callAction(r.id, 'merge', { mode })}
              onMergeManual={(targetId, mode) => callAction(r.id, 'merge', { targetId, mode })}
              onDelete={() => deleteRow(r.id)}
              onRetry={() => retryRow(r.id)}
              onPatch={(patch) => patchData(r.id, patch)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function FilterDropdown({
  value, onChange, label, options,
}: {
  value: string
  onChange: (v: string) => void
  label: string
  options: Array<{ value: string; label: string }>
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2 py-1 text-sm"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  )
}

interface ContactSearchResult { id: string; name: string | null; name_en: string | null; company: string | null; email: string | null }

function PendingCard({
  row, isMine, busy, allTags, cardSignedUrls,
  onSave, onMerge, onMergeManual, onDelete, onRetry, onPatch,
}: {
  row: PendingRow
  isMine: boolean
  busy: boolean
  allTags: Tag[]
  cardSignedUrls: Map<string, string>
  onSave: () => void
  onMerge: (mode: 'fill' | 'replace') => void
  onMergeManual: (targetId: string, mode: 'fill' | 'replace') => void
  onDelete: () => void
  onRetry: () => void
  onPatch: (patch: Record<string, unknown>) => void
}) {
  const t = useTranslations('pendingReview')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerQuery, setPickerQuery] = useState('')
  const [pickerResults, setPickerResults] = useState<ContactSearchResult[]>([])
  const [pickerSearching, setPickerSearching] = useState(false)
  const [pickerMode, setPickerMode] = useState<'fill' | 'replace'>('fill')

  // Debounced search when picker is open
  useEffect(() => {
    if (!pickerOpen) return
    const q = pickerQuery.trim()
    if (q.length < 1) { setPickerResults([]); return }
    let cancelled = false
    const handle = setTimeout(async () => {
      setPickerSearching(true)
      try {
        const res = await fetch(`/api/contacts/search?q=${encodeURIComponent(q)}`)
        const body = await res.json()
        if (!cancelled) setPickerResults((body.results ?? []) as ContactSearchResult[])
      } finally {
        if (!cancelled) setPickerSearching(false)
      }
    }, 250)
    return () => { cancelled = true; clearTimeout(handle) }
  }, [pickerQuery, pickerOpen])
  const data = row.data ?? {}
  // cards bucket is private: resolve the public-form URL to its signed URL (fall back to original)
  const cardImgRaw = deriveCardImg(row)
  const cardImg = cardImgRaw ? (cardSignedUrls.get(cardImgRaw) ?? cardImgRaw) : undefined
  const mergeTargetId = data._merge_target_id as string | undefined
  const mergeTargetName = data._merge_target_name as string | undefined
  const batchDupOfId = data._batch_dup_of_id as string | undefined
  const batchDupOfName = data._batch_dup_of_name as string | undefined
  const importance = (data.importance as Importance | null | undefined) ?? null
  const language = (data.language as Language | null | undefined) ?? null
  const tagIds = (data._tag_ids as string[] | undefined) ?? []
  const metAt = data.met_at as string | undefined
  const metDate = data.met_date as string | undefined

  function toggleTag(tagId: string) {
    const next = tagIds.includes(tagId) ? tagIds.filter((id) => id !== tagId) : [...tagIds, tagId]
    onPatch({ _tag_ids: next })
  }

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

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            {StatusBadge}
            <span className="text-xs text-gray-400 dark:text-gray-500">{fmtDateTime(row.created_at)}</span>
            {!isMine && row.users && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                {t('uploadedBy', { name: row.users.display_name ?? row.users.email })}
              </span>
            )}
          </div>

          {row.status === 'done' ? (
            <div className="flex flex-wrap items-center gap-2 mb-2 text-xs">
              <input
                type="text"
                value={metAt ?? ''}
                onChange={(e) => onPatch({ met_at: e.target.value || null })}
                placeholder="📍 活動 / 地點"
                className="px-2 py-0.5 border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-400 min-w-36 text-xs"
              />
              <input
                type="date"
                value={metDate ?? ''}
                onChange={(e) => onPatch({ met_date: e.target.value || null })}
                className="px-2 py-0.5 border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-400 text-xs"
              />
            </div>
          ) : (metAt || metDate) ? (
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
              {metAt && <span className="mr-2">📍 {metAt}</span>}
              {metDate && <span>📅 {fmtDate(metDate)}</span>}
            </div>
          ) : null}

          {row.status === 'done' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <Field label={t('fieldName')} value={data.name as string | undefined} />
                <Field label={t('fieldCompany')} value={data.company as string | undefined} />
                <Field label={t('fieldJobTitle')} value={data.job_title as string | undefined} />
                <Field label={t('fieldEmail')} value={data.email as string | undefined} />
                <Field label={t('fieldPhone')} value={data.phone as string | undefined} />
                <Field label={t('fieldCountry')} value={data.country_code as string | undefined} />
              </div>

              {/* Inline edit: importance + language */}
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="text-gray-500 dark:text-gray-400">{t('fieldImportance')}</span>
                  {IMPORTANCES.map((v) => {
                    // Default to 'medium' visually if user hasn't picked yet
                    const effective = importance ?? 'medium'
                    return (
                      <button
                        key={v}
                        onClick={() => onPatch({ importance: v })}
                        className={`w-7 h-6 rounded border transition-colors ${
                          effective === v
                            ? 'bg-green-500 border-green-500 text-white'
                            : 'border-gray-200 dark:border-gray-700 text-gray-400 hover:border-green-400 hover:text-green-500'
                        }`}
                      >
                        {v === 'high' ? 'H' : v === 'low' ? 'L' : 'M'}
                      </button>
                    )
                  })}
                </div>
                <label className="flex items-center gap-1.5">
                  <span className="text-gray-500 dark:text-gray-400">{t('fieldLanguage')}</span>
                  <select
                    value={language ?? ''}
                    onChange={(e) => onPatch({ language: e.target.value || null })}
                    className="rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2 py-0.5 text-xs"
                  >
                    <option value="">—</option>
                    <option value="chinese">{t('languageChinese')}</option>
                    <option value="japanese">{t('languageJapanese')}</option>
                    <option value="english">{t('languageEnglish')}</option>
                  </select>
                </label>
              </div>

              {/* Tag picker */}
              {allTags.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">{t('fieldTags')}</span>
                  {allTags.map((tag) => {
                    const selected = tagIds.includes(tag.id)
                    return (
                      <button
                        key={tag.id}
                        onClick={() => toggleTag(tag.id)}
                        className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${
                          selected
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'text-gray-500 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:border-blue-400'
                        }`}
                      >
                        {tag.name}
                      </button>
                    )
                  })}
                </div>
              )}
            </>
          )}

          {row.status === 'failed' && row.error_message && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-1 break-all">{row.error_message}</p>
          )}

          {row.status === 'done' && batchDupOfId && (
            <div className="mt-2 px-2 py-1.5 rounded bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800/40 text-xs text-orange-700 dark:text-orange-400">
              ⚠️ {t('batchDupWarning', { name: batchDupOfName ?? '' })}
            </div>
          )}

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
                  <>
                    <button
                      onClick={() => onMerge('fill')}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-gray-50 transition-colors"
                      title={t('actionMergeFillHint')}
                    >
                      <GitMerge size={14} />
                      {t('actionMergeTo', { name: mergeTargetName ?? '' })}
                    </button>
                    <button
                      onClick={() => onMerge('replace')}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-gray-50 transition-colors"
                      title={t('actionMergeReplaceHint')}
                    >
                      <RefreshCw size={14} />
                      {t('actionMergeReplaceTo', { name: mergeTargetName ?? '' })}
                    </button>
                    <a
                      href={`/contacts/${mergeTargetId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
                      title={t('actionViewContact')}
                    >
                      <ExternalLink size={14} />
                      {t('actionViewContact')}
                    </a>
                  </>
                )}
                <button
                  onClick={() => setPickerOpen((v) => !v)}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
                >
                  <Search size={14} />
                  {t('actionMergeManual')}
                </button>
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

          {/* Manual merge picker */}
          {pickerOpen && row.status === 'done' && (
            <div className="mt-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3">
              <div className="flex items-center gap-2 mb-2">
                <Search size={14} className="text-gray-400" />
                <input
                  type="text"
                  autoFocus
                  value={pickerQuery}
                  onChange={(e) => setPickerQuery(e.target.value)}
                  placeholder={t('mergePickerPlaceholder')}
                  className="flex-1 bg-transparent text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none"
                />
                <button
                  onClick={() => { setPickerOpen(false); setPickerQuery(''); setPickerResults([]) }}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <X size={14} />
                </button>
              </div>
              {/* Mode toggle: fill vs replace, applied to whichever result is clicked */}
              <div className="flex items-center gap-2 mb-2 text-xs">
                <span className="text-gray-500 dark:text-gray-400">{t('mergePickerModeLabel')}</span>
                <button
                  onClick={() => setPickerMode('fill')}
                  className={`px-2 py-0.5 rounded border transition-colors ${
                    pickerMode === 'fill'
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400'
                  }`}
                >
                  {t('mergePickerModeFill')}
                </button>
                <button
                  onClick={() => setPickerMode('replace')}
                  className={`px-2 py-0.5 rounded border transition-colors ${
                    pickerMode === 'replace'
                      ? 'bg-orange-600 border-orange-600 text-white'
                      : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400'
                  }`}
                >
                  {t('mergePickerModeReplace')}
                </button>
              </div>
              {pickerSearching && (
                <div className="flex items-center gap-2 text-xs text-gray-400 px-1">
                  <Loader2 size={12} className="animate-spin" /> {t('mergePickerSearching')}
                </div>
              )}
              {!pickerSearching && pickerQuery.trim().length > 0 && pickerResults.length === 0 && (
                <p className="text-xs text-gray-400 px-1">{t('mergePickerNoResults')}</p>
              )}
              {pickerResults.length > 0 && (
                <ul className="divide-y divide-gray-200 dark:divide-gray-700 max-h-60 overflow-y-auto">
                  {pickerResults.map((c) => (
                    <li key={c.id} className="flex items-center">
                      <button
                        onClick={() => onMergeManual(c.id, pickerMode)}
                        disabled={busy}
                        className="flex-1 min-w-0 text-left px-2 py-1.5 text-sm hover:bg-white dark:hover:bg-gray-900 disabled:opacity-50 transition-colors"
                      >
                        <span className="font-medium text-gray-900 dark:text-gray-100">{c.name ?? c.name_en ?? '—'}</span>
                        {c.company && <span className="text-gray-500 dark:text-gray-400 ml-2">{c.company}</span>}
                        {c.email && <span className="text-gray-400 dark:text-gray-500 ml-2 text-xs">{c.email}</span>}
                      </button>
                      <a
                        href={`/contacts/${c.id}`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="shrink-0 p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
                        title={t('actionViewContact')}
                      >
                        <ExternalLink size={14} />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
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
