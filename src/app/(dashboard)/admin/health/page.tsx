'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Activity, Loader2, RefreshCw, CheckCircle2, XCircle, MinusCircle,
  Database, Cpu, Send, Bot, Zap
} from 'lucide-react'
import type { ServiceStatus } from '@/app/api/health-check/route'

const SERVICE_ICONS: Record<string, React.ReactNode> = {
  'Supabase': <Database size={18} />,
  'Gemini': <Cpu size={18} />,
  'Telegram Bot': <Bot size={18} />,
  'SendGrid': <Send size={18} />,
  'Teams Bot': <Zap size={18} />,
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
    </div>
  )
}
