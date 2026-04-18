'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { ArrowLeft, Loader2, CheckCircle, Eye, MousePointerClick, AlertTriangle, Clock, Download, RefreshCw, Zap, Sparkles, X, Check } from 'lucide-react'
import { format } from 'date-fns'

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

type OcrStatus = 'pending' | 'processing' | 'done' | 'no_image' | 'error'
interface OcrRow {
  contact_id: string
  name: string | null
  currentEmail: string
  cardImgUrl: string | null
  cardImgBackUrl: string | null
  suggestedEmail: string | null
  status: OcrStatus
  error?: string
}

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
  return format(new Date(iso), 'MM/dd HH:mm')
}

async function imgUrlToBase64(url: string): Promise<string> {
  const res = await fetch(url)
  const blob = await res.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const t = useTranslations('campaigns')
  const tc = useTranslations('common')
  const supabase = createBrowserSupabaseClient()

  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('all')

  // Backfill / webhook test
  const [backfilling, setBackfilling] = useState(false)
  const [backfillResult, setBackfillResult] = useState<string | null>(null)
  const [webhookTesting, setWebhookTesting] = useState(false)
  const [webhookResult, setWebhookResult] = useState<string | null>(null)

  // Bulk OCR
  const [showOcrModal, setShowOcrModal] = useState(false)
  const [ocrRows, setOcrRows] = useState<OcrRow[]>([])
  const [ocrSelected, setOcrSelected] = useState<Set<string>>(new Set())
  const [ocrSaving, setOcrSaving] = useState(false)
  const ocrAbortRef = useRef(false)

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

  async function handleBackfill() {
    setBackfilling(true)
    setBackfillResult(null)
    try {
      const res = await fetch('/api/email/backfill-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: id }),
      })
      const data = await res.json()
      if (!res.ok) {
        setBackfillResult(`錯誤：${data.error ?? res.status}${data.detail ? ` — ${JSON.stringify(data.detail)}` : ''}`)
      } else if (data.inserted === 0) {
        setBackfillResult(data.note ?? '沒有新事件可補入')
      } else {
        setBackfillResult(`成功補入 ${data.inserted} 筆事件（共查到 ${data.messages} 封郵件）`)
        await loadData()
      }
    } catch (e) {
      setBackfillResult(e instanceof Error ? e.message : String(e))
    } finally {
      setBackfilling(false)
    }
  }

  async function handleWebhookTest() {
    setWebhookTesting(true)
    setWebhookResult(null)
    try {
      const res = await fetch('/api/email/webhook-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: id }),
      })
      const data = await res.json()
      if (data.ok) {
        setWebhookResult('Webhook 正常運作！測試事件已寫入資料庫。')
        await loadData()
      } else {
        setWebhookResult(`Webhook 錯誤：${data.error ?? JSON.stringify(data)}`)
      }
    } catch (e) {
      setWebhookResult(e instanceof Error ? e.message : String(e))
    } finally {
      setWebhookTesting(false)
    }
  }

  async function handleBulkOcr() {
    const bouncedRecips = recipients.filter(r => r.bounced_at)
    if (bouncedRecips.length === 0) return

    const bouncedIds = bouncedRecips.map(r => r.contact_id)

    // Fetch card images for these contacts
    const { data: cardContacts } = await supabase
      .from('contacts')
      .select('id, name, email, card_img_url, card_img_back_url')
      .in('id', bouncedIds)

    const rows: OcrRow[] = bouncedIds.map(cid => {
      const cc = cardContacts?.find(c => c.id === cid)
      const rec = bouncedRecips.find(r => r.contact_id === cid)
      return {
        contact_id: cid,
        name: cc?.name ?? rec?.contact_name ?? null,
        currentEmail: rec?.contact_email ?? cc?.email ?? '',
        cardImgUrl: cc?.card_img_url ?? null,
        cardImgBackUrl: cc?.card_img_back_url ?? null,
        suggestedEmail: null,
        status: cc?.card_img_url ? 'pending' : 'no_image',
      }
    })

    setOcrRows(rows)
    setOcrSelected(new Set())
    setShowOcrModal(true)
    ocrAbortRef.current = false

    // Process each pending row sequentially
    for (let i = 0; i < rows.length; i++) {
      if (ocrAbortRef.current) break
      const row = rows[i]
      if (row.status !== 'pending') continue

      setOcrRows(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'processing' } : r))

      try {
        const images: string[] = [await imgUrlToBase64(row.cardImgUrl!)]
        if (row.cardImgBackUrl) images.push(await imgUrlToBase64(row.cardImgBackUrl))

        const ocrRes = await fetch('/api/ocr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ images }),
        })
        const ocrData = await ocrRes.json()
        const suggested = (ocrData.email as string | undefined)?.trim() ?? null

        setOcrRows(prev => prev.map((r, idx) => idx === i ? { ...r, suggestedEmail: suggested, status: 'done' } : r))

        // Auto-select rows where OCR found a different email
        if (suggested && suggested.toLowerCase() !== row.currentEmail.toLowerCase()) {
          setOcrSelected(prev => new Set([...prev, row.contact_id]))
        }
      } catch (e) {
        setOcrRows(prev => prev.map((r, idx) => idx === i ? {
          ...r, status: 'error', error: e instanceof Error ? e.message : String(e),
        } : r))
      }
    }
  }

  async function handleOcrApply() {
    setOcrSaving(true)
    const toUpdate = ocrRows.filter(r => ocrSelected.has(r.contact_id) && r.suggestedEmail)
    for (const row of toUpdate) {
      await supabase.from('contacts').update({
        email: row.suggestedEmail,
        email_status: null,  // clear bounced so next send will retry
      }).eq('id', row.contact_id)
    }
    setOcrSaving(false)
    setShowOcrModal(false)
    await loadData()
  }

  function exportCsv() {
    const rows = [
      [t('csvName'), t('csvEmail'), t('csvCompany'), t('csvDelivered'), t('csvFirstOpened'), t('csvOpenCount'), t('csvLastClicked'), t('csvBounced')],
      ...filtered.map(r => [
        r.contact_name ?? '',
        r.contact_email,
        r.company ?? '',
        fmt(r.delivered_at),
        fmt(r.first_opened_at),
        String(r.open_count),
        fmt(r.last_clicked_at),
        r.bounced_at ? t('csvYes') : '',
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
        <Loader2 className="animate-spin mr-2" size={20} /> {tc('loading')}
      </div>
    )
  }

  if (!campaign) {
    return (
      <div className="text-center py-20 text-gray-400 text-sm">{t('notFound')}</div>
    )
  }

  const methodLabel = campaign.method === 'outlook' ? 'Outlook' : 'SendGrid BCC'

  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: 'all',      label: t('tabAll'),      count: recipients.length },
    { key: 'opened',   label: t('tabOpened'),   count: opened },
    { key: 'unopened', label: t('tabUnopened'), count: unopened },
    { key: 'bounced',  label: t('tabBounced'),  count: bounced },
  ]

  // OCR progress
  const ocrDone    = ocrRows.filter(r => r.status === 'done' || r.status === 'no_image' || r.status === 'error').length
  const ocrTotal   = ocrRows.length
  const ocrPending = ocrRows.some(r => r.status === 'pending' || r.status === 'processing')
  const ocrChanged = ocrRows.filter(r => r.status === 'done' && r.suggestedEmail && r.suggestedEmail.toLowerCase() !== r.currentEmail.toLowerCase())

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
              {campaign.method === 'outlook' ? t('methodOutlookBcc') : campaign.sg_mode === 'bcc' ? t('methodSgBcc') : t('methodSgIndividual')}
            </span>
            <span className="text-xs text-gray-400">{t('recipients', { count: campaign.total_recipients })}</span>
            <span className="text-xs text-gray-400">
              {format(new Date(campaign.created_at), 'yyyy/MM/dd HH:mm')}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isTrackable && (
            <>
              <button
                onClick={handleWebhookTest}
                disabled={webhookTesting}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                {webhookTesting ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
                測試 Webhook
              </button>
              <button
                onClick={handleBackfill}
                disabled={backfilling}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors disabled:opacity-50"
              >
                {backfilling ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                補回記錄
              </button>
            </>
          )}
          <button
            onClick={exportCsv}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <Download size={13} />
            {t('exportCsv')}
          </button>
        </div>
      </div>

      {/* Backfill / webhook test result banners */}
      {(backfillResult || webhookResult) && (
        <div className="mb-4 space-y-2">
          {backfillResult && (
            <div className={`px-4 py-2.5 rounded-lg text-sm ${backfillResult.startsWith('錯誤') ? 'bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300' : 'bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300'}`}>
              {backfillResult}
            </div>
          )}
          {webhookResult && (
            <div className={`px-4 py-2.5 rounded-lg text-sm ${webhookResult.includes('錯誤') ? 'bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300' : 'bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300'}`}>
              {webhookResult}
            </div>
          )}
        </div>
      )}

      {/* No tracking notice */}
      {!isTrackable && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-sm text-amber-700 dark:text-amber-300">
          {t('noTrackingNotice', { method: methodLabel })}
        </div>
      )}

      {/* Stats row */}
      {isTrackable && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <StatCard icon={CheckCircle}        label={t('statDelivered')} value={delivered} color="text-blue-500" />
          <StatCard icon={Eye}                label={t('statOpened')}   value={opened}    color="text-green-500" />
          <StatCard icon={MousePointerClick}  label={t('statClicked')}  value={clicked}   color="text-purple-500" />
          <StatCard icon={AlertTriangle}      label={t('statBounced')}  value={bounced}   color={bounced > 0 ? 'text-red-500' : 'text-gray-300'} />
        </div>
      )}

      {/* Tabs + bulk OCR button */}
      <div className="flex items-center justify-between mb-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex gap-1">
          {TABS.map(tab_ => (
            <button
              key={tab_.key}
              onClick={() => setTab(tab_.key)}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === tab_.key
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {tab_.label}
              <span className="ml-1.5 text-xs text-gray-400">({tab_.count})</span>
            </button>
          ))}
        </div>
        {tab === 'bounced' && bounced > 0 && isTrackable && (
          <button
            onClick={handleBulkOcr}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 mb-1 rounded-lg border border-orange-200 dark:border-orange-800 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors"
          >
            <Sparkles size={13} />
            批量 OCR 重新掃描
          </button>
        )}
      </div>

      {/* Recipient table */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">{tc('noData')}</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">{t('colNameEmail')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">{t('colCompany')}</th>
                {isTrackable && (
                  <>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">{t('colStatus')}</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">{t('colFirstOpened')}</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">{t('colOpenCount')}</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">{t('colLastClicked')}</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
              {filtered.map(r => {
                const status = r.bounced_at
                  ? { label: t('statusBounced'),   cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' }
                  : r.first_opened_at
                  ? { label: t('statusOpened'),    cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' }
                  : r.delivered_at
                  ? { label: t('statusDelivered'), cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400' }
                  : { label: t('statusSending'),   cls: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' }

                return (
                  <tr key={r.contact_id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`/contacts/${r.contact_id}`}
                        className="font-medium text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                      >
                        {r.contact_name || '—'}
                      </Link>
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

      {/* ── Bulk OCR Modal ── */}
      {showOcrModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-3xl mt-8 mb-8">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">批量 OCR 重新掃描退信名單</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {ocrPending
                    ? `處理中 ${ocrDone} / ${ocrTotal}…`
                    : `掃描完成 — ${ocrChanged.length} 人 email 與現有不同`}
                </p>
              </div>
              <button
                onClick={() => { ocrAbortRef.current = true; setShowOcrModal(false) }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X size={20} />
              </button>
            </div>

            {/* Progress bar */}
            {ocrPending && (
              <div className="px-6 pt-3">
                <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-orange-400 transition-all duration-300"
                    style={{ width: `${ocrTotal > 0 ? (ocrDone / ocrTotal) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}

            {/* Results table */}
            <div className="overflow-x-auto px-4 py-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 font-medium">
                    <th className="text-left pb-2 pl-2 w-6"></th>
                    <th className="text-left pb-2">姓名</th>
                    <th className="text-left pb-2">現有 Email</th>
                    <th className="text-left pb-2">OCR 建議</th>
                    <th className="text-center pb-2 w-16">狀態</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {ocrRows.map(row => {
                    const isDiff = row.suggestedEmail && row.suggestedEmail.toLowerCase() !== row.currentEmail.toLowerCase()
                    const isSelected = ocrSelected.has(row.contact_id)
                    return (
                      <tr key={row.contact_id} className={`${isDiff ? 'bg-orange-50/50 dark:bg-orange-950/20' : ''}`}>
                        <td className="pl-2 py-2.5">
                          {isDiff && (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={e => {
                                const next = new Set(ocrSelected)
                                e.target.checked ? next.add(row.contact_id) : next.delete(row.contact_id)
                                setOcrSelected(next)
                              }}
                              className="rounded border-gray-300"
                            />
                          )}
                        </td>
                        <td className="py-2.5 pr-3">
                          <Link href={`/contacts/${row.contact_id}`} className="font-medium text-gray-900 dark:text-gray-100 hover:text-blue-600 transition-colors">
                            {row.name || '—'}
                          </Link>
                        </td>
                        <td className="py-2.5 pr-3 text-gray-500 dark:text-gray-400 font-mono text-xs">{row.currentEmail}</td>
                        <td className="py-2.5 pr-3">
                          {row.status === 'done' && row.suggestedEmail ? (
                            <span className={`font-mono text-xs ${isDiff ? 'text-orange-600 dark:text-orange-400 font-semibold' : 'text-gray-400'}`}>
                              {row.suggestedEmail}
                              {!isDiff && <span className="ml-1 text-gray-300">(同)</span>}
                            </span>
                          ) : row.status === 'no_image' ? (
                            <span className="text-xs text-gray-300">無名片圖片</span>
                          ) : row.status === 'error' ? (
                            <span className="text-xs text-red-400">{row.error}</span>
                          ) : null}
                        </td>
                        <td className="py-2.5 text-center">
                          {row.status === 'processing' && <Loader2 size={14} className="animate-spin text-orange-400 mx-auto" />}
                          {row.status === 'done' && isDiff && <AlertTriangle size={14} className="text-orange-400 mx-auto" />}
                          {row.status === 'done' && !isDiff && <Check size={14} className="text-green-400 mx-auto" />}
                          {row.status === 'no_image' && <span className="text-xs text-gray-300">—</span>}
                          {row.status === 'error' && <X size={14} className="text-red-400 mx-auto" />}
                          {row.status === 'pending' && <span className="text-xs text-gray-300">待處理</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Modal footer */}
            {!ocrPending && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700">
                <p className="text-xs text-gray-400">
                  已選 {ocrSelected.size} 人更新 email；套用後會清除退信狀態，下次可重新寄信。
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => { ocrAbortRef.current = true; setShowOcrModal(false) }}
                    className="text-xs px-4 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleOcrApply}
                    disabled={ocrSelected.size === 0 || ocrSaving}
                    className="flex items-center gap-1.5 text-xs px-4 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-medium transition-colors disabled:opacity-50"
                  >
                    {ocrSaving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                    套用 {ocrSelected.size} 筆更新
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
