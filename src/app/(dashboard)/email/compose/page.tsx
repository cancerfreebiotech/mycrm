'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import TipTapEditor from '@/components/TipTapEditor'
import { ArrowLeft, Send, Loader2, Users, AlertCircle, X, Sparkles } from 'lucide-react'

interface Recipient {
  id: string
  name: string | null
  email: string
  company: string | null
}

export default function EmailComposePage() {
  const router = useRouter()
  const supabase = createBrowserSupabaseClient()

  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; method: string; sent: number; errors: string[] } | null>(null)

  const [subject, setSubject] = useState('')
  const [bodyHtml, setBodyHtml] = useState('')
  const [cc, setCc] = useState('')
  const [userId, setUserId] = useState('')
  const [showRecipients, setShowRecipients] = useState(false)

  // AI
  const [aiLoading, setAiLoading] = useState(false)
  const [method, setMethod] = useState<'outlook' | 'sendgrid'>('outlook')

  useEffect(() => {
    const raw = sessionStorage.getItem('emailRecipients')
    if (!raw) {
      router.push('/contacts')
      return
    }
    const ids: string[] = JSON.parse(raw)
    if (ids.length === 0) {
      router.push('/contacts')
      return
    }
    loadRecipients(ids)
  }, [])

  async function loadRecipients(ids: string[]) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: profile } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', user.email!)
      .single()
    if (profile) {
      setUserId(profile.id)
      setCc(user.email ?? '')
    }

    const all: Recipient[] = []
    for (let i = 0; i < ids.length; i += 200) {
      const batch = ids.slice(i, i + 200)
      const { data } = await supabase
        .from('contacts')
        .select('id, name, email, company')
        .in('id', batch)
        .is('deleted_at', null)
        .not('email', 'is', null)
      if (data) all.push(...(data as Recipient[]))
    }
    setRecipients(all)
    setMethod(all.length >= 450 ? 'sendgrid' : 'outlook')
    setLoading(false)
  }

  function removeRecipient(id: string) {
    setRecipients(prev => prev.filter(r => r.id !== id))
  }

  async function handleAiGenerate() {
    if (!bodyHtml.trim() && !subject.trim()) return
    setAiLoading(true)
    try {
      // Strip HTML tags to plain text for AI input
      const plainText = bodyHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
      const description = subject.trim()
        ? `主旨：${subject}\n\n請根據以下草稿潤飾成正式商業郵件：\n${plainText}`
        : `請根據以下草稿潤飾成正式商業郵件，並生成主旨：\n${plainText}`
      const res = await fetch('/api/ai-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description,
          generateSubject: !subject.trim(),
        }),
      })
      const data = await res.json()
      if (data.error) {
        alert(data.error)
        return
      }
      const html = data.text
        .split('\n')
        .map((line: string) => line.trim() ? `<p>${line}</p>` : '<p></p>')
        .join('')
      setBodyHtml(html)
      if (data.subject && !subject.trim()) setSubject(data.subject)
    } catch (e) {
      alert(e instanceof Error ? e.message : '生成失敗')
    } finally {
      setAiLoading(false)
    }
  }

  async function handleSend() {
    if (!subject.trim() || !bodyHtml.trim() || recipients.length === 0) return
    setSending(true)
    try {
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactIds: recipients.map(r => r.id),
          subject,
          bodyHtml,
          cc: cc.trim() || undefined,
          userId,
          method,
        }),
      })
      const data = await res.json()
      setResult(data)
      setSent(true)
      sessionStorage.removeItem('emailRecipients')
    } catch (e) {
      setResult({ ok: false, method: '', sent: 0, errors: [e instanceof Error ? e.message : String(e)] })
      setSent(true)
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <Loader2 className="animate-spin mr-2" size={20} /> 載入收件人...
      </div>
    )
  }

  if (sent && result) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center">
        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium mb-4 ${result.ok ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'}`}>
          {result.ok ? `已成功寄出 ${result.sent} 封（${result.method}）` : '寄送失敗'}
        </div>
        {result.errors.length > 0 && (
          <div className="text-sm text-red-500 mb-4 space-y-1">
            {result.errors.map((e, i) => <p key={i}>{e}</p>)}
          </div>
        )}
        <button
          onClick={() => router.push('/contacts')}
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          返回聯絡人
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">撰寫群發郵件</h1>
      </div>

      {/* Method selector */}
      <div className="flex items-center gap-2 mb-4">
        <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <button
            onClick={() => setMethod('outlook')}
            className={`text-xs px-3 py-1.5 font-medium transition-colors ${method === 'outlook' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
          >
            Outlook
          </button>
          <button
            onClick={() => setMethod('sendgrid')}
            className={`text-xs px-3 py-1.5 font-medium transition-colors ${method === 'sendgrid' ? 'bg-purple-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
          >
            SendGrid
          </button>
        </div>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {recipients.length} 位收件人
          {method === 'outlook' ? '（BCC 群發）' : '（每人獨立信件）'}
        </span>
        {method === 'outlook' && recipients.length >= 450 && (
          <span className="text-xs text-amber-600 dark:text-amber-400">Outlook 上限 500 人</span>
        )}
      </div>

      {/* BCC Recipients - expandable & editable */}
      <div className="mb-4">
        <button
          onClick={() => setShowRecipients(v => !v)}
          className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
        >
          <Users size={14} />
          BCC 收件人：{recipients.length} 人
          <span className="text-xs text-blue-500">{showRecipients ? '收合' : '展開編輯'}</span>
        </button>
        {showRecipients && (
          <div className="mt-2 max-h-64 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-gray-800/50">
            <div className="flex flex-wrap gap-1.5">
              {recipients.map(r => (
                <span key={r.id} className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-full group">
                  <span>{r.name || r.email}</span>
                  {r.company && <span className="text-gray-400">({r.company})</span>}
                  <button
                    onClick={() => removeRecipient(r.id)}
                    className="ml-0.5 text-gray-300 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400"
                    title="移除"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
            {recipients.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-2">已移除所有收件人</p>
            )}
          </div>
        )}
      </div>

      {/* CC */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">CC</label>
        <input
          type="text"
          value={cc}
          onChange={e => setCc(e.target.value)}
          placeholder="例：po@cancerfree.io, bob@gmail.com（逗號分隔）"
          className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <p className="text-xs text-gray-400 mt-1">預設為你自己的 email，可新增多個（逗號分隔）。CC 不會建立互動紀錄。</p>
      </div>

      {/* Subject */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">主旨</label>
        <input
          type="text"
          value={subject}
          onChange={e => setSubject(e.target.value)}
          placeholder="郵件主旨"
          className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Body - TipTap + AI */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">內文</label>
          <button
            onClick={handleAiGenerate}
            disabled={aiLoading || (!bodyHtml.trim() && !subject.trim())}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded-md text-purple-600 hover:bg-purple-50 dark:text-purple-400 dark:hover:bg-purple-900/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="AI 會根據目前內文潤飾成正式郵件"
          >
            {aiLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            {aiLoading ? 'AI 潤稿中...' : 'AI 潤稿'}
          </button>
        </div>

        <TipTapEditor
          content={bodyHtml}
          onChange={(html) => setBodyHtml(html)}
          placeholder="先寫草稿，再按「AI 潤稿」自動修飾成正式郵件..."
        />
      </div>

      {/* Warning for SendGrid */}
      {method === 'sendgrid' && (
        <div className="flex items-start gap-2 mb-4 px-3 py-2.5 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-sm text-amber-700 dark:text-amber-300">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>SendGrid 路徑每位收件人各收到一封獨立信件（非 BCC），寄件人為系統設定的 SendGrid 帳號。</span>
        </div>
      )}

      {/* Send button */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSend}
          disabled={sending || !subject.trim() || !bodyHtml.trim() || recipients.length === 0}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        >
          {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          {sending ? '寄送中...' : `寄出（${recipients.length} 人）`}
        </button>
        <button
          onClick={() => router.back()}
          className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
        >
          取消
        </button>
      </div>
    </div>
  )
}
