'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { ArrowLeft, Loader2, Mail, CheckCircle, Eye, MousePointerClick, AlertTriangle, Clock, Download } from 'lucide-react'
import { format } from 'date-fns'
import { zhTW } from 'date-fns/locale'

interface Campaign {
  id: string
  subject: string
  method: string
  sg_mode: string | null
  total_recipients: number
  created_at: string
}

interface Recipient {
  contact_id: string
  contact_name: string | null
  contact_email: string
  company: string | null
  delivered_at: string | null
  first_opened_at: string | null
  open_count: number
  last_clicked_at: string | null
  bounced_at: string | null
}

type Tab = 'all' | 'opened' | 'unopened' | 'bounced'

function StatCard({ icon: Icon, label, value, color }: {
  icon: React.ElementType
  label: string
  value: number | string
  color: string
}) {
  return (
    <div className="flex flex-col items-center justify-center px-5 py-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <Icon size={18} className={`mb-1.5 ${color}`} />
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{label}</p>
    </div>
  )
}

function fmt(iso: string | null) {
  if (!iso) return '—'
  return format(new Date(iso), 'MM/dd HH:mm', { locale: zhTW })
}

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createBrowserSupabaseClient()

  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('all')

  useEffect(() => { loadData() }, [id])

  async function loadData() {
    const [{ data: camp }, { data: recs }] = await Promise.all([
      supabase
        .from('email_campaigns')
        .select('id, subject, method, sg_mode, total_recipients, created_at')
        .eq('id', id)
        .single(),
      supabase.rpc('get_campaign_recipients', { p_campaign_id: id }),
    ])
    setCampaign(camp)
    setRecipients((recs ?? []) as Recipient[])
    setLoading(false)
  }

  const isTrackable = campaign?.method === 'sendgrid' && campaign?.sg_mode === 'individual'

  const delivered  = recipients.filter(r => r.delivered_at).length
  const opened     = recipients.filter(r => r.first_opened_at).length
  const clicked    = recipients.filter(r => r.last_clicked_at).length
  const bounced    = recipients.filter(r => r.bounced_at).length
  const unopened   = delivered - opened

  const filtered = recipients.filter(r => {
    if (tab === 'opened')   return !!r.first_opened_at
    if (tab === 'unopened') return !!r.delivered_at && !r.first_opened_at
    if (tab === 'bounced')  return !!r.bounced_at
    return true
  })

  function exportCsv() {
    const rows = [
      ['姓名', '信箱', '公司', '送達時間', '首次開信', '開信次數', '最後點擊', '退信'],
      ...filtered.map(r => [
        r.contact_name ?? '',
        r.contact_email,
        r.company ?? '',
        fmt(r.delivered_at),
        fmt(r.first_opened_at),
        String(r.open_count),
        fmt(r.last_clicked_at),
        r.bounced_at ? '是' : '',
      ]),
    ]
    const csv = rows.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `campaign-${id.slice(0, 8)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <Loader2 className="animate-spin mr-2" size={20} /> 載入中...
      </div>
    )
  }

  if (!campaign) {
    return (
      <div className="text-center py-20 text-gray-400 text-sm">找不到此活動</div>
    )
  }

  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: 'all',      label: '全部',   count: recipients.length },
    { key: 'opened',   label: '已開信', count: opened },
    { key: 'unopened', label: '未開信', count: unopened },
    { key: 'bounced',  label: '退信',   count: bounced },
  ]

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start gap-3 mb-6">
        <button onClick={() => router.push('/email/campaigns')} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 mt-0.5">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">{campaign.subject}</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
              campaign.method === 'outlook'
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400'
                : 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400'
            }`}>
              {campaign.method === 'outlook' ? 'Outlook BCC' : campaign.sg_mode === 'bcc' ? 'SendGrid BCC' : 'SendGrid 個人化'}
            </span>
            <span className="text-xs text-gray-400">共 {campaign.total_recipients} 人</span>
            <span className="text-xs text-gray-400">
              {format(new Date(campaign.created_at), 'yyyy/MM/dd HH:mm', { locale: zhTW })}
            </span>
          </div>
        </div>
        <button
          onClick={exportCsv}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shrink-0"
        >
          <Download size={13} />
          匯出 CSV
        </button>
      </div>

      {/* No tracking notice */}
      {!isTrackable && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-sm text-amber-700 dark:text-amber-300">
          此活動使用 {campaign.method === 'outlook' ? 'Outlook' : 'SendGrid BCC'} 模式，無法追蹤個別收件人的開信狀態。
          僅 <strong>SendGrid 個人化</strong>模式支援開信率報表。
        </div>
      )}

      {/* Stats row */}
      {isTrackable && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <StatCard icon={CheckCircle}        label="送達"   value={delivered} color="text-blue-500" />
          <StatCard icon={Eye}                label="開信人數" value={opened}    color="text-green-500" />
          <StatCard icon={MousePointerClick}  label="點擊人數" value={clicked}   color="text-purple-500" />
          <StatCard icon={AlertTriangle}      label="退信"   value={bounced}   color={bounced > 0 ? 'text-red-500' : 'text-gray-300'} />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200 dark:border-gray-700">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            {t.label}
            <span className="ml-1.5 text-xs text-gray-400">({t.count})</span>
          </button>
        ))}
      </div>

      {/* Recipient table */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">無資料</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">姓名 / 信箱</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">公司</th>
                {isTrackable && (
                  <>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">狀態</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">首次開信</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">開信次數</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">最後點擊</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
              {filtered.map(r => {
                const status = r.bounced_at
                  ? { label: '退信', cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' }
                  : r.first_opened_at
                  ? { label: '已開信', cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' }
                  : r.delivered_at
                  ? { label: '未開信', cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400' }
                  : { label: '傳送中', cls: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' }

                return (
                  <tr key={r.contact_id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 dark:text-gray-100">{r.contact_name || '—'}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{r.contact_email}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{r.company || '—'}</td>
                    {isTrackable && (
                      <>
                        <td className="px-4 py-3">
                          <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${status.cls}`}>
                            {status.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                          {r.first_opened_at ? (
                            <span className="flex items-center gap-1">
                              <Clock size={12} className="text-green-500" />
                              {fmt(r.first_opened_at)}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {r.open_count > 0 ? (
                            <span className="text-green-600 dark:text-green-400 font-medium">{r.open_count}</span>
                          ) : (
                            <span className="text-gray-300 dark:text-gray-600">0</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                          {r.last_clicked_at ? (
                            <span className="flex items-center gap-1">
                              <MousePointerClick size={12} className="text-purple-500" />
                              {fmt(r.last_clicked_at)}
                            </span>
                          ) : '—'}
                        </td>
                      </>
                    )}
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
