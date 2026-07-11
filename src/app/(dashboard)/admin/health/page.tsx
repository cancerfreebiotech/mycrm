'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  Activity, Loader2, RefreshCw, CheckCircle2, XCircle, MinusCircle,
  Database, Cpu, Send, Bot, Zap, Search, Key,
  Clock, Inbox, BarChart3, ChevronDown, RotateCcw, ExternalLink, AlertTriangle
} from 'lucide-react'
import { useTranslations, useFormatter } from 'next-intl'
import type { ServiceStatus } from '@/app/api/health-check/route'

const SERVICE_ICONS: Record<string, React.ReactNode> = {
  'Supabase': <Database size={18} />,
  'Gemini': <Cpu size={18} />,
  'Telegram Bot': <Bot size={18} />,
  'SendGrid': <Send size={18} />,
  'Teams Bot': <Zap size={18} />,
}

interface HunterStats {
  totalNoEmail: number
  neverSearched: number
  searchedNotFound: number
  searchedThisMonth: number
  pendingCount: number
  hasApiKey: boolean
  credits: { used: number; available: number } | null
}

interface HealthResult {
  ok: boolean
  checkedAt: string
  services: ServiceStatus[]
}

interface CronJob {
  job: string
  last_status: 'ok' | 'error' | null
  last_finished_at: string | null
  duration_ms: number | null
  overdue: boolean
  expected_interval_min: number
}

interface CronHealthData {
  jobs: CronJob[]
}

interface DeadLetterTable {
  table: string
  failed: number
  recent: Array<{ id: string; error: string | null; at: string | null; meta?: string }>
}

interface DeadLettersData {
  tables: DeadLetterTable[]
}

interface UsageData {
  period: string
  metrics: Record<string, number>
  previous: { period: string; metrics: Record<string, number> }
  limits: Record<string, number>
}

type SectionState = 'loading' | 'error' | 'ready'

function StatusBadge({ status }: { status: ServiceStatus['status'] }) {
  const t = useTranslations('health')
  if (status === 'ok') return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 px-2 py-0.5 rounded-full">
      <CheckCircle2 size={11} /> {t('serviceStatusOk')}
    </span>
  )
  if (status === 'error') return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 px-2 py-0.5 rounded-full">
      <XCircle size={11} /> {t('serviceStatusError')}
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-2 py-0.5 rounded-full">
      <MinusCircle size={11} /> {t('serviceStatusUnconfigured')}
    </span>
  )
}

