'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { Activity, Loader2, RefreshCw, CheckCircle2, XCircle } from 'lucide-react'

interface AgentAction {
  id: string
  tool_name: string
  arguments: Record<string, unknown> | null
  result_summary: string | null
  succeeded: boolean
  error_message: string | null
  ip_hash: string | null
  created_at: string
  token_id: string | null
  acting_as: string | null
  token: { name: string } | null
  actor: { display_name: string | null; email: string } | null
}

const PAGE_SIZE = 100

export default function McpActivityPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="animate-spin text-gray-400" /></div>}>
      <McpActivityInner />
    </Suspense>
  )
}

function McpActivityInner() {
  const t = useTranslations('mcpActivity')
  const router = useRouter()
  const searchParams = useSearchParams()
  const tokenIdParam = searchParams.get('token_id')
  const supabase = createBrowserSupabaseClient()
  const [rows, setRows] = useState<AgentAction[]>([])
  const [loading, setLoading] = useState(true)
  const [authChecked, setAuthChecked] = useState(false)
  const [toolFilter, setToolFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'ok' | 'fail'>('all')
  const [expanded, setExpanded] = useState<string | null>(null)

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

  const load = async () => {
    setLoading(true)
    let q = supabase
      .from('agent_actions')
      .select('id, tool_name, arguments, result_summary, succeeded, error_message, ip_hash, created_at, token_id, acting_as, token:token_id(name), actor:acting_as(display_name, email)')
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)
    if (tokenIdParam) q = q.eq('token_id', tokenIdParam)
    const { data } = await q
    setRows((data ?? []) as unknown as AgentAction[])
    setLoading(false)
  }

  useEffect(() => { if (authChecked) load() }, [authChecked])  // eslint-disable-line react-hooks/exhaustive-deps

  const toolNames = useMemo(
    () => [...new Set(rows.map((r) => r.tool_name))].sort(),
    [rows],
  )

  const filtered = useMemo(
    () => rows.filter((r) => {
      if (toolFilter !== 'all' && r.tool_name !== toolFilter) return false
      if (statusFilter === 'ok' && !r.succeeded) return false
      if (statusFilter === 'fail' && r.succeeded) return false
      return true
    }),
    [rows, toolFilter, statusFilter],
  )

  const totals = useMemo(() => ({
    total: rows.length,
    ok: rows.filter((r) => r.succeeded).length,
    fail: rows.filter((r) => !r.succeeded).length,
  }), [rows])

  if (!authChecked) {
    return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-gray-400" /></div>
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Activity size={22} className="text-blue-500" />
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t('title')}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {t.rich('description', {
              count: PAGE_SIZE,
              code: (chunks) => <code className="text-xs font-mono">{chunks}</code>,
            })}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg font-medium disabled:opacity-60"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {t('refresh')}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
          <div className="text-xs text-gray-500 dark:text-gray-400">{t('statTotal')}</div>
          <div className="text-xl font-bold text-gray-900 dark:text-gray-100">{totals.total}</div>
        </div>
        <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-3">
          <div className="text-xs text-green-700 dark:text-green-400">{t('statSuccess')}</div>
          <div className="text-xl font-bold text-green-700 dark:text-green-400">{totals.ok}</div>
        </div>
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-3">
          <div className="text-xs text-red-700 dark:text-red-400">{t('statFail')}</div>
          <div className="text-xl font-bold text-red-700 dark:text-red-400">{totals.fail}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        <select
          value={toolFilter}
          onChange={(e) => setToolFilter(e.target.value)}
          className="text-sm px-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200"
        >
          <option value="all">{t('filterAllTools')}</option>
          {toolNames.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | 'ok' | 'fail')}
          className="text-sm px-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200"
        >
          <option value="all">{t('filterAllStatus')}</option>
          <option value="ok">{t('filterOnlySuccess')}</option>
          <option value="fail">{t('filterOnlyFail')}</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-gray-400" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">{t('empty')}</div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[680px]">
            <thead className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">{t('colTime')}</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-400">{t('colTool')}</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-400">{t('colStatus')}</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-400 hidden lg:table-cell">{t('colToken')}</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-400 hidden lg:table-cell">{t('colActor')}</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-400 hidden md:table-cell">{t('colIpHash')}</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-400">{t('colArgsError')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const isExpanded = expanded === r.id
                return (
                  <tr key={r.id} className="border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/30 align-top">
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-400 text-xs whitespace-nowrap">
                      {new Date(r.created_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                    </td>
                    <td className="px-3 py-2 text-gray-900 dark:text-gray-100 font-mono text-xs">{r.tool_name}</td>
                    <td className="px-3 py-2">
                      {r.succeeded ? (
                        <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400"><CheckCircle2 size={14} /> ok</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400"><XCircle size={14} /> fail</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-400 text-xs hidden lg:table-cell">{r.token?.name ?? (r.token_id ? '—' : 'env (legacy)')}</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-400 text-xs hidden lg:table-cell">{r.actor?.display_name || r.actor?.email || '—'}</td>
                    <td className="px-3 py-2 text-gray-400 dark:text-gray-500 text-xs font-mono hidden md:table-cell">{r.ip_hash ?? '—'}</td>
                    <td className="px-3 py-2 text-xs">
                      <button
                        onClick={() => setExpanded(isExpanded ? null : r.id)}
                        className="text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        {isExpanded ? t('collapse') : t('expand')}
                      </button>
                      {isExpanded && (
                        <div className="mt-2 space-y-1">
                          {r.error_message && (
                            <pre className="bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 p-2 rounded text-xs whitespace-pre-wrap break-words">{r.error_message}</pre>
                          )}
                          <pre className="bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-200 p-2 rounded text-xs whitespace-pre-wrap break-words max-w-2xl overflow-x-auto">{JSON.stringify(r.arguments, null, 2)}</pre>
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
  )
}
