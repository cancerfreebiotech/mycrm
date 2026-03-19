'use client'

import { useSearchParams } from 'next/navigation'
import { useState, useEffect, Suspense } from 'react'
import { MailX, CheckCircle, AlertCircle } from 'lucide-react'

const REASONS = [
  { value: 'too_many', label: '收到太多信' },
  { value: 'not_relevant', label: '內容與我無關' },
  { value: 'forgot', label: '不記得訂閱' },
  { value: 'other', label: '其他' },
]

function UnsubscribeContent() {
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
      if (!res.ok) throw new Error(data.error ?? '退訂失敗')
      setStatus('done')
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '發生錯誤，請稍後再試')
      setStatus('error')
    }
  }

  if (!token) {
    return (
      <div className="text-center">
        <AlertCircle size={48} className="mx-auto text-red-400 mb-4" />
        <p className="text-gray-600 dark:text-gray-400">無效的退訂連結</p>
      </div>
    )
  }

  if (status === 'done') {
    return (
      <div className="text-center">
        <CheckCircle size={48} className="mx-auto text-green-500 mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">已成功取消訂閱</h2>
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          {email && <><b>{email}</b> 將不再收到來自我們的電子報。</>}
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <MailX size={32} className="text-red-400 shrink-0" />
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">取消訂閱電子報</h1>
          {email && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{email}</p>}
        </div>
      </div>

      <p className="text-gray-600 dark:text-gray-300 text-sm mb-6">
        您即將取消訂閱來自 <b>CancerFree Biotech</b> 的電子報，之後將不再收到相關郵件。
      </p>

      <div className="mb-6">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">退訂原因（選填）</p>
        <div className="space-y-2">
          {REASONS.map(r => (
            <label key={r.value} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="reason"
                value={r.value}
                checked={reason === r.value}
                onChange={() => setReason(r.value)}
                className="text-blue-600"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">{r.label}</span>
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
        {status === 'loading' ? '處理中...' : '確認取消訂閱'}
      </button>
    </>
  )
}

export default function UnsubscribePage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-8">
        <Suspense fallback={<div className="text-center text-gray-400">載入中...</div>}>
          <UnsubscribeContent />
        </Suspense>
      </div>
    </div>
  )
}
