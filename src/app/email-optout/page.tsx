'use client'

import { useSearchParams } from 'next/navigation'
import { useState, useEffect, Suspense } from 'react'
import { Mail, CheckCircle, AlertCircle } from 'lucide-react'

const STRINGS = {
  'zh-TW': {
    loading: '載入中...',
    invalidLink: '無效的連結',
    doneTitle: '已更新您的郵件偏好',
    doneSub: '感謝您的回覆，我們將不再傳送此類郵件給您。',
    title: '管理收信偏好',
    body: '若您希望停止接收來自 CancerFree Biotech 的相關郵件，可以在下方確認，我們會立即為您更新偏好設定，後續將不再傳送此類郵件。',
    button: '選擇不再接收',
    buttonLoading: '處理中...',
    footer: '如有任何問題，歡迎直接回覆此郵件或聯繫我們。',
    genericError: '發生錯誤，請稍後再試',
  },
  en: {
    loading: 'Loading...',
    invalidLink: 'Invalid link',
    doneTitle: 'Your email preferences have been updated',
    doneSub: 'Thank you for letting us know. We will no longer send you these emails.',
    title: 'Manage Email Preferences',
    body: 'If you would like to stop receiving emails from CancerFree Biotech, please confirm below. We will update your preferences immediately.',
    button: 'Unsubscribe',
    buttonLoading: 'Processing...',
    footer: 'If you have any questions, feel free to reply to this email or contact us.',
    genericError: 'An error occurred. Please try again later.',
  },
  ja: {
    loading: '読み込み中...',
    invalidLink: '無効なリンクです',
    doneTitle: 'メールの設定を更新しました',
    doneSub: 'ご連絡いただきありがとうございます。今後、このようなメールはお送りしません。',
    title: 'メール受信設定の管理',
    body: 'CancerFree Biotechからのメールの受信を停止ご希望の場合は、下記でご確認ください。すぐに設定を更新いたします。',
    button: '受信を停止する',
    buttonLoading: '処理中...',
    footer: 'ご不明な点がございましたら、このメールに返信するか、お問い合わせください。',
    genericError: 'エラーが発生しました。後ほど再度お試しください。',
  },
} as const

type Lang = keyof typeof STRINGS

function detectLang(): Lang {
  if (typeof navigator === 'undefined') return 'zh-TW'
  const lang = navigator.language ?? ''
  if (lang.startsWith('ja')) return 'ja'
  if (lang.startsWith('zh')) return 'zh-TW'
  return 'en'
}

function OptOutContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [email, setEmail] = useState('')
  const [lang, setLang] = useState<Lang>('zh-TW')

  useEffect(() => {
    setLang(detectLang())
  }, [])

  useEffect(() => {
    if (!token) return
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      setEmail(payload.email ?? '')
    } catch {
      // invalid token, will fail on server
    }
  }, [token])

  const s = STRINGS[lang]

  async function handleOptOut() {
    setStatus('loading')
    try {
      const res = await fetch('/api/email/optout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? s.genericError)
      setStatus('done')
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : s.genericError)
      setStatus('error')
    }
  }

  // Lang switcher
  const langSwitcher = (
    <div className="flex justify-end gap-2 mb-6">
      {(Object.keys(STRINGS) as Lang[]).map(l => (
        <button
          key={l}
          onClick={() => setLang(l)}
          className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
            l === lang
              ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-medium'
              : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
          }`}
        >
          {l === 'zh-TW' ? '繁中' : l === 'en' ? 'EN' : '日本語'}
        </button>
      ))}
    </div>
  )

  if (!token) {
    return (
      <>
        {langSwitcher}
        <div className="text-center">
          <AlertCircle size={48} className="mx-auto text-red-400 mb-4" />
          <p className="text-gray-600 dark:text-gray-400">{s.invalidLink}</p>
        </div>
      </>
    )
  }

  if (status === 'done') {
    return (
      <>
        {langSwitcher}
        <div className="text-center">
          <CheckCircle size={48} className="mx-auto text-green-500 mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">{s.doneTitle}</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            {email && <><b>{email}</b><br /></>}
            {s.doneSub}
          </p>
        </div>
      </>
    )
  }

  return (
    <>
      {langSwitcher}
      <div className="flex items-center gap-3 mb-6">
        <Mail size={32} className="text-blue-400 shrink-0" />
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{s.title}</h1>
          {email && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{email}</p>}
        </div>
      </div>

      <p className="text-gray-600 dark:text-gray-300 text-sm mb-8 leading-relaxed">
        {s.body}
      </p>

      {status === 'error' && (
        <p className="text-sm text-red-500 mb-4">{errorMsg}</p>
      )}

      <button
        onClick={handleOptOut}
        disabled={status === 'loading'}
        className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium text-sm transition-colors"
      >
        {status === 'loading' ? s.buttonLoading : s.button}
      </button>

      <p className="mt-4 text-xs text-gray-400 dark:text-gray-500 text-center">
        {s.footer}
      </p>
    </>
  )
}

export default function EmailOptOutPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-8">
        <Suspense fallback={<div className="text-center text-gray-400">載入中...</div>}>
          <OptOutContent />
        </Suspense>
      </div>
    </div>
  )
}
