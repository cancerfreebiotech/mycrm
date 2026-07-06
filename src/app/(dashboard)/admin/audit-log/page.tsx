'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { ClipboardList, Loader2, RefreshCw, ChevronLeft, ChevronRight, Download, X } from 'lucide-react'

interface AdminAction {
  id: string
  actor_email: string
  action: string
  target: string | null
  detail: Record<string, unknown> | null
  created_at: string
}

const PAGE_SIZE = 20

// Known action keys — populates the action filter dropdown. Labels resolve via
// the `action.*` i18n namespace (falling back to the raw key when unlabelled).
const KNOWN_ACTIONS = [
  'reset_mfa',
  'set_telegram_id',
  'maintenance_toggle',
  'permanent_delete_contact',
  'permanent_delete_bulk',
  'mcp_token_create',
  'mcp_token_revoke',
  'email_recovery_apply',
  'hunter_config_change',
  'set_webhook',
  'notify_release',
  'contact_merge',
  'dsar_lookup',
  'set_status',
  'newsletter_send',
  'gdpr_export',
  'set_role',
  'set_features',
  'org_settings_change',
]

export default function AuditLogPage() {
  const t = useTranslations('adminAuditLog')
  const router = useRouter()
  const supabase = createBrowserSupabaseClient()
  const [rows, setRows] = useState<AdminAction[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [authChecked, setAuthChecked] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  // Filters
  const [actorInput, setActorInput] = useState('')
  const [actor, setActor] = useState('')
  const [action, setAction] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const hasFilters = !!(actor || action || fromDate || toDate)

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email) { router.push('/'); return }
      const { data: profile } = await supabase
        .from('users').select('role').eq('email', user.email).single()
      if (profile?.role !== 'super_admin') { router.push('/'); return }
      setAuthChecked(true)
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const buildParams = (p: number): URLSearchParams => {
    const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) })
    if (actor) params.set('actor', actor)
    if (action) params.set('action', action)
    if (fromDate) params.set('from', fromDate)
    if (toDate) params.set('to', toDate)
    return params
  }

  const load = async (p: number) => {
    setLoading(true)
    const res = await fetch(`/api/admin/audit-log?${buildParams(p).toString()}`)
    if (res.ok) {
      const data = await res.json()
      setRows((data.rows ?? []) as AdminAction[])
      setTotal(data.total ?? 0)
    } else {
      setRows([])
      setTotal(0)
    }
    setLoading(false)
  }

  useEffect(() => { if (authChecked) load(page) }, [authChecked, page, actor, action, fromDate, toDate])  // eslint-disable-line react-hooks/exhaustive-deps

  const applyActor = () => { setActor(actorInput.trim()); setPage(1) }

  const clearFilters = () => {
    setActorInput('')
    setActor('')
    setAction('')
    setFromDate('')
    setToDate('')
    setPage(1)
  }

  const exportCsv = () => {
    const params = new URLSearchParams()
    if (actor) params.set('actor', actor)
    if (action) params.set('action', action)
    if (fromDate) params.set('from', fromDate)
    if (toDate) params.set('to', toDate)
    params.set('format', 'csv')
    window.location.href = `/api/admin/audit-log?${params.toString()}`
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const actionLabel = (a: string): string =>
    t.has(`action.${a}`) ? t(`action.${a}` as string) : a

  if (!authChecked) {
    return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-gray-400" /></div>
  }

  const inputClass = 'text-base px-3 py-2.5 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40'

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <ClipboardList size={22} className="text-blue-500" />
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t('title')}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{t('description')}</p>
        </div>
        <button
          onClick={() => load(page)}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg font-medium disabled:opacity-60"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {t('refresh')}
        </button>
      </div>

      {/* Filter bar */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <input
          type="text"
          value={actorInput}
          onChange={(e) => setActorInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') applyActor() }}
          onBlur={applyActor}
          placeholder={t('filterActorPlaceholder')}
          className={`${inputClass} sm:w-56`}
        />
        <select
          value={action}
          onChange={(e) => { setAction(e.target.value); setPage(1) }}
          className={`${inputClass} sm:w-52`}
        >
          <option value="">{t('filterActionAll')}</option>
          {KNOWN_ACTIONS.map((a) => (
            <option key={a} value={a}>{actionLabel(a)}</option>
          ))}
        </select>
        <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
          {t('filterFrom')}
          <input
            type="date"
            value={fromDate}
            onChange={(e) => { setFromDate(e.target.value); setPage(1) }}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
          {t('filterTo')}
          <input
            type="date"
            value={toDate}
            onChange={(e) => { setToDate(e.target.value); setPage(1) }}
            className={inputClass}
          />
        </label>
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg font-medium"
          >
            <X size={14} /> {t('clearFilters')}
          </button>
        )}
        <button
          onClick={exportCsv}
          className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm bg-blue-600 hover:bg-blue-700 text-gray-50 rounded-lg font-medium sm:ml-auto"
        >
          <Download size={14} /> {t('exportCsv')}
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-gray-400" /></div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-gray-400">{t('empty')}</div>
      ) : (
        <>
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden overflow-x-auto">
            <table className="w-full text-sm min-w-[680px]">
              <thead className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">{t('colTime')}</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-400">{t('colActor')}</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-400">{t('colAction')}</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-400">{t('colTarget')}</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-400">{t('colDetail')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isExpanded = expanded === r.id
                  return (
                    <tr key={r.id} className="border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/30 align-top">
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-400 text-xs whitespace-nowrap">
                        {new Date(r.created_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                      </td>
                      <td className="px-3 py-2 text-gray-900 dark:text-gray-100 text-xs break-all">{r.actor_email}</td>
                      <td className="px-3 py-2 text-gray-900 dark:text-gray-100">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-xs font-medium">{actionLabel(r.action)}</span>
                      </td>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-400 text-xs font-mono break-all">{r.target ?? '—'}</td>
                      <td className="px-3 py-2 text-xs">
                        {r.detail ? (
                          <>
                            <button
                              onClick={() => setExpanded(isExpanded ? null : r.id)}
                              className="text-blue-600 dark:text-blue-400 hover:underline"
                            >
                              {isExpanded ? t('collapse') : t('expand')}
                            </button>
                            {isExpanded && (
                              <pre className="mt-2 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-200 p-2 rounded text-xs whitespace-pre-wrap break-words max-w-2xl overflow-x-auto">{JSON.stringify(r.detail, null, 2)}</pre>
                            )}
                          </>
                        ) : (
                          <span className="text-gray-400 dark:text-gray-500">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-4">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {t('pageInfo', { page, totalPages, total })}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="flex items-center gap-1 px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg font-medium disabled:opacity-40"
              >
                <ChevronLeft size={14} /> {t('prev')}
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
                className="flex items-center gap-1 px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg font-medium disabled:opacity-40"
              >
                {t('next')} <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
