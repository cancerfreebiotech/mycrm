'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Activity, Loader2, RefreshCw, CheckCircle2, XCircle, MinusCircle,
  Database, Cpu, Send, Bot, Zap, Search, Key
} from 'lucide-react'
import { useTranslations } from 'next-intl'
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

function StatusBadge({ status }: { status: ServiceStatus['status'] }) {
  if (status === 'ok') return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 px-2 py-0.5 rounded-full">
      <CheckCircle2 size={11} /> 正常
    </span>
  )
  if (status === 'error') return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 px-2 py-0.5 rounded-full">
      <XCircle size={11} /> 異常
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-2 py-0.5 rounded-full">
      <MinusCircle size={11} /> 未設定
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
  const [searchResult, setSearchResult] = useState<{ total: number; found: number; results: Array<{ name: string | null; company: string | null; email: string | null }> } | null>(null)

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
              <span className="text-green-600 dark:text-green-400 font-medium">{stats.credits.available} credits 剩餘</span>
              <span className="text-gray-400 ml-1">（本月已用 {stats.credits.used}）</span>
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
        <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">{t('statsTitle')}</p>
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
        {searchResult && (
          <p className="text-sm text-green-600 dark:text-green-400">
            {t('searchResult', { total: searchResult.total, found: searchResult.found })}
          </p>
        )}
      </div>

      {/* Per-contact results */}
      {searchResult && (() => {
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

export default function HealthPage() {
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
            系統狀態
          </h1>
          {lastChecked && (
            <p className="text-sm text-gray-400 mt-1">上次檢查：{lastChecked}</p>
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
            每 30 秒自動重整
          </label>
          <button
            onClick={runCheck}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            {loading ? '檢查中...' : '立即檢查'}
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
                ? `⚠️ ${errorCount} 個服務異常`
                : '✅ 所有服務運作正常'}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {okCount} 個正常 · {errorCount} 個異常 · {result.services.filter((s) => s.status === 'unconfigured').length} 個未設定
            </p>
          </div>
        </div>
      )}

      {/* Service cards */}
      {loading && !result ? (
        <div className="text-center py-16">
          <Loader2 size={28} className="animate-spin mx-auto mb-3 text-gray-400" />
          <p className="text-sm text-gray-400">正在檢查各服務狀態...</p>
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
          無法取得狀態，請重試
        </div>
      )}

      {/* Legend */}
      <div className="mt-6 bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 text-xs text-gray-500 space-y-1">
        <p className="font-semibold text-gray-600 dark:text-gray-400 mb-2">延遲指示燈說明</p>
        <div className="flex gap-4">
          <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 rounded bg-green-400 inline-block" /> &lt; 500 ms — 正常</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 rounded bg-yellow-400 inline-block" /> 500–2000 ms — 緩慢</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 rounded bg-red-400 inline-block" /> &gt; 2000 ms — 異常慢</span>
        </div>
      </div>

      {/* Hunter.io section */}
      <HunterSection />
    </div>
  )
}
