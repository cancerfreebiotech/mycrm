'use client'

import { useRef, useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useTheme } from 'next-themes'
import { Sun, Moon, Globe, BookOpen } from 'lucide-react'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { SUPPORTED_LOCALES, type Locale } from '@/i18n/config'

const LOCALE_LABELS: Record<Locale, string> = {
  'zh-TW': '繁中',
  'en': 'EN',
  'ja': '日本語',
}

function LoginContent() {
  const t = useTranslations('login')
  const searchParams = useSearchParams()
  const error = searchParams.get('error')

  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [localeMenuOpen, setLocaleMenuOpen] = useState(false)
  const [currentLocale, setCurrentLocale] = useState<Locale>('zh-TW')
  const localeRef = useRef<HTMLDivElement>(null)
  const docsUrl = process.env.NEXT_PUBLIC_DOCS_URL ?? '/docs'

  useEffect(() => {
    setMounted(true)
    // Read current locale from cookie
    const cookie = document.cookie.split('; ').find(r => r.startsWith('MYCRM_LOCALE='))
    const cookieLocale = cookie?.split('=')[1]
    if (cookieLocale && (SUPPORTED_LOCALES as readonly string[]).includes(cookieLocale)) {
      setCurrentLocale(cookieLocale as Locale)
    }
  }, [])

  // Close locale menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (localeRef.current && !localeRef.current.contains(e.target as Node)) {
        setLocaleMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function handleLocaleChange(locale: Locale) {
    setCurrentLocale(locale)
    setLocaleMenuOpen(false)
    await fetch('/api/set-locale', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale }),
    })
    window.location.reload()
  }

  async function handleMicrosoftLogin() {
    const supabase = createBrowserSupabaseClient()
    await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        scopes: 'email profile Mail.Send Calendars.ReadWrite offline_access',
        redirectTo: `${window.location.origin}/api/auth/callback`,
      },
    })
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-end gap-3 px-6 py-4">
        {/* Docs link */}
        <a
          href={docsUrl}
          target={docsUrl.startsWith('http') ? '_blank' : undefined}
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
        >
          <BookOpen size={15} />
          {t('docs')}
        </a>

        {/* Language switcher */}
        <div className="relative" ref={localeRef}>
          <button
            onClick={() => setLocaleMenuOpen(o => !o)}
            className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
          >
            <Globe size={15} />
            <span>{LOCALE_LABELS[currentLocale]}</span>
          </button>
          {localeMenuOpen && (
            <div className="absolute right-0 top-7 z-50 w-28 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden">
              {SUPPORTED_LOCALES.map((loc) => (
                <button
                  key={loc}
                  onClick={() => handleLocaleChange(loc)}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                    loc === currentLocale
                      ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-medium'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  {LOCALE_LABELS[loc]}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Theme toggle */}
        {mounted && (
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        )}
      </div>

      {/* Login card */}
      <div className="flex-1 flex items-center justify-center">
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-10 w-full max-w-sm text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">myCRM</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">{t('subtitle')}</p>

          {error && (
            <div className="mb-6 px-4 py-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
              {t(`errors.${error as 'unauthorized_domain' | 'auth_failed' | 'no_code'}`, { fallback: t('errors.unknown') })}
            </div>
          )}

          <button
            onClick={handleMicrosoftLogin}
            className="w-full flex items-center justify-center gap-3 px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
              <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
              <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
              <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
            </svg>
            {t('button')}
          </button>
          <p className="mt-4 text-xs text-gray-400 dark:text-gray-500">{t('hint')}</p>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  )
}
