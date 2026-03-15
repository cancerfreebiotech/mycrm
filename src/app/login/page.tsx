'use client'

import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { Suspense } from 'react'

function LoginContent() {
  const t = useTranslations('login')
  const searchParams = useSearchParams()
  const error = searchParams.get('error')

  async function handleMicrosoftLogin() {
    const supabase = createBrowserSupabaseClient()
    await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        scopes: 'email profile Mail.Send',
        redirectTo: `${window.location.origin}/api/auth/callback`,
      },
    })
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 w-full max-w-sm text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">myCRM</h1>
        <p className="text-sm text-gray-500 mb-8">{t('subtitle')}</p>

        {error && (
          <div className="mb-6 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {t(`errors.${error as 'unauthorized_domain' | 'auth_failed' | 'no_code'}`, { fallback: t('errors.unknown') })}
          </div>
        )}

        <button
          onClick={handleMicrosoftLogin}
          className="w-full flex items-center justify-center gap-3 px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
            <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
            <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
            <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
          </svg>
          {t('button')}
        </button>
        <p className="mt-4 text-xs text-gray-400">{t('hint')}</p>
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
