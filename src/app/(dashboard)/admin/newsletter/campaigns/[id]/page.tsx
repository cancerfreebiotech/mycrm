'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { PermissionGate } from '@/components/PermissionGate'
import {
  ArrowLeft, Loader2, Send, Eye, MousePointerClick, AlertTriangle,
  ChevronDown, ChevronRight, BarChart3, MailWarning, UserMinus, ShieldAlert,
} from 'lucide-react'
import { format } from 'date-fns'

interface CampaignMeta {
  id: string
  title: string | null
  subject: string | null
  status: string
  sent_at: string | null
  sent_count: number | null
  total_recipients: number | null
  failed_count: number | null
  send_errors: string[] | null
}

interface Analytics {
  summary: {
    total: number
    sent: number
    failed: number
    opened: number
    clicked: number
    openRate: number
    clickRate: number
  }
  variants: { variant: 'a' | 'b'; sent: number; opened: number; openRate: number }[]
  clicksByUrl: { url: string; clicks: number; uniqueEmails: number }[]
  timeline: { hour: string; opens: number; clicks: number }[]
  events: { bounces: number; unsubscribes: number; spamreports: number }
  hasEventData: boolean
}

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType
  label: string
  value: number | string
  sub?: string
  color: string
}) {
  return (
    <div className="flex flex-col items-center justify-center px-5 py-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <Icon size={18} className={`mb-1.5 ${color}`} />
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`
}

export default function CampaignAnalyticsPage() {
  const { id } = useParams<{ id: string }>()
  const t = useTranslations('campaignAnalytics')
  const tc = useTranslations('common')
  const supabase = createBrowserSupabaseClient()

  const [campaign, setCampaign] = useState<CampaignMeta | null>(null)
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [showErrors, setShowErrors] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [{ data: camp }, res] = await Promise.all([
        supabase
          .from('newsletter_campaigns')
          .select('id, title, subject, status, sent_at, sent_count, total_recipients, failed_count, send_errors')
          .eq('id', id)
          .maybeSingle(),
        fetch(`/api/newsletter/campaigns/${id}/analytics`),
      ])
      if (cancelled) return
      setCampaign((camp as CampaignMeta) ?? null)
      if (res.ok) {
        setAnalytics(await res.json())
      } else {
        setLoadError(true)
      }
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [id, supabase])

  const statusLabel = (status: string): string => {
    switch (status) {
      case 'sent': return t('statusSent')
      case 'partial': return t('statusPartial')
      case 'scheduled': return t('statusScheduled')
      case 'draft': return t('statusDraft')
      default: return status
    }
  }

  const backLink = (
    <Link
      href="/admin/newsletter/campaigns"
      className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 mt-0.5"
      aria-label={t('backToList')}
    >
      <ArrowLeft size={20} />
    </Link>
  )

  return (
    <PermissionGate feature="newsletter">
      <div className="max-w-5xl mx-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-64 text-gray-400">
            <Loader2 className="animate-spin mr-2" size={20} /> {tc('loading')}
          </div>
        ) : !campaign ? (
          <div className="flex items-start gap-3">
            {backLink}
            <div className="text-center py-20 text-gray-400 text-sm flex-1">{t('notFound')}</div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-start gap-3 mb-6">
              {backLink}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">
                    {campaign.title || campaign.subject || t('notFound')}
                  </h1>
                  <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                    campaign.status === 'sent'
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                      : campaign.status === 'partial'
                      ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
                      : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                  }`}>
                    {campaign.status === 'sent' && <Send size={10} />}
                    {campaign.status === 'partial' && <AlertTriangle size={10} />}
                    {statusLabel(campaign.status)}
                  </span>
                </div>
                {campaign.subject && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 truncate">{campaign.subject}</p>
                )}
                <p className="text-xs text-gray-400 mt-1">
                  {t('sentAtLabel')}: {campaign.sent_at ? format(new Date(campaign.sent_at), 'yyyy/MM/dd HH:mm') : t('notSent')}
                </p>
              </div>
            </div>

            {/* Partial send errors */}
            {campaign.status === 'partial' && campaign.send_errors && campaign.send_errors.length > 0 && (
              <div className="mb-6 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30">
                <button
                  onClick={() => setShowErrors((v) => !v)}
                  className="flex items-center gap-2 w-full px-4 py-3 text-sm font-medium text-red-700 dark:text-red-300"
                >
                  {showErrors ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  {t('sendErrorsTitle', { count: campaign.failed_count ?? campaign.send_errors.length })}
                </button>
                {showErrors && (
                  <ul className="px-4 pb-3 space-y-1 text-xs text-red-600 dark:text-red-400 font-mono">
                    {campaign.send_errors.map((e, i) => (
                      <li key={i} className="break-all">{e}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {loadError || !analytics ? (
              <div className="text-center py-16 text-gray-400 text-sm">{t('loadError')}</div>
            ) : (
              <>
                {/* Stat cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                  <StatCard icon={Send} label={t('statSent')} value={analytics.summary.sent} color="text-blue-500" />
                  <StatCard
                    icon={AlertTriangle}
                    label={t('statFailed')}
                    value={analytics.summary.failed}
                    color={analytics.summary.failed > 0 ? 'text-red-500' : 'text-gray-300'}
                  />
                  <StatCard
                    icon={Eye}
                    label={t('statOpened')}
                    value={analytics.summary.opened}
                    sub={t('rateOpen', { rate: pct(analytics.summary.openRate) })}
                    color="text-green-500"
                  />
                  <StatCard
                    icon={MousePointerClick}
                    label={t('statClicked')}
                    value={analytics.summary.clicked}
                    sub={t('rateClick', { rate: pct(analytics.summary.clickRate) })}
                    color="text-purple-500"
                  />
                </div>

                {analytics.variants.length > 0 && (
                  <section className="mb-6">
                    <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">{t('abTitle')}</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {analytics.variants.map((v) => (
                        <div key={v.variant} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                            {v.variant === 'a' ? t('abVariantA') : t('abVariantB')}
                          </p>
                          <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{t('abOpenRate', { rate: pct(v.openRate) })}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{t('abSent', { count: v.sent })}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {!analytics.hasEventData ? (
                  /* No raw event feed (campaign predates v7.2.9) */
                  <div className="flex flex-col items-center justify-center gap-3 text-center py-16 px-6 rounded-lg border border-dashed border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40">
                    <BarChart3 size={36} className="text-gray-300 dark:text-gray-600" />
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('noEventDataTitle')}</p>
                    <p className="text-xs text-gray-400 max-w-md">{t('noEventDataDesc')}</p>
                  </div>
                ) : (
                  <>
                    {/* Link clicks table */}
                    <section className="mb-8">
                      <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">{t('clicksTitle')}</h2>
                      {analytics.clicksByUrl.length === 0 ? (
                        <div className="text-center py-10 text-gray-400 text-sm rounded-lg border border-gray-200 dark:border-gray-700">
                          {t('noClicks')}
                        </div>
                      ) : (
                        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                          <table className="w-full text-sm min-w-[480px]">
                            <thead>
                              <tr className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700">
                                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{t('colUrl')}</th>
                                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">{t('colClicks')}</th>
                                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">{t('colUniqueEmails')}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                              {analytics.clicksByUrl.map((c) => (
                                <tr key={c.url} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                                  <td className="px-4 py-3 max-w-[360px]">
                                    <a
                                      href={c.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      title={c.url}
                                      className="block truncate text-blue-600 dark:text-blue-400 hover:underline"
                                    >
                                      {c.url}
                                    </a>
                                  </td>
                                  <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-900 dark:text-gray-100">{c.clicks}</td>
                                  <td className="px-4 py-3 text-right tabular-nums text-gray-500 dark:text-gray-400">{c.uniqueEmails}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </section>

                    {/* Timeline */}
                    <section className="mb-8">
                      <div className="flex items-center justify-between mb-3">
                        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{t('timelineTitle')}</h2>
                        <div className="flex items-center gap-3 text-xs text-gray-400">
                          <span className="flex items-center gap-1"><span className="inline-block w-3 h-2 rounded bg-green-400" />{t('legendOpens')}</span>
                          <span className="flex items-center gap-1"><span className="inline-block w-3 h-2 rounded bg-purple-400" />{t('legendClicks')}</span>
                        </div>
                      </div>
                      {analytics.timeline.length === 0 ? (
                        <div className="text-center py-10 text-gray-400 text-sm rounded-lg border border-gray-200 dark:border-gray-700">
                          {t('noTimeline')}
                        </div>
                      ) : (
                        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-2">
                          {(() => {
                            const max = Math.max(1, ...analytics.timeline.flatMap((b) => [b.opens, b.clicks]))
                            return analytics.timeline.map((b) => (
                              <div key={b.hour} className="flex items-center gap-3 text-xs">
                                <span className="w-20 shrink-0 text-gray-400 tabular-nums">{b.hour}</span>
                                <div className="flex-1 min-w-0 space-y-1">
                                  <div className="flex items-center gap-1.5">
                                    <div className="h-2 rounded bg-green-400" style={{ width: `${(b.opens / max) * 100}%` }} />
                                    <span className="text-gray-400 tabular-nums">{b.opens}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <div className="h-2 rounded bg-purple-400" style={{ width: `${(b.clicks / max) * 100}%` }} />
                                    <span className="text-gray-400 tabular-nums">{b.clicks}</span>
                                  </div>
                                </div>
                              </div>
                            ))
                          })()}
                        </div>
                      )}
                    </section>

                    {/* Other events */}
                    <section className="mb-8">
                      <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">{t('eventsTitle')}</h2>
                      <div className="grid grid-cols-3 gap-3">
                        <StatCard icon={MailWarning} label={t('eventBounces')} value={analytics.events.bounces} color={analytics.events.bounces > 0 ? 'text-red-500' : 'text-gray-300'} />
                        <StatCard icon={UserMinus} label={t('eventUnsubscribes')} value={analytics.events.unsubscribes} color={analytics.events.unsubscribes > 0 ? 'text-amber-500' : 'text-gray-300'} />
                        <StatCard icon={ShieldAlert} label={t('eventSpamreports')} value={analytics.events.spamreports} color={analytics.events.spamreports > 0 ? 'text-red-500' : 'text-gray-300'} />
                      </div>
                    </section>
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>
    </PermissionGate>
  )
}
