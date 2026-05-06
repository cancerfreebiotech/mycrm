'use client'

import { useEffect, useState } from 'react'

const SUPPORTED = ['zh-TW', 'en', 'ja'] as const
type Locale = (typeof SUPPORTED)[number]
const DEFAULT_LOCALE: Locale = 'zh-TW'
const LOCALE_COOKIE = 'MYCRM_LOCALE'

const STRINGS: Record<Locale, {
  title: string
  description: string
  hint: string
  retry: string
  reload: string
  errorIdLabel: string
}> = {
  'zh-TW': {
    title: '系統發生錯誤',
    description: '頁面載入時發生未預期的錯誤。請嘗試重試，若問題持續請聯絡管理員。',
    hint: '若需要協助，請開啟瀏覽器主控台（F12）並將錯誤訊息提供給管理員。',
    retry: '重試',
    reload: '重新整理頁面',
    errorIdLabel: '錯誤代碼',
  },
  en: {
    title: 'Something went wrong',
    description: 'An unexpected error occurred while loading this page. Please try again, or contact an administrator if the problem persists.',
    hint: 'For support, open the browser console (F12) and share the error message with an administrator.',
    retry: 'Try again',
    reload: 'Reload page',
    errorIdLabel: 'Error ID',
  },
  ja: {
    title: 'エラーが発生しました',
    description: 'ページの読み込み中に予期しないエラーが発生しました。再試行するか、問題が続く場合は管理者にお問い合わせください。',
    hint: 'サポートが必要な場合は、ブラウザのコンソール（F12）を開き、エラーメッセージを管理者にお知らせください。',
    retry: '再試行',
    reload: 'ページを再読み込み',
    errorIdLabel: 'エラーID',
  },
}

function readLocale(): Locale {
  if (typeof document === 'undefined') return DEFAULT_LOCALE
  const match = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]*)`))
  const raw = match ? decodeURIComponent(match[1]) : ''
  return (SUPPORTED as readonly string[]).includes(raw) ? (raw as Locale) : DEFAULT_LOCALE
}

function readIsDark(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem('theme') === 'dark'
  } catch {
    return false
  }
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE)
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    setLocale(readLocale())
    setIsDark(readIsDark())
    console.error('[global-error]', error)
  }, [error])

  const t = STRINGS[locale]

  return (
    <html lang={locale} className={isDark ? 'dark' : ''}>
      <body className="antialiased">
        <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-950 px-4 py-12">
          <div className="w-full max-w-md">
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 sm:p-8 shadow-sm">
              <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-gray-100">
                {t.title}
              </h1>
              <p className="mt-3 text-sm sm:text-base text-gray-700 dark:text-gray-300 leading-relaxed">
                {t.description}
              </p>
              <p className="mt-3 text-xs sm:text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                {t.hint}
              </p>

              {error.digest ? (
                <div className="mt-4 rounded border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 px-3 py-2">
                  <div className="text-xs text-gray-500 dark:text-gray-400">{t.errorIdLabel}</div>
                  <code className="text-xs font-mono text-gray-800 dark:text-gray-200 break-all">
                    {error.digest}
                  </code>
                </div>
              ) : null}

              <div className="mt-6 flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={() => reset()}
                  className="min-h-[44px] inline-flex items-center justify-center rounded-md bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-base font-medium px-4 py-2 transition-colors"
                >
                  {t.retry}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (typeof window !== 'undefined') window.location.reload()
                  }}
                  className="min-h-[44px] inline-flex items-center justify-center rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-900 dark:text-gray-100 text-base font-medium px-4 py-2 transition-colors"
                >
                  {t.reload}
                </button>
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
  )
}
