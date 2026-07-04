'use client'

import { useEffect, useState, useCallback } from 'react'
import { ShieldOff, Search, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'

type SourceKey = 'contact_opt_out' | 'contact_status' | 'blacklist' | 'unsubscribe' | 'subscriber_unsub'

const SOURCE_ORDER: SourceKey[] = ['contact_opt_out', 'contact_status', 'blacklist', 'unsubscribe', 'subscriber_unsub']
const SOURCE_LABEL_KEY: Record<SourceKey, string> = {
  contact_opt_out: 'sourceContactOptOut',
  contact_status: 'sourceContactStatus',
  blacklist: 'sourceBlacklist',
  unsubscribe: 'sourceUnsubscribe',
  subscriber_unsub: 'sourceSubscriberUnsub',
}

interface Verdict {
  email: string
  canEmail: boolean
  reasons: { source: SourceKey; detail: string | null }[]
  sources: {
    contact_opt_out: boolean
    contact_status: string | null
    blacklist: { status: string | null; reason: string | null } | null
    unsubscribe: { reason: string | null; unsubscribed_at: string | null } | null
    subscriber_unsub: string | null
  }
}

interface RecentEntry {
  source: SourceKey
  email: string
  detail: string | null
  at: string | null
}

interface Summary {
  contact_opt_out: number
  contact_status: number
  blacklist: number
  unsubscribe: number
  subscriber_unsub: number
}

const VALID_EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('zh-TW', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

export default function SuppressionsPage() {
  const t = useTranslations('suppressions')
  const [loading, setLoading] = useState(true)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [recent, setRecent] = useState<RecentEntry[]>([])
  const [input, setInput] = useState('')
  const [searching, setSearching] = useState(false)
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)

  const loadSummary = useCallback(async () => {
    const res = await fetch('/api/admin/suppressions')
    if (res.ok) {
      const data = await res.json()
      setSummary(data.summary ?? null)
      setRecent(data.recent ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    const supabase = createBrowserSupabaseClient()
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { setLoading(false); return }
      const { data: profile } = await supabase.from('users').select('role').eq('email', session.user.email!).single()
      if (profile?.role === 'super_admin') {
        setIsSuperAdmin(true)
        loadSummary()
      } else {
        setLoading(false)
      }
    })
  }, [loadSummary])

  async function handleSearch(e?: React.FormEvent) {
    e?.preventDefault()
    const email = input.trim().toLowerCase()
    setVerdict(null)
    setSearchError(null)
    if (!VALID_EMAIL.test(email)) { setSearchError(t('invalidEmail')); return }
    setSearching(true)
    try {
      const res = await fetch(`/api/admin/suppressions?email=${encodeURIComponent(email)}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? t('loadFailed'))
      }
      const data = await res.json()
      setVerdict(data.verdict)
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : t('loadFailed'))
    } finally {
      setSearching(false)
    }
  }

  // Per-source rows for the searched address.
  const sourceRows: { key: SourceKey; suppressed: boolean; detail: string | null }[] = verdict ? [
    { key: 'contact_opt_out', suppressed: verdict.sources.contact_opt_out, detail: null },
    { key: 'contact_status', suppressed: verdict.sources.contact_status !== null, detail: verdict.sources.contact_status },
    { key: 'blacklist', suppressed: verdict.sources.blacklist !== null, detail: verdict.sources.blacklist ? (verdict.sources.blacklist.status ?? verdict.sources.blacklist.reason) : null },
    { key: 'unsubscribe', suppressed: verdict.sources.unsubscribe !== null, detail: verdict.sources.unsubscribe?.reason ?? null },
    { key: 'subscriber_unsub', suppressed: verdict.sources.subscriber_unsub !== null, detail: verdict.sources.subscriber_unsub ? formatDate(verdict.sources.subscriber_unsub) : null },
  ] : []

  if (!isSuperAdmin && !loading) {
    return <div className="p-8 text-center text-gray-500 dark:text-gray-400">{t('noPermission')}</div>
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <ShieldOff size={22} className="text-amber-500 shrink-0" />
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t('pageTitle')}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{t('pageSubtitle')}</p>
        </div>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="email"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="w-full pl-9 pr-3 py-2.5 text-base rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          type="submit"
          disabled={searching}
          className="flex items-center justify-center gap-2 px-5 py-2.5 min-h-11 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
        >
          {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
          {t('searchButton')}
        </button>
      </form>

      {searchError && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
          {searchError}
        </div>
      )}

      {/* Verdict + per-source table */}
      {verdict && (
        <div className="mb-8 space-y-4">
          <div className={`flex items-start gap-3 px-4 py-4 rounded-xl border ${
            verdict.canEmail
              ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800'
              : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'
          }`}>
            {verdict.canEmail
              ? <CheckCircle2 size={22} className="text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
              : <XCircle size={22} className="text-red-600 dark:text-red-400 shrink-0 mt-0.5" />}
            <div className="min-w-0">
              <div className={`font-semibold ${verdict.canEmail ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
                {verdict.canEmail ? t('verdictCanEmail') : t('verdictCannotEmail')}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400 break-all">{verdict.email}</div>
              {!verdict.canEmail && verdict.reasons.length > 0 && (
                <ul className="mt-2 text-sm text-gray-700 dark:text-gray-300 list-disc list-inside space-y-0.5">
                  {verdict.reasons.map((r, i) => (
                    <li key={i}>
                      {t(SOURCE_LABEL_KEY[r.source])}{r.detail ? `：${r.detail}` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 text-sm font-semibold text-gray-700 dark:text-gray-300">
              {t('sourcesTitle')}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                    <th className="text-left px-4 py-2.5 font-medium text-gray-600 dark:text-gray-400">{t('colSource')}</th>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-600 dark:text-gray-400">{t('colStatus')}</th>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-600 dark:text-gray-400">{t('colDetail')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sourceRows.map((row) => (
                    <tr key={row.key} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
                      <td className="px-4 py-2.5 text-gray-900 dark:text-gray-100">{t(SOURCE_LABEL_KEY[row.key])}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                          row.suppressed
                            ? 'bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400'
                            : 'bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400'
                        }`}>
                          {row.suppressed ? t('statusSuppressed') : t('statusClear')}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 break-all">{row.detail ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={24} className="animate-spin text-gray-400" />
        </div>
      ) : (
        <>
          {/* Summary stats */}
          {summary && (
            <div className="mb-8">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">{t('summaryTitle')}</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {SOURCE_ORDER.map((key) => (
                  <div key={key} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 px-4 py-3">
                    <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{summary[key].toLocaleString()}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t(SOURCE_LABEL_KEY[key])}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent suppressed */}
          <div>
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">{t('recentTitle')}</h2>
            {recent.length === 0 ? (
              <div className="text-center py-16 text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
                <ShieldOff size={40} className="mx-auto mb-3 opacity-30" />
                <p>{t('empty')}</p>
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                        <th className="text-left px-4 py-2.5 font-medium text-gray-600 dark:text-gray-400">{t('colEmail')}</th>
                        <th className="text-left px-4 py-2.5 font-medium text-gray-600 dark:text-gray-400">{t('colSource')}</th>
                        <th className="text-left px-4 py-2.5 font-medium text-gray-600 dark:text-gray-400 hidden sm:table-cell">{t('colDetail')}</th>
                        <th className="text-left px-4 py-2.5 font-medium text-gray-600 dark:text-gray-400">{t('colTime')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recent.map((r, i) => (
                        <tr key={i} className="border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                          <td className="px-4 py-2.5 text-gray-900 dark:text-gray-100 break-all">{r.email}</td>
                          <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400">{t(SOURCE_LABEL_KEY[r.source])}</td>
                          <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 break-all hidden sm:table-cell">{r.detail ?? '—'}</td>
                          <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 text-xs whitespace-nowrap">{formatDate(r.at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