function LatencyBar({ ms }: { ms: number | undefined }) {
  if (ms == null) return null
  const color = ms < 500 ? 'bg-green-400' : ms < 2000 ? 'bg-yellow-400' : 'bg-red-400'
  const width = Math.min(100, (ms / 5000) * 100)
  return (
    <div className="flex items-center gap-2 mt-2">
      <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${width}%` }} />
      </div>
      <span className="text-xs text-gray-400 w-14 text-right">{ms} ms</span>
    </div>
  )
}

function HunterSection() {
  const t = useTranslations('hunter')
  const [stats, setStats] = useState<HunterStats | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedOk, setSavedOk] = useState(false)
  const [searching, setSearching] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [searchResult, setSearchResult] = useState<{ total: number; found: number; skipped?: boolean; skipReason?: string; results: Array<{ name: string | null; company: string | null; email: string | null }> } | null>(null)

  const loadStats = useCallback(async () => {
    const res = await fetch('/api/admin/hunter')
    if (res.ok) setStats(await res.json())
  }, [])

  useEffect(() => { loadStats() }, [loadStats])

  const saveKey = async () => {
    setSaving(true)
    setSavedOk(false)
    const res = await fetch('/api/admin/hunter', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey }),
    })
    setSaving(false)
    if (res.ok) {
      setSavedOk(true)
      setApiKey('')
      loadStats()
      setTimeout(() => setSavedOk(false), 3000)
    }
  }

  const startSearch = async () => {
    setSearching(true)
    setSearchResult(null)
    const res = await fetch('/api/admin/hunter', { method: 'POST' })
    setSearching(false)
    if (res.ok) {
      const data = await res.json()
      setSearchResult(data)
      loadStats()
    }
  }

  // runHunterBatch returns { skipped:true, skipReason:'disabled' } when the org-settings
  // kill-switch is off — show a dedicated notice instead of a generic zero-result message.
  const hunterDisabled = !!searchResult?.skipped && searchResult.skipReason === 'disabled'

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mt-6">
      <div className="flex items-center gap-2 mb-5">
        <div className="p-2 rounded-lg bg-orange-50 dark:bg-orange-950/30 text-orange-500">
          <Search size={18} />
        </div>
        <div>
          <h2 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{t('title')}</h2>
          <p className="text-xs text-gray-400">{t('freeQuotaHint')}</p>
          {stats?.credits && (
            <p className="text-xs mt-0.5">
              <span className="text-green-600 dark:text-green-400 font-medium">{t('creditsRemaining', { remaining: stats.credits.available - stats.credits.used, available: stats.credits.available })}</span>
              <span className="text-gray-400 ml-1">{t('creditsUsedThisMonth', { used: stats.credits.used })}</span>
            </p>
          )}
        </div>
      </div>

      {/* API Key */}
      <div className="mb-5">
        <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
          <Key size={12} /> {t('apiKey')}
          {stats?.hasApiKey && (
            <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400 ml-2">
              <CheckCircle2 size={11} /> {t('apiKeySet')}
            </span>
          )}
        </label>
        <div className="flex gap-2">
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={t('apiKeyPlaceholder')}
            className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
          <button
            onClick={saveKey}
            disabled={saving || !apiKey}
            className="px-4 py-2 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 flex items-center gap-1.5"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : null}
            {savedOk ? t('saved') : t('saveKey')}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-gray-600 dark:text-gray-400">{t('statsTitle')}</p>
          <button
            onClick={loadStats}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <RefreshCw size={11} />
            {t('refresh')}
          </button>
        </div>
        {stats ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: t('totalNoEmail'), value: stats.totalNoEmail, color: 'text-gray-700 dark:text-gray-300' },
              { label: t('neverSearched'), value: stats.neverSearched, color: 'text-blue-600 dark:text-blue-400' },
              { label: t('searchedNotFound'), value: stats.searchedNotFound, color: 'text-yellow-600 dark:text-yellow-400' },
              { label: t('searchedThisMonth'), value: stats.searchedThisMonth, color: 'text-green-600 dark:text-green-400' },
            ].map((s) => (
              <div key={s.label} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-center">
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400">{t('loadingStats')}</p>
        )}
      </div>

      {/* Trigger */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={startSearch}
          disabled={searching || !stats?.hasApiKey}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50"
        >
          {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          {searching ? t('searching') : t('startSearch')}
        </button>
        <button
          onClick={async () => {
            if (!confirm(t('resetConfirm'))) return
            setResetting(true)
            const res = await fetch('/api/admin/hunter', { method: 'DELETE' })
            const data = await res.json()
            setResetting(false)
            await loadStats()
            alert(t('resetDone', { count: data.reset ?? 0 }))
          }}
          disabled={resetting}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50"
        >
          {resetting ? <Loader2 size={14} className="animate-spin" /> : null}
          {t('resetSearch')}
        </button>
        {!stats?.hasApiKey && (
          <p className="text-xs text-gray-400">{t('noApiKey')}</p>
        )}
        {searchResult && !hunterDisabled && (
          <p className="text-sm text-green-600 dark:text-green-400">
            {t('searchResult', { total: searchResult.total, found: searchResult.found })}
          </p>
        )}
      </div>

      {/* Module disabled via org-settings kill-switch */}
      {hunterDisabled && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950/20 px-4 py-3">
          <AlertTriangle size={15} className="shrink-0 mt-0.5 text-yellow-600 dark:text-yellow-400" />
          <div className="text-sm text-yellow-700 dark:text-yellow-300">
            <p>{t('disabledNotice')}</p>
            <Link
              href="/admin/org-settings"
              className="inline-flex items-center gap-1 mt-1 font-medium text-yellow-800 dark:text-yellow-200 hover:underline"
            >
              {t('disabledGoToSettings')} <ExternalLink size={12} />
            </Link>
          </div>
        </div>
      )}

      {/* Per-contact results */}
      {searchResult && !hunterDisabled && (() => {
        const notFound = searchResult.results.filter(r => !r.email)
        const found = searchResult.results.filter(r => r.email)
        return (
          <div className="mt-4 space-y-3">
            {found.length > 0 && (
              <div className="border border-green-200 dark:border-green-900 rounded-lg overflow-hidden">
                <div className="bg-green-50 dark:bg-green-950 px-3 py-2 text-xs font-medium text-green-700 dark:text-green-400">
                  {t('foundDetail')} ({found.length})
                </div>
                <div className="divide-y divide-gray-100 dark:divide-gray-800 max-h-48 overflow-y-auto">
                  {found.map((r, i) => (
                    <div key={i} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-gray-800 dark:text-gray-200">{r.name ?? '—'}</span>
                        {r.company && <span className="text-gray-400 text-xs ml-2">{r.company}</span>}
                      </div>
                      <span className="text-green-600 dark:text-green-400 text-xs font-mono">{r.email}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {notFound.length > 0 && (
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                <div className="bg-gray-50 dark:bg-gray-800 px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                  {t('notFoundDetail')} ({notFound.length})
                </div>
                <div className="divide-y divide-gray-100 dark:divide-gray-800 max-h-48 overflow-y-auto">
                  {notFound.map((r, i) => (
                    <div key={i} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <span className="font-medium text-gray-800 dark:text-gray-200">{r.name ?? '—'}</span>
                      {r.company && <span className="text-gray-400 text-xs ml-2">{r.company}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
}

function SectionSkeleton() {
  return (
    <div className="space-y-2 animate-pulse" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-11 bg-gray-100 dark:bg-gray-800 rounded-lg" />
      ))}
    </div>
  )
}

function SectionError({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations('health')
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 px-4 py-3">
      <span className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
        <XCircle size={15} className="shrink-0" /> {t('loadFailed')}
      </span>
      <button
        onClick={onRetry}
        className="flex items-center gap-1.5 text-xs font-medium text-red-700 dark:text-red-300 hover:underline shrink-0"
      >
        <RefreshCw size={12} /> {t('retry')}
      </button>
    </div>
  )
}

function CronBadge({ job }: { job: CronJob }) {
  const t = useTranslations('health')
  let cls: string
  let icon: React.ReactNode
  let label: string
  if (job.last_status === 'error') {
    cls = 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800'
    icon = <XCircle size={11} />
    label = t('cronStatusError')
  } else if (job.overdue) {
    cls = 'text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-950/40 border-yellow-200 dark:border-yellow-800'
    icon = <AlertTriangle size={11} />
    label = t('cronStatusOverdue')
  } else if (job.last_status === 'ok') {
    cls = 'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-800'
    icon = <CheckCircle2 size={11} />
    label = t('cronStatusOk')
  } else {
    cls = 'text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
    icon = <MinusCircle size={11} />
    label = t('cronStatusNone')
  }
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium border px-2 py-0.5 rounded-full shrink-0 ${cls}`}>
      {icon} {label}
    </span>
  )
}

