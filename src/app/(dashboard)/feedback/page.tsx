'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { fetchOrgId } from '@/lib/orgUploadPrefix'
import { MessageSquarePlus, Upload, X, CheckCircle } from 'lucide-react'

type MyFeedbackStatus = 'open' | 'in_progress' | 'resolved' | 'done' | 'wont_fix'

interface MyFeedbackItem {
  id: string
  type: 'feature' | 'bug'
  title: string
  status: MyFeedbackStatus
  created_at: string
}

const MY_STATUS_COLOR: Record<MyFeedbackStatus, string> = {
  open: 'bg-yellow-100 dark:bg-yellow-950 text-yellow-700 dark:text-yellow-400',
  in_progress: 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-400',
  resolved: 'bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-400',
  done: 'bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400',
  wont_fix: 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
}

export default function FeedbackPage() {
  const t = useTranslations('feedback')
  const tc = useTranslations('common')
  const router = useRouter()
  const supabase = createBrowserSupabaseClient()

  const [type, setType] = useState<'feature' | 'bug'>('feature')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [screenshot, setScreenshot] = useState<File | null>(null)
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [myItems, setMyItems] = useState<MyFeedbackItem[]>([])
  const [myError, setMyError] = useState<string | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  // 我的回饋（RLS 僅回自己的列；仍以 created_by 過濾避免 super admin 看到全部）
  useEffect(() => {
    let cancelled = false
    async function loadMine() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email) return
      const { data: profile } = await supabase.from('users').select('id').eq('email', user.email).single()
      if (!profile) return
      const { data } = await supabase
        .from('feedback')
        .select('id, type, title, status, created_at')
        .eq('created_by', profile.id)
        .order('created_at', { ascending: false })
      if (!cancelled) setMyItems((data ?? []) as MyFeedbackItem[])
    }
    loadMine()
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 回報者本人確認完成（RLS feedback_confirm_own：僅允許自己的 resolved → done）
  async function confirmDone(id: string) {
    setConfirmingId(id)
    setMyError(null)
    const { error: confirmError } = await supabase
      .from('feedback')
      .update({ status: 'done' })
      .eq('id', id)
      .select('id')
      .single()
    if (confirmError) {
      setMyError(tc('error'))
      setConfirmingId(null)
      return
    }
    setMyItems(prev => prev.map(i => i.id === id ? { ...i, status: 'done' as const } : i))
    setConfirmingId(null)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    setScreenshot(file)
    setScreenshotPreview(prev => {
      if (prev) URL.revokeObjectURL(prev)
      return file ? URL.createObjectURL(file) : null
    })
  }

  function removeScreenshot() {
    setScreenshot(null)
    setScreenshotPreview(prev => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
  }

  // Release the object URL when the component unmounts.
  useEffect(() => {
    return () => {
      if (screenshotPreview) URL.revokeObjectURL(screenshotPreview)
    }
  }, [screenshotPreview])

  async function handleSubmit() {
    if (!title.trim() || !description.trim()) return

    if (type === 'bug' && !screenshot) {
      if (!confirm(t('noScreenshotConfirm'))) return
    }

    setSubmitting(true)
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    // feedback.created_by 的 FK 與 RLS 都以 public.users.id 為準（非 auth id）。
    const { data: profile } = await supabase.from('users').select('id').eq('email', user.email!).single()
    if (!profile) { setError(tc('error')); setSubmitting(false); return }

    // org_id 明確帶入（業務表即將 DROP DEFAULT）；取不到組織即中止，不帶 null 硬送
    const oid = await fetchOrgId()
    if (!oid) { setError(tc('orgResolveFailed')); setSubmitting(false); return }

    // 截圖存於 private bucket，欄位存儲存路徑，讀取時再簽短效 URL。
    let screenshotPath: string | null = null

    if (screenshot) {
      const ext = screenshot.name.split('.').pop() ?? 'png'
      const path = `${user.id}/${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('feedback')
        .upload(path, screenshot, { contentType: screenshot.type })

      if (uploadError) {
        setError(tc('error'))
        setSubmitting(false)
        return
      }

      screenshotPath = path
    }

    const { error: insertError } = await supabase.from('feedback').insert({
      type,
      title: title.trim(),
      description: description.trim(),
      screenshot_url: screenshotPath,
      created_by: profile.id,
      org_id: oid,
    })

    if (insertError) {
      setError(tc('error'))
      setSubmitting(false)
      return
    }

    setSubmitted(true)
    setSubmitting(false)
  }

  const statusLabel: Record<MyFeedbackStatus, string> = {
    open: t('statusOpen'),
    in_progress: t('statusInProgress'),
    resolved: t('statusResolved'),
    done: t('statusDone'),
    wont_fix: t('statusWontFix'),
  }

  if (submitted) {
    return (
      <div className="max-w-lg">
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-10 text-center">
          <CheckCircle size={48} className="text-green-500 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">{t('submitSuccess')}</h2>
          <button
            onClick={() => router.push('/')}
            className="mt-4 text-sm text-blue-600 hover:underline"
          >
            {tc('back')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg">
      <div className="flex items-center gap-2 mb-6">
        <MessageSquarePlus size={22} className="text-blue-500" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('title')}</h1>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-5">

        {/* Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('type')}</label>
          <div className="flex gap-3">
            {(['feature', 'bug'] as const).map(v => (
              <button
                key={v}
                onClick={() => setType(v)}
                className={`flex-1 min-h-[44px] py-2 text-sm rounded-lg border transition-colors ${
                  type === v
                    ? 'bg-blue-600 border-blue-600 text-white font-medium'
                    : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                {v === 'feature' ? t('typeFeature') : t('typeBug')}
              </button>
            ))}
          </div>
        </div>

        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('titleLabel')}</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={t('titlePlaceholder')}
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('description')}</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder={t('descPlaceholder')}
            rows={5}
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
          />
        </div>

        {/* Screenshot */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('screenshot')}</label>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">{t('screenshotHint')}</p>

          {screenshotPreview ? (
            <div className="relative inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={screenshotPreview} alt="screenshot" className="max-h-40 rounded-lg border border-gray-200 dark:border-gray-700" />
              <button
                onClick={removeScreenshot}
                aria-label={t('removeScreenshot')}
                className="absolute -top-3 -right-3 flex items-center justify-center w-11 h-11 bg-white dark:bg-gray-800 rounded-full shadow border border-gray-200 dark:border-gray-600 text-gray-500 hover:text-red-500 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <label className="flex items-center gap-2 w-fit cursor-pointer px-3 py-2 text-sm border border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <Upload size={15} />
              <span>{t('uploadScreenshot')}</span>
              <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            </label>
          )}
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={!title.trim() || !description.trim() || submitting}
          className="w-full py-2.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
        >
          {submitting ? tc('loading') : t('submit')}
        </button>
      </div>

      {/* 我的回饋：狀態追蹤 + 已處理項目由本人按「確認完成」 */}
      <div className="mt-8">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3">{t('myFeedback')}</h2>

        {myError && <p className="mb-3 text-sm text-red-500">{myError}</p>}

        {myItems.length === 0 ? (
          <p className="text-sm text-gray-400">{t('noMyFeedback')}</p>
        ) : (
          <div className="space-y-2">
            {myItems.map(item => (
              <div key={item.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3">
                <div className="flex items-start gap-2">
                  <span className={`mt-0.5 text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                    item.type === 'bug'
                      ? 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-400'
                      : 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-400'
                  }`}>
                    {item.type === 'bug' ? t('typeBug') : t('typeFeature')}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{item.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{new Date(item.created_at).toLocaleDateString()}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${MY_STATUS_COLOR[item.status]}`}>
                    {statusLabel[item.status]}
                  </span>
                </div>
                {item.status === 'resolved' && (
                  <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
                    <p className="text-xs text-orange-700 dark:text-orange-400">{t('confirmDoneHint')}</p>
                    <button
                      onClick={() => confirmDone(item.id)}
                      disabled={confirmingId === item.id}
                      className="min-h-[44px] px-4 text-sm font-medium bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors shrink-0"
                    >
                      {confirmingId === item.id ? tc('loading') : t('confirmDone')}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
