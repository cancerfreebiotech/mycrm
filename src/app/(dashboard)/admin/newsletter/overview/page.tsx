'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslations, useFormatter } from 'next-intl'
import { BarChart3, Users, UserMinus, ShieldOff, Inbox, ListChecks, AlertCircle } from 'lucide-react'

interface CampaignOverview {
  id: string
  title: string | null
  sent_at: string
  sent_count: number
  recipients: number
  opened: number
  clicked: number
  openRate: number | null
  clickRate: number | null
}

interface ListHealth {
  id: string
  name: string
  members: number
  nonOpeners180d: number
}

interface OverviewData {
  campaigns: CampaignOverview[]
  lists: ListHealth[]
  totals: { subscribers: number; unsubscribed: number; blacklist: number }
}

function pct(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 100)}%`
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg bg-gray-50 dark:bg-gray-800 flex items-center justify-center text-gray-500 dark:text-gray-400 shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
        <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{value.toLocaleString()}</p>
      </div>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 bg-gray-100 dark:bg-gray-800 rounded-xl" />
        ))}
      </div>
      <div className="h-64 bg-gray-100 dark:bg-gray-800 rounded-xl" />
      <div className="h-40 bg-gray-100 dark:bg-gray-800 rounded-xl" />
    </div>
  )
}

export default function NewsletterOverviewPage() {
  const t = useTranslations('newsletterOverview')
  const format = useFormatter()
  const [data, setData] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setErrorMsg('')
    try {
      const res = await fetch('/api/newsletter/overview')
      if (!res.ok) {
        if (res.status === 403) throw new Error(t('forbidden'))
        if (res.status >= 500) throw new Error(t('genericError'))
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? t('loadFailed'))
      }
      setData(await res.json())
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : t('genericError'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { load() }, [load])

  const thCls = 'text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400'
  const tdCls = 'px-4 py-3 text-gray-700 dark:text-gray-300'

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <BarChart3 size={22} className="text-blue-500" />
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t('title')}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{t('subtitle')}</p>
        </div>
      </div>

      {loading ? (
        <Skeleton />
      ) : errorMsg ? (
        <div className="text-center py-12 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
          <AlertCircle size={40} className="mx-auto text-red-400 mb-3" />
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{errorMsg}</p>
          <button
            onClick={load}
            className="px-4 py-2.5 min-h-[44px] rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium"
          >
            {t('retry')}
          </button>
        </div>
      ) : data && (
        <div className="space-y-6">
          {/* (c) totals */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard icon={<Users size={18} />} label={t('statSubscribers')} value={data.totals.subscribers} />
            <StatCard icon={<UserMinus size={18} />} label={t('statUnsubscribed')} value={data.totals.unsubscribed} />
            <StatCard icon={<ShieldOff size={18} />} label={t('statBlacklist')} value={data.totals.blacklist} />
          </div>

          {/* (a) campaign trend */}
          <section>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">{t('trendTitle')}</h2>
            {data.campaigns.length === 0 ? (
              <div className="text-center py-10 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
                <Inbox size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{t('trendEmpty')}</p>
                <Link
                  href="/admin/newsletter/campaigns"
                  className="inline-flex items-center px-4 py-2.5 min-h-[44px] rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium"
                >
                  {t('trendEmptyCta')}
                </Link>
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden overflow-x-auto">
                <table className="w-full text-sm min-w-[560px]">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
                      <th className={thCls}>{t('colCampaign')}</th>
                      <th className={thCls}>{t('colSentAt')}</th>
                      <th className={`${thCls} text-right`}>{t('colSent')}</th>
                      <th className={`${thCls} text-right`}>{t('colOpenRate')}</th>
                      <th className={`${thCls} text-right`}>{t('colClickRate')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.campaigns.map((c) => (
                      <tr key={c.id} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
                        <td className={tdCls}>
                          <Link
                            href={`/admin/newsletter/campaigns/${c.id}`}
                            className="font-medium text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            {c.title ?? t('untitled')}
                          </Link>
                        </td>
                        <td className={`${tdCls} whitespace-nowrap text-xs text-gray-500 dark:text-gray-400`}>
                          {format.dateTime(new Date(c.sent_at), { dateStyle: 'medium' })}
                        </td>
                        <td className={`${tdCls} text-right tabular-nums`}>{(c.recipients || c.sent_count).toLocaleString()}</td>
                        <td className={`${tdCls} text-right tabular-nums text-green-700 dark:text-green-400`}>{pct(c.openRate)}</td>
                        <td className={`${tdCls} text-right tabular-nums text-blue-700 dark:text-blue-400`}>{pct(c.clickRate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* (b) list health */}
          <section>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">{t('listHealthTitle')}</h2>
            {data.lists.length === 0 ? (
              <div className="text-center py-10 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
                <ListChecks size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{t('listEmpty')}</p>
                <Link
                  href="/admin/newsletter/lists"
                  className="inline-flex items-center px-4 py-2.5 min-h-[44px] rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium"
                >
                  {t('listEmptyCta')}
                </Link>
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden overflow-x-auto">
                <table className="w-full text-sm min-w-[480px]">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
                      <th className={thCls}>{t('colList')}</th>
                      <th className={`${thCls} text-right`}>{t('colMembers')}</th>
                      <th className={`${thCls} text-right`}>{t('colNonOpeners')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.lists.map((l) => (
                      <tr key={l.id} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
                        <td className={tdCls}>
                          <Link
                            href={`/admin/newsletter/lists/${l.id}`}
                            className="font-medium text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            {l.name}
                          </Link>
                        </td>
                        <td className={`${tdCls} text-right tabular-nums`}>{l.members.toLocaleString()}</td>
                        <td className={`${tdCls} text-right tabular-nums`}>
                          <span className={l.nonOpeners180d > 0 ? 'text-amber-700 dark:text-amber-400' : ''}>
                            {l.nonOpeners180d.toLocaleString()}
                            {l.members > 0 && ` (${Math.round((l.nonOpeners180d / l.members) * 100)}%)`}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
