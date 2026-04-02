'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { ShieldCheck } from 'lucide-react'

export default function MfaVerifyPage() {
  const t = useTranslations('mfa')
  const router = useRouter()
  const supabase = createBrowserSupabaseClient()

  const [factorId, setFactorId] = useState<string>('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(true)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadFactor() {
      const { data, error } = await supabase.auth.mfa.listFactors()
      if (error || !data?.totp?.length) {
        // No TOTP factor found — send to setup
        router.replace('/mfa/setup')
        return
      }
      setFactorId(data.totp[0].id)
      setLoading(false)
    }
    loadFactor()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleVerify() {
    if (code.length !== 6 || !factorId) return
    setVerifying(true)
    setError(null)

    const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({ factorId })
    if (challengeError || !challengeData) {
      setError(t('error'))
      setVerifying(false)
      return
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challengeData.id,
      code,
    })

    if (verifyError) {
      setError(t('invalidCode'))
      setVerifying(false)
      return
    }

    router.replace('/')
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 w-full max-w-sm text-center">
        <div className="flex justify-center mb-4">
          <ShieldCheck size={40} className="text-blue-500" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">{t('verifyTitle')}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{t('verifyDesc')}</p>

        {loading ? (
          <p className="text-sm text-gray-400">{t('loading')}</p>
        ) : (
          <>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
              onKeyDown={e => e.key === 'Enter' && handleVerify()}
              placeholder={t('codePlaceholder')}
              autoFocus
              className="w-full px-4 py-2.5 text-center text-2xl tracking-[0.5em] font-mono border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-300 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
            />

            {error && (
              <p className="text-sm text-red-500 mb-3">{error}</p>
            )}

            <button
              onClick={handleVerify}
              disabled={code.length !== 6 || verifying}
              className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm transition-colors"
            >
              {verifying ? t('loading') : t('verify')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
