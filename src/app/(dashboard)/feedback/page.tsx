'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { MessageSquarePlus, Upload, X, CheckCircle } from 'lucide-react'

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

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    setScreenshot(file)
    if (file) {
      const url = URL.createObjectURL(file)
      setScreenshotPreview(url)
    } else {
      setScreenshotPreview(null)
    }
  }

  function removeScreenshot() {
    setScreenshot(null)
    setScreenshotPreview(null)
  }

  async function handleSubmit() {
    if (!title.trim() || !description.trim()) return

    if (type === 'bug' && !screenshot) {
      if (!confirm(t('noScreenshotConfirm'))) return
    }

    setSubmitting(true)
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSubmitting(false); return }

    let screenshotUrl: string | null = null

    if (screenshot) {
      const ext = screenshot.name.split('.').pop() ?? 'png'
      const path = `feedback/${user.id}/${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('feedback')
        .upload(path, screenshot, { contentType: screenshot.type })

      if (uploadError) {
        setError(tc('error'))
        setSubmitting(false)
        return
      }

      const { data: urlData } = supabase.storage.from('feedback').getPublicUrl(path)
      screenshotUrl = urlData.publicUrl
    }

    const { error: insertError } = await supabase.from('feedback').insert({
      type,
      title: title.trim(),
      description: description.trim(),
      screenshot_url: screenshotUrl,
      created_by: user.id,
    })

    if (insertError) {
      setError(tc('error'))
      setSubmitting(false)
      return
    }

    setSubmitted(true)
    setSubmitting(false)
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
                className={`flex-1 py-2 text-sm rounded-lg border transition-colors ${
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
                className="absolute -top-2 -right-2 bg-white dark:bg-gray-800 rounded-full p-0.5 shadow border border-gray-200 dark:border-gray-600 text-gray-500 hover:text-red-500 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <label className="flex items-center gap-2 w-fit cursor-pointer px-3 py-2 text-sm border border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <Upload size={15} />
              <span>上傳截圖</span>
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
    </div>
  )
}