function CronHealthSection() {
  const t = useTranslations('health')
  const format = useFormatter()
  const [state, setState] = useState<SectionState>('loading')
  const [data, setData] = useState<CronHealthData | null>(null)

  const load = useCallback(async () => {
    setState('loading')
    try {
      const res = await fetch('/api/admin/cron-health')
      if (!res.ok) throw new Error()
      setData(await res.json())
      setState('ready')
    } catch {
      setState('error')
    }
  }, [])

  useEffect(() => { load() }, [load])

  const hasIssue = state === 'ready' && !!data?.jobs.some((j) => j.overdue || j.last_status === 'error')

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mt-6">
      <div className="flex items-center gap-2 mb-5">
        <div className={`p-2 rounded-lg ${hasIssue ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-500' : 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-500'}`}>
          <Clock size={18} />
        </div>
        <div>
          <h2 className={`font-semibold text-sm ${hasIssue ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-gray-100'}`}>{t('cronTitle')}</h2>
          <p className="text-xs text-gray-400">{t('cronSubtitle')}</p>
        </div>
      </div>

      {state === 'loading' && <SectionSkeleton />}
      {state === 'error' && <SectionError onRetry={load} />}
      {state === 'ready' && data && (
        data.jobs.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">{t('cronEmpty')}</p>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {data.jobs.map((job) => (
              <div key={job.job} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{job.job}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {job.last_finished_at ? format.relativeTime(new Date(job.last_finished_at)) : t('cronNever')}
                    {job.duration_ms != null && (
                      <span className="ml-2">· {t('cronDuration')} {job.duration_ms} ms</span>
                    )}
                  </p>
                </div>
                <CronBadge job={job} />
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}

const REQUEUE_TABLES = ['pending_contacts', 'contact_briefings']

function DeadLettersSection() {
  const t = useTranslations('health')
  const format = useFormatter()
  const [state, setState] = useState<SectionState>('loading')
  const [data, setData] = useState<DeadLettersData | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [requeuing, setRequeuing] = useState<string | null>(null)
  const [requeuedMsg, setRequeuedMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    setState('loading')
    try {
      const res = await fetch('/api/admin/dead-letters')
      if (!res.ok) throw new Error()
      setData(await res.json())
      setState('ready')
    } catch {
      setState('error')
    }
  }, [])

  useEffect(() => { load() }, [load])

  const requeue = async (table: string) => {
    setRequeuing(table)
    try {
      const res = await fetch('/api/admin/dead-letters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table }),
      })
      if (!res.ok) throw new Error()
      const { requeued } = await res.json()
      setRequeuedMsg(t('deadLettersRequeued', { count: requeued ?? 0 }))
      setTimeout(() => setRequeuedMsg(null), 3000)
      await load()
    } catch {
      setRequeuedMsg(t('deadLettersRequeueFailed'))
      setTimeout(() => setRequeuedMsg(null), 5000)
    } finally {
      setRequeuing(null)
    }
  }

  const hasFailures = state === 'ready' && !!data?.tables.some((tb) => tb.failed > 0)

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mt-6">
      <div className="flex items-center gap-2 mb-5">
        <div className={`p-2 rounded-lg ${hasFailures ? 'bg-red-50 dark:bg-red-950/30 text-red-500' : 'bg-teal-50 dark:bg-teal-950/30 text-teal-500'}`}>
          <Inbox size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className={`font-semibold text-sm ${hasFailures ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}>{t('deadLettersTitle')}</h2>
          <p className="text-xs text-gray-400">{t('deadLettersSubtitle')}</p>
        </div>
        {requeuedMsg && (
          <span className="text-xs text-green-600 dark:text-green-400 font-medium shrink-0">{requeuedMsg}</span>
        )}
      </div>

      {state === 'loading' && <SectionSkeleton />}
      {state === 'error' && <SectionError onRetry={load} />}
      {state === 'ready' && data && (
        data.tables.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">{t('deadLettersEmpty')}</p>
        ) : (
          <div className="space-y-2">
            {data.tables.map((tb) => {
              const isOpen = expanded === tb.table
              const canExpand = tb.recent.length > 0
              return (
                <div key={tb.table} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                  <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                    <button
                      onClick={() => setExpanded(isOpen ? null : tb.table)}
                      disabled={!canExpand}
                      className="flex items-center gap-1.5 flex-1 min-w-0 text-left disabled:cursor-default"
                    >
                      {canExpand && (
                        <ChevronDown size={14} className={`text-gray-400 transition-transform shrink-0 ${isOpen ? '' : '-rotate-90'}`} />
                      )}
                      <span className="text-sm font-mono text-gray-800 dark:text-gray-200 truncate">{tb.table}</span>
                    </button>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${tb.failed > 0 ? 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/40' : 'text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800'}`}>
                      {t('deadLettersFailed', { count: tb.failed })}
                    </span>
                    {tb.failed > 0 && REQUEUE_TABLES.includes(tb.table) && (
                      <button
                        onClick={() => requeue(tb.table)}
                        disabled={requeuing === tb.table}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 shrink-0"
                      >
                        {requeuing === tb.table ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                        {requeuing === tb.table ? t('deadLettersRequeuing') : t('deadLettersRequeue')}
                      </button>
                    )}
                    {tb.table === 'newsletter_recipients' && tb.failed > 0 && (
                      <span className="text-[11px] text-gray-400 shrink-0">{t('deadLettersNewsletterHint')}</span>
                    )}
                    {tb.table === 'failed_scans' && (
                      <Link
                        href="/admin/failed-scans"
                        className="flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline shrink-0"
                      >
                        {t('deadLettersViewScans')} <ExternalLink size={11} />
                      </Link>
                    )}
                  </div>
                  {isOpen && canExpand && (
                    <div className="border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40 divide-y divide-gray-100 dark:divide-gray-800 max-h-48 overflow-y-auto">
                      {tb.recent.map((r) => (
                        <div key={r.id} className="px-3 py-2">
                          <p className="text-xs text-gray-600 dark:text-gray-300 break-words">{r.error ?? t('deadLettersNoError')}</p>
                          {r.meta && <p className="text-[11px] text-gray-400 font-mono mt-0.5 break-words">{r.meta}</p>}
                          {r.at && <p className="text-[11px] text-gray-400 mt-0.5">{format.relativeTime(new Date(r.at))}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      )}
    </div>
  )
}

const USAGE_METRICS: Array<{ key: string; labelKey: string; optional?: boolean }> = [
  { key: 'ai_call', labelKey: 'usageAiCall' },
  { key: 'ai_tokens_in', labelKey: 'usageAiTokensIn', optional: true },
  { key: 'ai_tokens_out', labelKey: 'usageAiTokensOut', optional: true },
  { key: 'email_sent', labelKey: 'usageEmailSent' },
  { key: 'newsletter_sent', labelKey: 'usageNewsletterSent' },
]

function UsageSection() {
  const t = useTranslations('health')
  const [state, setState] = useState<SectionState>('loading')
  const [data, setData] = useState<UsageData | null>(null)
  const [limitForm, setLimitForm] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState(false)

  const load = useCallback(async () => {
    setState('loading')
    try {
      const res = await fetch('/api/admin/usage')
      if (!res.ok) throw new Error()
      const json: UsageData = await res.json()
      setData(json)
      // Seed the editable cap inputs from the persisted limits (blank = no limit).
      const form: Record<string, string> = {}
      for (const m of USAGE_METRICS) {
        const cap = json.limits?.[m.key]
        form[m.key] = cap ? String(cap) : ''
      }
      setLimitForm(form)
      setState('ready')
    } catch {
      setState('error')
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Show a card for every non-optional metric, and for optional ones only when
  // they carry usage this/last month or already have a budget cap configured.
  const cards = data
    ? USAGE_METRICS.filter((m) =>
        !m.optional ||
        m.key in (data.metrics ?? {}) ||
        m.key in (data.previous?.metrics ?? {}) ||
        m.key in (data.limits ?? {}))
    : []

  const saveLimits = async () => {
    setSaving(true); setSaved(false); setSaveError(false)
    try {
      const limits: Record<string, string> = {}
      for (const m of USAGE_METRICS) limits[m.key] = limitForm[m.key] ?? ''
      const res = await fetch('/api/admin/usage', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limits }),
      })
      if (!res.ok) throw new Error()
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      await load()
    } catch {
      setSaveError(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mt-6">
      <div className="flex items-center gap-2 mb-5">
        <div className="p-2 rounded-lg bg-purple-50 dark:bg-purple-950/30 text-purple-500">
          <BarChart3 size={18} />
        </div>
        <div>
          <h2 className="font-semibold text-sm text-gray-900 dark:text-gray-100">{t('usageTitle')}</h2>
          <p className="text-xs text-gray-400">{data?.period ? `${data.period} · ${t('usageSubtitle')}` : t('usageSubtitle')}</p>
        </div>
      </div>

      {state === 'loading' && <SectionSkeleton />}
      {state === 'error' && <SectionError onRetry={load} />}
      {state === 'ready' && data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {cards.map((m) => {
              const cur = data.metrics?.[m.key] ?? 0
              const prev = data.previous?.metrics?.[m.key] ?? 0
              const capStr = limitForm[m.key] ?? ''
              const capNum = Number(capStr)
              const hasCap = capStr.trim() !== '' && Number.isFinite(capNum) && capNum > 0
              const pct = hasCap ? Math.floor((cur / capNum) * 100) : null
              // Thresholds mirror the health-watchdog alert tiers (80% / 100%).
              const barColor = pct == null ? '' : pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-yellow-400' : 'bg-green-400'
              const pctColor = pct == null ? '' : pct >= 100 ? 'text-red-600 dark:text-red-400' : pct >= 80 ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-400'
              return (
                <div key={m.key} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 flex flex-col">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="text-xs text-gray-500">{t(m.labelKey)}</p>
                    {pct != null && <span className={`text-xs font-semibold ${pctColor}`}>{pct}%</span>}
                  </div>
                  <p className="text-2xl font-bold text-gray-800 dark:text-gray-200">{cur.toLocaleString()}</p>
                  {hasCap ? (
                    <>
                      <div className="mt-1.5 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(100, pct ?? 0)}%` }} />
                      </div>
                      <p className="text-xs text-gray-400 mt-1">{t('usageOfCap', { cap: capNum.toLocaleString() })}</p>
                    </>
                  ) : (
                    <p className="text-xs text-gray-400 mt-0.5">{t('usageLastMonth', { value: prev.toLocaleString() })}</p>
                  )}
                  <div className="mt-2">
                    <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">{t('budgetCapLabel')}</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={limitForm[m.key] ?? ''}
                      onChange={(e) => { setLimitForm((p) => ({ ...p, [m.key]: e.target.value })); setSaved(false) }}
                      placeholder={t('budgetNoLimit')}
                      className="w-full px-2.5 py-2 text-base border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>
              )
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
            <p className="text-xs text-gray-400 max-w-md">{t('budgetHint')}</p>
            <div className="flex items-center gap-3 ml-auto">
              {saveError && <span className="text-xs text-red-600 dark:text-red-400">{t('budgetSaveError')}</span>}
              {saved && (
                <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                  <CheckCircle2 size={13} className="shrink-0" /> {t('budgetSaved')}
                </span>
              )}
              <button
                onClick={saveLimits}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 min-h-[44px]"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                {saving ? t('budgetSaving') : t('budgetSave')}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default function HealthPage() {
  const t = useTranslations('health')
  const [result, setResult] = useState<HealthResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [lastChecked, setLastChecked] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(false)

  const runCheck = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/health-check')
      const data: HealthResult = await res.json()
      setResult(data)
      setLastChecked(new Date().toLocaleString('zh-TW'))
    } catch {
      setResult(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    runCheck()
  }, [runCheck])

  useEffect(() => {
    if (!autoRefresh) return
    const timer = setInterval(runCheck, 30000)
    return () => clearInterval(timer)
  }, [autoRefresh, runCheck])

  const errorCount = result?.services.filter((s) => s.status === 'error').length ?? 0
  const okCount = result?.services.filter((s) => s.status === 'ok').length ?? 0

  return (
    <div className="max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Activity size={24} />
            {t('pageTitle')}
          </h1>
          {lastChecked && (
            <p className="text-sm text-gray-400 mt-1">{t('lastCheckedLabel', { lastChecked })}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-gray-300"
            />
            {t('autoRefreshLabel')}
          </label>
          <button
            onClick={runCheck}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            {loading ? t('checking') : t('checkNow')}
          </button>
        </div>
      </div>

      {/* Summary bar */}
      {result && (
        <div className={`rounded-xl border p-4 mb-6 flex items-center gap-4 ${
          errorCount > 0
            ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800'
            : 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800'
        }`}>
          {errorCount > 0 ? (
            <XCircle size={24} className="text-red-500 shrink-0" />
          ) : (
            <CheckCircle2 size={24} className="text-green-500 shrink-0" />
          )}
          <div>
            <p className={`font-semibold text-sm ${errorCount > 0 ? 'text-red-700 dark:text-red-400' : 'text-green-700 dark:text-green-400'}`}>
              {errorCount > 0
                ? t('servicesDown', { count: errorCount })
                : t('allHealthy')}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {t('summaryCounts', { ok: okCount, error: errorCount, unconfigured: result.services.filter((s) => s.status === 'unconfigured').length })}
            </p>
          </div>
        </div>
      )}

      {/* Service cards */}
      {loading && !result ? (
        <div className="text-center py-16">
          <Loader2 size={28} className="animate-spin mx-auto mb-3 text-gray-400" />
          <p className="text-sm text-gray-400">{t('checkingStatus')}</p>
        </div>
      ) : result ? (
        <div className="space-y-3">
          {result.services.map((svc) => (
            <div
              key={svc.name}
              className={`bg-white dark:bg-gray-900 rounded-xl border p-4 transition-colors ${
                svc.status === 'error'
                  ? 'border-red-200 dark:border-red-800'
                  : svc.status === 'ok'
                  ? 'border-gray-200 dark:border-gray-700'
                  : 'border-gray-200 dark:border-gray-700 opacity-60'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${
                    svc.status === 'ok' ? 'bg-green-50 dark:bg-green-950/30 text-green-600 dark:text-green-400'
                    : svc.status === 'error' ? 'bg-red-50 dark:bg-red-950/30 text-red-500'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-400'
                  }`}>
                    {SERVICE_ICONS[svc.name] ?? <Activity size={18} />}
                  </div>
                  <div>
                    <p className="font-medium text-sm text-gray-900 dark:text-gray-100">{svc.name}</p>
                    {svc.detail && (
                      <p className={`text-xs mt-0.5 ${svc.status === 'error' ? 'text-red-500' : 'text-gray-400'}`}>
                        {svc.detail}
                      </p>
                    )}
                  </div>
                </div>
                <StatusBadge status={svc.status} />
              </div>
              <LatencyBar ms={svc.latencyMs} />
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-gray-400 text-sm">
          {t('fetchFailed')}
        </div>
      )}

      {/* Legend */}
      <div className="mt-6 bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 text-xs text-gray-500 space-y-1">
        <p className="font-semibold text-gray-600 dark:text-gray-400 mb-2">{t('latencyLegend')}</p>
        <div className="flex gap-4">
          <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 rounded bg-green-400 inline-block" /> {t('latencyNormal')}</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 rounded bg-yellow-400 inline-block" /> {t('latencySlow')}</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 rounded bg-red-400 inline-block" /> {t('latencyCritical')}</span>
        </div>
      </div>

      {/* Hunter.io section */}
      <HunterSection />

      {/* Cron heartbeat section */}
      <CronHealthSection />

      {/* Dead letters section */}
      <DeadLettersSection />

      {/* This month's usage section */}
      <UsageSection />
    </div>
  )
}
