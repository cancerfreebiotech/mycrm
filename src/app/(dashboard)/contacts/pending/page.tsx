'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Loader2, Check, RefreshCw, Trash2, GitMerge, ExternalLink, AlertCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'

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

export default function PendingReviewPage() {
  const t = useTranslations('pendingReview')
  const tc = useTranslations('common')
  const router = useRouter()
  const supabase = createBrowserSupabaseClient()
  const [rows, setRows] = useState<PendingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [myUserId, setMyUserId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [uploaderFilter, setUploaderFilter] = useState<string>('all')
  const [rescueBusy, setRescueBusy] = useState(false)
  const [allTags, setAllTags] = useState<Tag[]>([])

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

  async function callAction(id: string, action: 'save' | 'merge', force = false) {
    setBusyId(id)
    const res = await fetch(`/api/contacts-pending/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, force }),
    })
    setBusyId(null)
    if (res.status === 409) {
      const err = await res.json().catch(() => ({}))
      const targetName = err.suggested_target_name ?? '已存在'
      const ok = confirm(t('duplicateConfirm', { name: targetName }))
      if (ok) callAction(id, action, true)
      return
    }
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

  // Inline-edit a field on the pending row's data jsonb (e.g., importance, language)
  async function patchData(id: string, patch: Record<string, unknown>) {
    const row = rows.find((r) => r.id === id)
    if (!row) return
    const newData = { ...row.data, ...patch }
    await supabase.from('pending_contacts').update({ data: newData }).eq('id', id)
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, data: newData } : r))
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
              onSave={() => callAction(r.id, 'save')}
              onMerge={() => callAction(r.id, 'merge')}
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

function PendingCard({
  row, isMine, busy, allTags,
  onSave, onMerge, onDelete, onRetry, onPatch,
}: {
  row: PendingRow
  isMine: boolean
  busy: boolean
  allTags: Tag[]
  onSave: () => void
  onMerge: () => void
  onDelete: () => void
  onRetry: () => void
  onPatch: (patch: Record<string, unknown>) => void
}) {
  const t = useTranslations('pendingReview')
  const data = row.data ?? {}
  // OCR sets data.card_img_url; before then, derive public URL from storage_path
  // so users see the thumbnail right away rather than a placeholder.
  const cardImgFromData = data.card_img_url as string | undefined
  const cardImg = cardImgFromData ?? (row.storage_path
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/cards/${row.storage_path}`
    : undefined)
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

          {(metAt || metDate) && (
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
              {metAt && <span className="mr-2">📍 {metAt}</span>}
              {metDate && <span>📅 {fmtDate(metDate)}</span>}
            </div>
          )}

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
                  {IMPORTANCES.map((v) => (
                    <button
                      key={v}
                      onClick={() => onPatch({ importance: importance === v ? null : v })}
                      className={`w-7 h-6 rounded border transition-colors ${
                        importance === v
                          ? 'bg-green-500 border-green-500 text-white'
                          : 'border-gray-200 dark:border-gray-700 text-gray-400 hover:border-green-400 hover:text-green-500'
                      }`}
                    >
                      {v === 'high' ? 'H' : v === 'low' ? 'L' : 'M'}
                    </button>
                  ))}
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
