'use client'

import { useSearchParams } from 'next/navigation'
import { useState, useEffect, Suspense } from 'react'
import { Mail, CheckCircle, AlertCircle } from 'lucide-react'

function OptOutContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
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

  async function handleOptOut() {
    setStatus('loading')
    try {
      const res = await fetch('/api/email/optout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '操作失敗')
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
        <p className="text-gray-600 dark:text-gray-400">無效的連結</p>
      </div>
    )
  }

  if (status === 'done') {
    return (
      <div className="text-center">
        <CheckCircle size={48} className="mx-auto text-green-500 mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">已更新您的郵件偏好</h2>
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          {email && <><b>{email}</b><br /></>}
          感謝您的回覆，我們將不再傳送此類郵件給您。
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <Mail size={32} className="text-blue-400 shrink-0" />
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">管理收信偏好</h1>
          {email && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{email}</p>}
        </div>
      </div>

      <p className="text-gray-600 dark:text-gray-300 text-sm mb-8 leading-relaxed">
        若您希望停止接收來自 <b>CancerFree Biotech</b> 的相關郵件，
        可以在下方確認，我們會立即為您更新偏好設定，後續將不再傳送此類郵件。
      </p>

      {status === 'error' && (
        <p className="text-sm text-red-500 mb-4">{errorMsg}</p>
      )}

      <button
        onClick={handleOptOut}
        disabled={status === 'loading'}
        className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium text-sm transition-colors"
      >
        {status === 'loading' ? '處理中...' : '選擇不再接收'}
      </button>

      <p className="mt-4 text-xs text-gray-400 dark:text-gray-500 text-center">
        如有任何問題，歡迎直接回覆此郵件或聯繫我們。
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
