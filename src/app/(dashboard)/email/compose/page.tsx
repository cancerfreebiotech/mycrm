'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import TipTapEditor from '@/components/TipTapEditor'
import { ArrowLeft, Send, Loader2, Users, AlertCircle, X, Sparkles, FileText, Eye, ChevronDown, Paperclip } from 'lucide-react'

interface Recipient {
  id: string
  name: string | null
  email: string
  company: string | null
  job_title: string | null
}

interface Template {
  id: string
  title: string
  subject: string | null
  body_content: string | null
}

const VARIABLES = [
  { label: '姓名', value: '{{name}}' },
  { label: '公司', value: '{{company}}' },
  { label: '職稱', value: '{{job_title}}' },
]

function substituteVariables(html: string, contact: Recipient): string {
  return html
    .replace(/\{\{name\}\}/g, contact.name ?? '')
    .replace(/\{\{company\}\}/g, contact.company ?? '')
    .replace(/\{\{job_title\}\}/g, contact.job_title ?? '')
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
  const [editorKey, setEditorKey] = useState(0)
  const [method, setMethod] = useState<'outlook' | 'sendgrid'>('outlook')

  // Templates
  const [templates, setTemplates] = useState<Template[]>([])
  const [showTemplates, setShowTemplates] = useState(false)

  // Attachments
  const [attachments, setAttachments] = useState<File[]>([])
  const [attachmentError, setAttachmentError] = useState('')

  // SendGrid sub-mode
  const [sgMode, setSgMode] = useState<'individual' | 'bcc'>('individual')

  // Preview
  const [previewContact, setPreviewContact] = useState<Recipient | null>(null)
  const [showPreview, setShowPreview] = useState(false)

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
    loadTemplates()
  }, [])

  async function loadTemplates() {
    const { data } = await supabase
      .from('email_templates')
      .select('id, title, subject, body_content')
      .order('created_at', { ascending: false })
    setTemplates(data ?? [])
  }

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
        .select('id, name, email, company, job_title')
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

  const MAX_FILES = 5
  const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB per file

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const incoming = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!incoming.length) return

    const combined = [...attachments, ...incoming]
    if (combined.length > MAX_FILES) {
      setAttachmentError(`最多只能附加 ${MAX_FILES} 個檔案`)
      return
    }
    const oversized = incoming.find(f => f.size > MAX_FILE_SIZE)
    if (oversized) {
      setAttachmentError(`「${oversized.name}」超過 5 MB 限制`)
      return
    }
    setAttachmentError('')
    setAttachments(combined)
  }

  function removeAttachment(index: number) {
    setAttachments(prev => prev.filter((_, i) => i !== index))
    setAttachmentError('')
  }

  function applyTemplate(t: Template) {
    if (t.subject) setSubject(t.subject)
    if (t.body_content) {
      setBodyHtml(t.body_content)
      setEditorKey(k => k + 1)
    }
    setShowTemplates(false)
  }

  async function handleAiGenerate() {
    if (!bodyHtml.trim() && !subject.trim()) return
    setAiLoading(true)
    try {
      const plainText = bodyHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
      const description = subject.trim()
        ? `Subject: ${subject}\n\nPolish the following draft into a professional business email. IMPORTANT: reply in the SAME language as the draft below.\n\nDraft:\n${plainText}`
        : `Polish the following draft into a professional business email and generate a subject line. IMPORTANT: reply in the SAME language as the draft below.\n\nDraft:\n${plainText}`
      const res = await fetch('/api/ai-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description,
          generateSubject: !subject.trim(),
          returnHtml: true,
        }),
      })
      const data = await res.json()
      if (data.error) {
        alert(data.error)
        return
      }
      setBodyHtml(data.text)
      setEditorKey(k => k + 1)
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
      const meta = {
        contactIds: recipients.map(r => r.id),
        subject,
        bodyHtml,
        cc: cc.trim() || undefined,
        userId,
        method,
        sgMode,
      }

      let res: Response
      if (attachments.length > 0) {
        const fd = new FormData()
        fd.append('data', JSON.stringify(meta))
        attachments.forEach(f => fd.append('attachments', f))
        res = await fetch('/api/email/send', { method: 'POST', body: fd })
      } else {
        res = await fetch('/api/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(meta),
        })
      }

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

  const hasVariables = /\{\{(name|company|job_title)\}\}/.test(bodyHtml) || /\{\{(name|company|job_title)\}\}/.test(subject)

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
      <div className="flex flex-col gap-2 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
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
            {method === 'outlook'
              ? '（BCC 群發）'
              : sgMode === 'bcc'
              ? '（SendGrid BCC 群發）'
              : '（每人獨立信件）'}
          </span>
          {method === 'outlook' && recipients.length >= 450 && (
            <span className="text-xs text-amber-600 dark:text-amber-400">Outlook 上限 500 人</span>
          )}
        </div>

        {/* SendGrid sub-mode */}
        {method === 'sendgrid' && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 dark:text-gray-500">寄送方式：</span>
            <div className="inline-flex rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden">
              <button
                onClick={() => setSgMode('individual')}
                className={`text-xs px-3 py-1 transition-colors ${sgMode === 'individual' ? 'bg-purple-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
              >
                個人化（一人一封）
              </button>
              <button
                onClick={() => setSgMode('bcc')}
                className={`text-xs px-3 py-1 transition-colors ${sgMode === 'bcc' ? 'bg-purple-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
              >
                BCC 群發
              </button>
            </div>
            {sgMode === 'bcc' && (
              <span className="text-xs text-gray-400 dark:text-gray-500">變數無法個人化</span>
            )}
          </div>
        )}
      </div>

      {/* Variable + personalization warning */}
      {hasVariables && method === 'outlook' && (
        <div className="flex items-start gap-2 mb-4 px-3 py-2.5 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-sm text-amber-700 dark:text-amber-300">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>Outlook BCC 模式下，變數無法個人化（所有人收到相同內容）。切換到 SendGrid 可讓每封信替換 {'{{name}}'} 等變數。</span>
        </div>
      )}

      {/* BCC Recipients */}
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
        <p className="text-xs text-gray-400 mt-1">
          {method === 'outlook'
            ? '預設為你自己的 email，可新增多個（逗號分隔）。CC 不會建立互動紀錄。'
            : sgMode === 'individual'
            ? 'SendGrid 個人化模式不支援 CC，此欄位作為 Reply-To 地址。'
            : '此欄位作為 Reply-To 地址。'}
        </p>
      </div>

      {/* Attachments */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            附件
            <span className="ml-1.5 text-xs font-normal text-gray-400">最多 {MAX_FILES} 個，每個 5 MB</span>
          </label>
          {attachments.length < MAX_FILES && (
            <label className="flex items-center gap-1 text-xs px-2 py-1 rounded-md text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20 cursor-pointer transition-colors">
              <Paperclip size={12} />
              新增附件
              <input
                type="file"
                className="hidden"
                multiple
                onChange={handleFileChange}
              />
            </label>
          )}
        </div>
        {attachments.length > 0 && (
          <div className="space-y-1">
            {attachments.map((f, i) => (
              <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-md">
                <Paperclip size={12} className="text-gray-400 shrink-0" />
                <span className="text-xs text-gray-700 dark:text-gray-300 flex-1 truncate">{f.name}</span>
                <span className="text-xs text-gray-400 shrink-0">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                <button
                  onClick={() => removeAttachment(i)}
                  className="text-gray-300 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 transition-colors"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
        {attachmentError && (
          <p className="text-xs text-red-500 mt-1">{attachmentError}</p>
        )}
      </div>

      {/* Subject */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">主旨</label>
        <input
          type="text"
          value={subject}
          onChange={e => setSubject(e.target.value)}
          placeholder="郵件主旨（可用 {{name}} {{company}} {{job_title}} 變數）"
          className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Body - toolbar row */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">內文</label>
          <div className="flex items-center gap-2">
            {/* Template selector */}
            <div className="relative">
              <button
                onClick={() => setShowTemplates(v => !v)}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded-md text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:text-blue-400 dark:hover:bg-blue-900/20 transition-colors"
              >
                <FileText size={12} />
                模板
                <ChevronDown size={10} />
              </button>
              {showTemplates && (
                <div className="absolute right-0 top-full mt-1 w-56 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20 py-1">
                  {templates.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-gray-400">尚無模板</p>
                  ) : templates.map(t => (
                    <button
                      key={t.id}
                      onClick={() => applyTemplate(t)}
                      className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <div className="font-medium">{t.title}</div>
                      {t.subject && <div className="text-xs text-gray-400 truncate">{t.subject}</div>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Preview button */}
            <button
              onClick={() => {
                if (!showPreview && recipients.length > 0) {
                  setPreviewContact(recipients[0])
                }
                setShowPreview(v => !v)
              }}
              disabled={!bodyHtml.trim()}
              className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors ${showPreview ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'text-gray-500 hover:text-green-600 hover:bg-green-50 dark:hover:text-green-400 dark:hover:bg-green-900/20'} disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              <Eye size={12} />
              預覽
            </button>

            {/* AI button */}
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
        </div>

        {/* Preview panel */}
        {showPreview && previewContact && (
          <div className="mb-3 border border-green-200 dark:border-green-800 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-green-50 dark:bg-green-950/30 border-b border-green-200 dark:border-green-800">
              <span className="text-xs text-green-700 dark:text-green-300 font-medium">預覽模式（模擬收件人）</span>
              <select
                value={previewContact.id}
                onChange={e => {
                  const c = recipients.find(r => r.id === e.target.value)
                  if (c) setPreviewContact(c)
                }}
                className="text-xs px-2 py-1 border border-green-300 dark:border-green-700 rounded bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
              >
                {recipients.slice(0, 20).map(r => (
                  <option key={r.id} value={r.id}>{r.name || r.email}</option>
                ))}
              </select>
            </div>
            <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800/50 border-b border-green-200 dark:border-green-800">
              <p className="text-xs text-gray-500"><strong>主旨：</strong>{substituteVariables(subject, previewContact)}</p>
            </div>
            <div
              className="prose prose-sm dark:prose-invert max-w-none px-4 py-3 min-h-[120px] bg-white dark:bg-gray-900"
              dangerouslySetInnerHTML={{ __html: substituteVariables(bodyHtml, previewContact) }}
            />
          </div>
        )}

        <TipTapEditor
          key={editorKey}
          content={bodyHtml}
          onChange={(html) => setBodyHtml(html)}
          placeholder="先寫草稿，再按「AI 潤稿」自動修飾成正式郵件...（可用 {{name}} {{company}} {{job_title}} 變數）"
        />
      </div>

      {/* Warning for SendGrid */}
      {method === 'sendgrid' && sgMode === 'individual' && !hasVariables && (
        <div className="flex items-start gap-2 mb-4 px-3 py-2.5 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-sm text-amber-700 dark:text-amber-300">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>每位收件人各收到一封獨立信件（非 BCC），寄件人為系統 SendGrid 帳號。</span>
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
