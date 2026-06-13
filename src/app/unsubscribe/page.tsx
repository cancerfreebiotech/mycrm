'use client'

import { useSearchParams } from 'next/navigation'
import { useState, useEffect, Suspense } from 'react'
import { useTranslations } from 'next-intl'
import { MailX, CheckCircle, AlertCircle } from 'lucide-react'

const REASON_VALUES = ['too_many', 'not_relevant', 'forgot', 'other'] as const

function UnsubscribeContent() {
  const t = useTranslations('unsubscribe')
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [reason, setReason] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  // Decode email from JWT token (simple base64 payload, no verification on client)
  const [email, setEmail] = useState('')
  useEffect(() => {
    if (!token) return
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      setEmail(payload.email ?? '')
    } catch {
      // invalid token, will fail on server
    }
  }, [token])

  async function handleUnsubscribe() {
    setStatus('loading')
    try {
      const res = await fetch('/api/newsletter/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, reason }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? t('failed'))
      setStatus('done')
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : t('genericError'))
      setStatus('error')
    }
  }

  if (!token) {
    return (
      <div className="text-center">
        <AlertCircle size={48} className="mx-auto text-red-400 mb-4" />
        <p className="text-gray-600 dark:text-gray-400">{t('invalidLink')}</p>
      </div>
    )
  }

  if (status === 'done') {
    return (
      <div className="text-center">
        <CheckCircle size={48} className="mx-auto text-green-500 mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">{t('successTitle')}</h2>
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          {email && t.rich('successDesc', { email, b: (chunks) => <b>{chunks}</b> })}
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <MailX size={32} className="text-red-400 shrink-0" />
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{t('title')}</h1>
          {email && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{email}</p>}
        </div>
      </div>

      <p className="text-gray-600 dark:text-gray-300 text-sm mb-6">
        {t.rich('intro', { b: (chunks) => <b>{chunks}</b> })}
      </p>

      <div className="mb-6">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">{t('reasonLabel')}</p>
        <div className="space-y-2">
          {REASON_VALUES.map(value => (
            <label key={value} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="reason"
                value={value}
                checked={reason === value}
                onChange={() => setReason(value)}
                className="text-blue-600"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">{t(`reasons.${value}`)}</span>
            </label>
          ))}
        </div>
      </div>

      {status === 'error' && (
        <p className="text-sm text-red-500 mb-4">{errorMsg}</p>
      )}

      <button
        onClick={handleUnsubscribe}
        disabled={status === 'loading'}
        className="w-full py-2.5 rounded-lg bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white font-medium text-sm transition-colors"
      >
        {status === 'loading' ? t('processing') : t('confirm')}
      </button>
    </>
  )
}

export default function UnsubscribePage() {
  const tCommon = useTranslations('common')
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-8">
        <Suspense fallback={<div className="text-center text-gray-400">{tCommon('loading')}</div>}>
          <UnsubscribeContent />
        </Suspense>
      </div>
    </div>
  )
}
