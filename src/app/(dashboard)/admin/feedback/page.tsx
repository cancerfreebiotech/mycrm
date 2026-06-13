'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { MessageSquare, ExternalLink } from 'lucide-react'

type FeedbackStatus = 'open' | 'in_progress' | 'done' | 'wont_fix'

interface FeedbackItem {
  id: string
  type: 'feature' | 'bug'
  title: string
  description: string
  screenshot_url: string | null
  created_at: string
  status: FeedbackStatus
  users: { display_name: string | null; email: string } | null
}

const STATUS_OPTIONS: FeedbackStatus[] = ['open', 'in_progress', 'done', 'wont_fix']

export default function AdminFeedbackPage() {
  const t = useTranslations('feedback')
  const tc = useTranslations('common')
  const supabase = createBrowserSupabaseClient()

  const [items, setItems] = useState<FeedbackItem[]>([])
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  useEffect(() => {
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    const { data, error: loadError } = await supabase
      .from('feedback')
      .select('id, type, title, description, screenshot_url, created_at, status, users(display_name, email)')
      .order('created_at', { ascending: false })
    if (loadError) {
      setError(tc('error'))
      setLoading(false)
      return
    }
    const list = (data ?? []) as unknown as FeedbackItem[]
    setItems(list)

    // 截圖存於 private bucket，需簽短效 URL 才能顯示。
    const paths = list.map(i => i.screenshot_url).filter((p): p is string => !!p)
    if (paths.length) {
      const { data: signed } = await supabase.storage.from('feedback').createSignedUrls(paths, 3600)
      if (signed) {
        const map: Record<string, string> = {}
        signed.forEach(s => { if (s.path && s.signedUrl) map[s.path] = s.signedUrl })
        setSignedUrls(map)
      }
    }
    setLoading(false)
  }

  async function handleStatusChange(id: string, status: FeedbackStatus) {
    setUpdatingId(id)
    setError(null)
    const { error: updateError } = await supabase
      .from('feedback')
      .update({ status })
      .eq('id', id)
      .select('id')
      .single()
    if (updateError) {
      setError(tc('error'))
      setUpdatingId(null)
      return
    }
    setItems(prev => prev.map(i => i.id === id ? { ...i, status } : i))
    setUpdatingId(null)
  }

  const statusLabel: Record<FeedbackStatus, string> = {
    open: t('statusOpen'),
    in_progress: t('statusInProgress'),
    done: t('statusDone'),
    wont_fix: t('statusWontFix'),
  }

  const statusColor: Record<FeedbackStatus, string> = {
    open: 'bg-yellow-100 dark:bg-yellow-950 text-yellow-700 dark:text-yellow-400',
    in_progress: 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-400',
    done: 'bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400',
    wont_fix: 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
  }

  if (loading) return <div className="text-sm text-gray-400">{tc('loading')}</div>

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-2 mb-6">
        <MessageSquare size={22} className="text-blue-500" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('manage')}</h1>
        <span className="text-sm text-gray-400 ml-2">{tc('total', { count: items.length })}</span>
      </div>

      {error && (
        <p className="mb-4 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg px-4 py-2">
          {error}
        </p>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-gray-400">{t('noFeedback')}</p>
      ) : (
        <div className="space-y-3">
          {items.map(item => (
            <div
              key={item.id}
              className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden"
            >
              {/* Header row */}
              <button
                className="w-full text-left px-5 py-4 flex items-start gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                onClick={() => setExpanded(expanded === item.id ? null : item.id)}
              >
                <span className={`mt-0.5 text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                  item.type === 'bug'
                    ? 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-400'
                    : 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-400'
                }`}>
                  {item.type === 'bug' ? t('typeBug') : t('typeFeature')}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{item.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {item.users?.display_name ?? item.users?.email ?? '—'}
                    {' · '}
                    {new Date(item.created_at).toLocaleDateString()}
                  </p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${statusColor[item.status]}`}>
                  {statusLabel[item.status]}
                </span>
              </button>

              {/* Expanded detail */}
              {expanded === item.id && (
                <div className="px-5 pb-5 border-t border-gray-100 dark:border-gray-800 pt-4 space-y-4">
                  <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{item.description}</p>

                  {item.screenshot_url && signedUrls[item.screenshot_url] && (
                    <div>
                      <a
                        href={signedUrls[item.screenshot_url]}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mb-2"
                      >
                        <ExternalLink size={12} /> {t('viewScreenshot')}
                      </a>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={signedUrls[item.screenshot_url]}
                        alt="screenshot"
                        className="max-h-60 rounded-lg border border-gray-200 dark:border-gray-700"
                      />
                    </div>
                  )}

                  {/* Status update */}
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{t('updateStatus')}：</span>
                    <div className="flex gap-2 flex-wrap">
                      {STATUS_OPTIONS.map(s => (
                        <button
                          key={s}
                          onClick={() => handleStatusChange(item.id, s)}
                          disabled={item.status === s || updatingId === item.id}
                          className={`text-xs px-3 py-1 rounded-full border transition-colors disabled:cursor-not-allowed ${
                            item.status === s
                              ? `${statusColor[s]} border-transparent font-medium`
                              : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                          }`}
                        >
                          {statusLabel[s]}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
