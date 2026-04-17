'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
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

function substituteVariables(html: string, contact: Recipient): string {
  return html
    .replace(/\{\{name\}\}/g, contact.name ?? '')
    .replace(/\{\{company\}\}/g, contact.company ?? '')
    .replace(/\{\{job_title\}\}/g, contact.job_title ?? '')
}

export default function EmailComposePage() {
  const router = useRouter()
  const t = useTranslations('emailCompose')
  const tc = useTranslations('common')
  const supabase = createBrowserSupabaseClient()

  const VARIABLES = [
    { label: t('varName'), value: '{{name}}' },
    { label: t('varCompany'), value: '{{company}}' },
    { label: t('varJobTitle'), value: '{{job_title}}' },
  ]

  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; method: string; sent: number; errors: string[] } | null>(null)
  const [testStatus, setTestStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  const [subject, setSubject] = useState('')
  const [bodyHtml, setBodyHtml] = useState('')
  const [cc, setCc] = useState('')
  const [replyTo, setReplyTo] = useState('')
  const [userId, setUserId] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [includeSelf, setIncludeSelf] = useState(true)
  const [showRecipients, setShowRecipients] = useState(false)
  const [canBulkEmail, setCanBulkEmail] = useState(false)

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
      .select('id, email, role, granted_features')
      .eq('email', user.email!)
      .single()
    if (profile) {
      setUserId(profile.id)
      setUserEmail(user.email ?? '')
      setCc(user.email ?? '')
      setReplyTo(user.email ?? '')
      const isSuperAdmin = profile.role === 'super_admin'
      const hasFeature = (profile.granted_features ?? []).includes('bulk_email')
      setCanBulkEmail(isSuperAdmin || hasFeature)
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
      setAttachmentError(t('attachmentTooMany', { max: MAX_FILES }))
      return
    }
    const oversized = incoming.find(f => f.size > MAX_FILE_SIZE)
    if (oversized) {
      setAttachmentError(t('attachmentTooLarge', { name: oversized.name }))
      return
    }
    setAttachmentError('')
    setAttachments(combined)
  }

  function removeAttachment(index: number) {
    setAttachments(prev => prev.filter((_, i) => i !== index))
    setAttachmentError('')
  }

  function applyTemplate(tmpl: Template) {
    if (tmpl.subject) setSubject(tmpl.subject)
    if (tmpl.body_content) {
      setBodyHtml(tmpl.body_content)
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
      alert(e instanceof Error ? e.message : t('aiFailed'))
    } finally {
      setAiLoading(false)
    }
  }

  async function handleSend() {
    if (!subject.trim() || !bodyHtml.trim() || recipients.length === 0) return
    setSending(true)
    try {
      const selfActive = method === 'sendgrid' && includeSelf && !!userEmail
      const meta = {
        contactIds: recipients.map(r => r.id),
        subject,
        bodyHtml,
        cc: method === 'outlook' ? (cc.trim() || undefined) : undefined,
        replyTo: method === 'sendgrid' ? (replyTo.trim() || undefined) : undefined,
        userId,
        method,
        sgMode,
        selfEmail: selfActive ? userEmail : undefined,
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

  async function handleTestSend() {
    if (!subject.trim() || !bodyHtml.trim() || !userEmail) return
    setTestStatus('sending')
    try {
      const res = await fetch('/api/email/test-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, bodyHtml, method, userId, toEmail: userEmail }),
      })
      const data = await res.json()
      setTestStatus(data.ok ? 'sent' : 'error')
      if (data.ok) setTimeout(() => setTestStatus('idle'), 3000)
    } catch {
      setTestStatus('error')
    }
  }

  const hasVariables = /\{\{(name|company|job_title)\}\}/.test(bodyHtml) || /\{\{(name|company|job_title)\}\}/.test(subject)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <Loader2 className="animate-spin mr-2" size={20} /> {tc('loading')}
      </div>
    )
  }

  if (sent && result) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center">
        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium mb-4 ${result.ok ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'}`}>
          {result.ok ? t('sentSuccess', { sent: result.sent, method: result.method }) : t('sentFailed')}
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
          {t('backToContacts')}
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
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t('title')}</h1>
      </div>

      {/* Method selector */}
      <div className="flex flex-col gap-2 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <button
              onClick={() => setMethod('outlook')}
              className={`text-xs px-3 py-1.5 font-medium transition-colors ${method === 'outlook' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
            >
              {t('methodOutlook')}
            </button>
            <button
              onClick={() => setMethod('sendgrid')}
              className={`text-xs px-3 py-1.5 font-medium transition-colors ${method === 'sendgrid' ? 'bg-purple-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
            >
              {t('methodSendgrid')}
            </button>
          </div>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {t('recipients', { count: recipients.length })}
            {method === 'outlook'
              ? t('methodBcc')
              : sgMode === 'bcc'
              ? t('methodSgBcc')
              : t('methodSgIndividual')}
          </span>
          {method === 'outlook' && recipients.length >= 450 && (
            <span className="text-xs text-amber-600 dark:text-amber-400">{t('outlookLimit')}</span>
          )}
        </div>

        {/* SendGrid sub-mode */}
        {method === 'sendgrid' && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 dark:text-gray-500">{t('sgMode')}</span>
            <div className="inline-flex rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden">
              <button
                onClick={() => setSgMode('individual')}
                className={`text-xs px-3 py-1 transition-colors ${sgMode === 'individual' ? 'bg-purple-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
              >
                {t('sgModeIndividual')}
              </button>
              <button
                onClick={() => setSgMode('bcc')}
                className={`text-xs px-3 py-1 transition-colors ${sgMode === 'bcc' ? 'bg-purple-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
              >
                {t('sgModeBcc')}
              </button>
            </div>
            {sgMode === 'bcc' && (
              <span className="text-xs text-gray-400 dark:text-gray-500">{t('sgModeNoteNoVar')}</span>
            )}
          </div>
        )}
      </div>

      {/* Variable + personalization warning */}
      {hasVariables && method === 'outlook' && (
        <div className="flex items-start gap-2 mb-4 px-3 py-2.5 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-sm text-amber-700 dark:text-amber-300">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{t('varWarning')}</span>
        </div>
      )}

      {/* BCC Recipients */}
      <div className="mb-4">
        {(() => {
          const selfActive = method === 'sendgrid' && includeSelf && !!userEmail
          const totalCount = recipients.length + (selfActive ? 1 : 0)
          return (
            <>
              <button
                onClick={() => setShowRecipients(v => !v)}
                className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
              >
                <Users size={14} />
                {method === 'sendgrid' && sgMode === 'individual'
                  ? t('recipientsLabel', { count: totalCount })
                  : t('bccRecipients', { count: totalCount })}
                <span className="text-xs text-blue-500">{showRecipients ? t('collapse') : t('showEdit')}</span>
              </button>
              {showRecipients && (
                <div className="mt-2 max-h-64 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-gray-800/50">
                  <div className="flex flex-wrap gap-1.5">
                    {recipients.map(r => (
                      <span key={r.id} className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-full">
                        <span>{r.name || r.email}</span>
                        {r.company && <span className="text-gray-400">({r.company})</span>}
                        <button
                          onClick={() => removeRecipient(r.id)}
                          className="ml-0.5 text-gray-300 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400"
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                    {selfActive && (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-full">
                        <span className="text-[10px] font-semibold text-blue-500 dark:text-blue-400">我</span>
                        <span className="text-gray-700 dark:text-gray-300">{userEmail}</span>
                        <button
                          onClick={() => setIncludeSelf(false)}
                          className="ml-0.5 text-blue-300 hover:text-red-500 dark:text-blue-600 dark:hover:text-red-400"
                        >
                          <X size={12} />
                        </button>
                      </span>
                    )}
                  </div>
                  {totalCount === 0 && (
                    <p className="text-xs text-gray-400 text-center py-2">{t('removeAll')}</p>
                  )}
                </div>
              )}
            </>
          )
        })()}
      </div>

      {/* Bulk email permission warning */}
      {recipients.length > 20 && !canBulkEmail && (
        <div className="flex items-start gap-2 mb-4 px-3 py-2.5 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 text-sm text-red-700 dark:text-red-300">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{t('bulkPermissionWarning')}</span>
        </div>
      )}

      {/* CC (Outlook only) */}
      {method === 'outlook' && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('ccLabel')}</label>
          <input
            type="text"
            value={cc}
            onChange={e => setCc(e.target.value)}
            placeholder={t('ccPlaceholder')}
            className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p className="text-xs text-gray-400 mt-1">{t('ccHint')}</p>
        </div>
      )}

      {/* Reply-To (SendGrid only) */}
      {method === 'sendgrid' && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('replyToLabel')}</label>
          <input
            type="email"
            value={replyTo}
            onChange={e => setReplyTo(e.target.value)}
            placeholder={t('replyToPlaceholder')}
            className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p className="text-xs text-gray-400 mt-1">{t('replyToHint')}</p>
        </div>
      )}

      {/* Attachments */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {t('attachments')}
            <span className="ml-1.5 text-xs font-normal text-gray-400">{t('attachmentsLimit', { max: MAX_FILES })}</span>
          </label>
          {attachments.length < MAX_FILES && (
            <label className="flex items-center gap-1 text-xs px-2 py-1 rounded-md text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20 cursor-pointer transition-colors">
              <Paperclip size={12} />
              {t('addAttachment')}
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
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('subjectLabel')}</label>
        <input
          type="text"
          value={subject}
          onChange={e => setSubject(e.target.value)}
          placeholder={t('subjectPlaceholder')}
          className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Body - toolbar row */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('bodyLabel')}</label>
          <div className="flex items-center gap-2">
            {/* Template selector */}
            <div className="relative">
              <button
                onClick={() => setShowTemplates(v => !v)}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded-md text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:text-blue-400 dark:hover:bg-blue-900/20 transition-colors"
              >
                <FileText size={12} />
                {t('templates')}
                <ChevronDown size={10} />
              </button>
              {showTemplates && (
                <div className="absolute right-0 top-full mt-1 w-56 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20 py-1">
                  {templates.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-gray-400">{t('noTemplates')}</p>
                  ) : templates.map(tmpl => (
                    <button
                      key={tmpl.id}
                      onClick={() => applyTemplate(tmpl)}
                      className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <div className="font-medium">{tmpl.title}</div>
                      {tmpl.subject && <div className="text-xs text-gray-400 truncate">{tmpl.subject}</div>}
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
              {t('preview')}
            </button>

            {/* AI button */}
            <button
              onClick={handleAiGenerate}
              disabled={aiLoading || (!bodyHtml.trim() && !subject.trim())}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-md text-purple-600 hover:bg-purple-50 dark:text-purple-400 dark:hover:bg-purple-900/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {aiLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              {aiLoading ? t('aiPolishing') : t('aiPolish')}
            </button>
          </div>
        </div>

        {/* Preview panel */}
        {showPreview && previewContact && (
          <div className="mb-3 border border-green-200 dark:border-green-800 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-green-50 dark:bg-green-950/30 border-b border-green-200 dark:border-green-800">
              <span className="text-xs text-green-700 dark:text-green-300 font-medium">{t('previewMode')}</span>
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
              <p className="text-xs text-gray-500"><strong>{t('subjectLabel')}：</strong>{substituteVariables(subject, previewContact)}</p>
            </div>
            <div
              className="prose prose-sm dark:prose-invert max-w-none px-4 py-3 min-h-[120px] bg-white dark:bg-gray-900"
              dangerouslySetInnerHTML={{ __html: substituteVariables(bodyHtml, previewContact).replace(/<p><\/p>/g, '<p><br></p>') }}
            />
          </div>
        )}

        <TipTapEditor
          key={editorKey}
          content={bodyHtml}
          onChange={(html) => setBodyHtml(html)}
          placeholder={`${t('bodyLabel')}... ({{name}} {{company}} {{job_title}})`}
        />
      </div>

      {/* Warning for SendGrid */}
      {method === 'sendgrid' && sgMode === 'individual' && !hasVariables && (
        <div className="flex items-start gap-2 mb-4 px-3 py-2.5 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-sm text-amber-700 dark:text-amber-300">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{t('sgWarning')}</span>
        </div>
      )}

      {/* Send button */}
      <div className="flex items-center gap-3">
        {(() => {
          const selfActive = method === 'sendgrid' && includeSelf && !!userEmail
          const totalCount = recipients.length + (selfActive ? 1 : 0)
          return (
            <button
              onClick={handleSend}
              disabled={sending || !subject.trim() || !bodyHtml.trim() || recipients.length === 0 || (recipients.length > 20 && !canBulkEmail)}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              {sending ? t('sending') : t('send', { count: totalCount })}
            </button>
          )
        })()}

        <button
          onClick={handleTestSend}
          disabled={testStatus === 'sending' || !subject.trim() || !bodyHtml.trim()}
          className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            testStatus === 'sent'
              ? 'border-green-300 text-green-700 bg-green-50 dark:border-green-700 dark:text-green-300 dark:bg-green-950/30'
              : testStatus === 'error'
              ? 'border-red-300 text-red-600 bg-red-50 dark:border-red-700 dark:text-red-400 dark:bg-red-950/30'
              : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
          }`}
        >
          {testStatus === 'sending' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          {testStatus === 'sending' ? t('testSending') : testStatus === 'sent' ? t('testSent') : testStatus === 'error' ? t('testFailed') : t('testSend')}
        </button>
        <button
          onClick={() => router.back()}
          className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
        >
          {t('cancel')}
        </button>
      </div>
    </div>
  )
}
