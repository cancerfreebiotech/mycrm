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
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  useEffect(() => {
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    const { data } = await supabase
      .from('feedback')
      .select('id, type, title, description, screenshot_url, created_at, status, users(display_name, email)')
      .order('created_at', { ascending: false })
    setItems((data ?? []) as unknown as FeedbackItem[])
    setLoading(false)
  }

  async function handleStatusChange(id: string, status: FeedbackStatus) {
    setUpdatingId(id)
    await supabase.from('feedback').update({ status }).eq('id', id)
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

                  {item.screenshot_url && (
                    <div>
                      <a
                        href={item.screenshot_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mb-2"
                      >
                        <ExternalLink size={12} /> 查看截圖
                      </a>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.screenshot_url}
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
