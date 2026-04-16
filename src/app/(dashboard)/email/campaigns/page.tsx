'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { Mail, ChevronRight, Loader2, BarChart2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { zhTW } from 'date-fns/locale'

interface Campaign {
  id: string
  subject: string
  method: 'outlook' | 'sendgrid'
  sg_mode: 'individual' | 'bcc' | null
  total_recipients: number
  created_at: string
}

interface Stats {
  campaign_id: string
  delivered_count: number
  open_count: number
  click_count: number
  bounce_count: number
}

function pct(num: number, den: number) {
  if (!den) return null
  return Math.round((num / den) * 100)
}

export default function EmailCampaignsPage() {
  const router = useRouter()
  const supabase = createBrowserSupabaseClient()

  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [statsMap, setStatsMap] = useState<Record<string, Stats>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const [{ data: camps }, { data: stats }] = await Promise.all([
      supabase
        .from('email_campaigns')
        .select('id, subject, method, sg_mode, total_recipients, created_at')
        .order('created_at', { ascending: false })
        .limit(100),
      supabase.rpc('get_campaign_stats'),
    ])

    setCampaigns(camps ?? [])
    const map: Record<string, Stats> = {}
    for (const s of (stats ?? []) as Stats[]) map[s.campaign_id] = s
    setStatsMap(map)
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <Loader2 className="animate-spin mr-2" size={20} /> 載入中...
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <BarChart2 size={20} className="text-gray-400" />
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">郵件寄送紀錄</h1>
        <span className="text-sm text-gray-400">（共 {campaigns.length} 筆）</span>
      </div>

      {campaigns.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Mail size={44} className="mx-auto mb-3 opacity-25" />
          <p className="text-sm">尚無寄送紀錄</p>
        </div>
      ) : (
        <div className="space-y-2">
          {campaigns.map(c => {
            const s = statsMap[c.id]
            const isIndividual = c.method === 'sendgrid' && c.sg_mode === 'individual'
            const openRate = isIndividual && s ? pct(s.open_count, s.delivered_count) : null

            return (
              <button
                key={c.id}
                onClick={() => router.push(`/email/campaigns/${c.id}`)}
                className="w-full text-left flex items-center gap-4 px-4 py-3.5 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 transition-colors group"
              >
                {/* Subject + meta */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{c.subject}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                      c.method === 'outlook'
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400'
                        : 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400'
                    }`}>
                      {c.method === 'outlook' ? 'Outlook BCC' : c.sg_mode === 'bcc' ? 'SendGrid BCC' : 'SendGrid 個人化'}
                    </span>
                    <span className="text-xs text-gray-400">{c.total_recipients} 人</span>
                    <span className="text-xs text-gray-400">
                      {formatDistanceToNow(new Date(c.created_at), { locale: zhTW, addSuffix: true })}
                    </span>
                  </div>
                </div>

                {/* Stats */}
                {isIndividual && s ? (
                  <div className="flex items-center gap-5 text-center shrink-0">
                    <div>
                      <p className="text-[11px] text-gray-400 mb-0.5">送達</p>
                      <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{s.delivered_count}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-gray-400 mb-0.5">開信率</p>
                      <p className={`text-sm font-semibold ${openRate !== null ? 'text-green-600 dark:text-green-400' : 'text-gray-300'}`}>
                        {openRate !== null ? `${openRate}%` : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-gray-400 mb-0.5">點擊</p>
                      <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{s.click_count}</p>
                    </div>
                    {s.bounce_count > 0 && (
                      <div>
                        <p className="text-[11px] text-gray-400 mb-0.5">退信</p>
                        <p className="text-sm font-semibold text-red-500">{s.bounce_count}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-gray-400 shrink-0">無追蹤資料</span>
                )}

                <ChevronRight size={15} className="text-gray-300 dark:text-gray-600 shrink-0 group-hover:text-gray-500 transition-colors" />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
