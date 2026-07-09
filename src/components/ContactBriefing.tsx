'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { Sparkles, ExternalLink, Loader2, RefreshCw } from 'lucide-react'

interface BriefingSource { title: string; url: string }
interface Briefing {
  id: string
  status: 'pending' | 'processing' | 'done' | 'failed'
  result_md: string | null
  sources: BriefingSource[] | null
  model_used: string | null
  error_message: string | null
  created_at: string
}

// 會議前 Social Briefing：對聯絡人產生「人物+公司最新公開動態」摘要（Gemini grounding）。
// 非同步：POST 排程 → 輪詢 GET 直到 done/failed。
export default function ContactBriefing({ contactId }: { contactId: string }) {
  const t = useTranslations('briefing')
  const tc = useTranslations('common')
  const locale = useLocale()
  const [briefing, setBriefing] = useState<Briefing | null>(null)
  const [hydrating, setHydrating] = useState(true)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 輪詢連續失敗次數，達上限即停止輪詢並顯示錯誤
  const pollFailRef = useRef(0)

  const clearPoll = () => { if (pollRef.current) clearTimeout(pollRef.current) }
  useEffect(() => () => clearPoll(), [])

  const poll = useCallback((id: string) => {
    clearPoll()
    pollRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/social-briefing/${id}`)
        if (!res.ok) throw new Error('poll failed')
        const data: Briefing = await res.json()
        pollFailRef.current = 0
        setBriefing(data)
        if (data.status === 'pending' || data.status === 'processing') poll(id)
      } catch {
        // 連續失敗達 3 次則停止輪詢並顯示錯誤
        pollFailRef.current += 1
        if (pollFailRef.current >= 3) {
          setError(tc('error'))
        } else {
          poll(id)
        }
      }
    }, 3000)
  }, [tc])

  // 掛載時載回該聯絡人最新一份已存 briefing（生成中則接續輪詢）；失敗當作沒有歷史。
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/social-briefing/latest?contactId=${contactId}`)
        if (res.ok) {
          const data = await res.json().catch(() => null)
          if (!cancelled && data?.briefing) {
            setBriefing(data.briefing as Briefing)
            const s = (data.briefing as Briefing).status
            if (s === 'pending' || s === 'processing') poll((data.briefing as Briefing).id)
          }
        }
      } catch { /* 載入失敗 → 維持空狀態，可手動產生 */ }
      if (!cancelled) setHydrating(false)
    })()
    return () => { cancelled = true }
  }, [contactId, poll])

  async function generate() {
    setStarting(true)
    setError(null)
    pollFailRef.current = 0
    clearPoll()
    try {
      const res = await fetch('/api/social-briefing/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: contactId }),
      })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.id) {
        setBriefing({ id: data.id, status: 'pending', result_md: null, sources: null, model_used: null, error_message: null, created_at: new Date().toISOString() })
        poll(data.id)
      } else {
        // 4xx 顯示 API 回傳的 error，5xx 顯示通用訊息
        setError(res.status >= 500 ? tc('error') : (data?.error ?? tc('error')))
      }
    } catch {
      setError(tc('error'))
    } finally {
      setStarting(false)
    }
  }

  const inProgress = briefing?.status === 'pending' || briefing?.status === 'processing'
  const html = briefing?.result_md
    ? DOMPurify.sanitize(marked.parse(briefing.result_md, { async: false }) as string)
    : ''

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-center justify-between gap-2 mb-4">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Sparkles size={16} className="text-blue-500" /> {t('title')}
        </h2>
        <button
          onClick={generate}
          disabled={starting || inProgress}
          className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
        >
          {inProgress || starting ? <Loader2 size={15} className="animate-spin" /> : briefing ? <RefreshCw size={15} /> : <Sparkles size={15} />}
          {briefing ? t('regenerate') : t('generate')}
        </button>
      </div>

      {!briefing && !error && (
        hydrating
          ? <p className="text-sm text-gray-400 dark:text-gray-500 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> {tc('loading')}</p>
          : <p className="text-sm text-gray-500 dark:text-gray-400">{t('intro')}</p>
      )}

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {inProgress && (
        <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" /> {t('generating')}
        </p>
      )}

      {briefing?.status === 'failed' && (
        <p className="text-sm text-red-600 dark:text-red-400">{t('failed')}{briefing.error_message ? `：${briefing.error_message}` : ''}</p>
      )}

      {briefing?.status === 'done' && (
        <div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">
            {t('generatedAt', { date: new Date(briefing.created_at).toLocaleString(locale) })}
            {briefing.model_used ? `（${briefing.model_used}）` : ''}
          </p>
          <div
            className="prose prose-sm dark:prose-invert max-w-none text-gray-800 dark:text-gray-200"
            dangerouslySetInnerHTML={{ __html: html }}
          />
          {briefing.sources && briefing.sources.length > 0 && (
            <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">{t('sources')}</p>
              <ul className="space-y-1">
                {briefing.sources.map((s, i) => (
                  <li key={i}>
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline">
                      <ExternalLink size={11} className="shrink-0" /> <span className="truncate">{s.title}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
