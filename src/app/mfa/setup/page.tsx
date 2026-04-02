'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { ShieldCheck } from 'lucide-react'
import QRCode from 'qrcode'

export default function MfaSetupPage() {
  const t = useTranslations('mfa')
  const router = useRouter()
  const supabase = createBrowserSupabaseClient()

  const [qrDataUrl, setQrDataUrl] = useState<string>('')
  const [secret, setSecret] = useState<string>('')
  const [factorId, setFactorId] = useState<string>('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(true)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function enroll() {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
      if (error || !data) {
        setError(t('error'))
        setLoading(false)
        return
      }
      setFactorId(data.id)
      setSecret(data.totp.secret)
      const dataUrl = await QRCode.toDataURL(data.totp.uri, { width: 200, margin: 2 })
      setQrDataUrl(dataUrl)
      setLoading(false)
    }
    enroll()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleVerify() {
    if (code.length !== 6) return
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
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">{t('setup')}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{t('setupDesc')}</p>

        {loading ? (
          <p className="text-sm text-gray-400">{t('loading')}</p>
        ) : (
          <>
            {qrDataUrl && (
              <div className="flex justify-center mb-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrDataUrl} alt="MFA QR Code" width={200} height={200} className="rounded-lg border border-gray-200 dark:border-gray-700" />
              </div>
            )}

            {secret && (
              <details className="mb-4 text-left">
                <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600 dark:hover:text-gray-300">
                  {t('orEnterManually')}
                </summary>
                <p className="mt-2 text-xs font-mono bg-gray-100 dark:bg-gray-800 rounded px-3 py-2 break-all select-all text-gray-700 dark:text-gray-300">
                  {secret}
                </p>
              </details>
            )}

            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 text-left">{t('enterCode')}</p>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder={t('codePlaceholder')}
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
