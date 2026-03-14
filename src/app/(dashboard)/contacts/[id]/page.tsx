'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { sendMail } from '@/lib/graph'
import { ArrowLeft, ImageIcon, Mail, X } from 'lucide-react'
import Image from 'next/image'

interface Contact {
  id: string
  name: string | null
  company: string | null
  job_title: string | null
  email: string | null
  phone: string | null
  card_img_url: string | null
  created_at: string
  users: { display_name: string | null } | null
}

interface Log {
  id: string
  content: string
  created_at: string
  users: { display_name: string | null } | null
}

interface EmailTemplate {
  id: string
  title: string
  subject: string | null
  body_content: string | null
}

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createBrowserSupabaseClient()

  const [contact, setContact] = useState<Contact | null>(null)
  const [logs, setLogs] = useState<Log[]>([])
  const [newLog, setNewLog] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [lightbox, setLightbox] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  // Mail modal state
  const [mailOpen, setMailOpen] = useState(false)
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [mailSubject, setMailSubject] = useState('')
  const [mailBody, setMailBody] = useState('')
  const [mailSending, setMailSending] = useState(false)
  const [mailError, setMailError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      // Get current user's users.id
      const { data: { user } } = await supabase.auth.getUser()
      if (user?.email) {
        const { data: profile } = await supabase
          .from('users')
          .select('id')
          .eq('email', user.email)
          .single()
        if (profile) setCurrentUserId(profile.id)
      }

      const [{ data: c }, { data: l }] = await Promise.all([
        supabase
          .from('contacts')
          .select('*, users(display_name)')
          .eq('id', id)
          .single(),
        supabase
          .from('interaction_logs')
          .select('id, content, created_at, users(display_name)')
          .eq('contact_id', id)
          .order('created_at', { ascending: false }),
      ])
      setContact(c as Contact)
      setLogs((l as Log[]) ?? [])
    }
    load()
  }, [id])

  async function addLog(content: string) {
    const { data } = await supabase
      .from('interaction_logs')
      .insert({ contact_id: id, content, created_by: currentUserId })
      .select('id, content, created_at, users(display_name)')
      .single()
    if (data) setLogs((prev) => [data as Log, ...prev])
  }

  async function handleAddLog() {
    if (!newLog.trim()) return
    setSubmitting(true)
    await addLog(newLog.trim())
    setNewLog('')
    setSubmitting(false)
  }

  async function openMailModal() {
    const { data } = await supabase
      .from('email_templates')
      .select('id, title, subject, body_content')
      .order('title')
    setTemplates(data ?? [])
    setMailSubject('')
    setMailBody('')
    setMailError(null)
    setMailOpen(true)
  }

  function applyTemplate(t: EmailTemplate) {
    setMailSubject(t.subject ?? '')
    setMailBody(t.body_content ?? '')
  }

  async function handleSendMail() {
    if (!contact?.email || !mailSubject.trim()) return
    setMailSending(true)
    setMailError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const accessToken = session?.provider_token
      if (!accessToken) throw new Error('找不到 Microsoft 存取權限，請重新登入')

      await sendMail({
        accessToken,
        to: contact.email,
        subject: mailSubject,
        body: mailBody,
      })

      await addLog(`寄送郵件：${mailSubject}`)
      setMailOpen(false)
    } catch (e) {
      setMailError(e instanceof Error ? e.message : '寄送失敗，請稍後再試')
    } finally {
      setMailSending(false)
    }
  }

  if (!contact) {
    return <div className="text-gray-400 text-sm">載入中...</div>
  }

  const fields = [
    { label: '姓名', value: contact.name },
    { label: '公司', value: contact.company },
    { label: '職稱', value: contact.job_title },
    { label: 'Email', value: contact.email },
    { label: '電話', value: contact.phone },
    { label: '建立者', value: contact.users?.display_name },
  ]

  return (
    <div className="max-w-2xl mx-auto">
      {/* Back */}
      <button
        onClick={() => router.push('/contacts')}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-5"
      >
        <ArrowLeft size={16} /> 返回聯絡人列表
      </button>

      {/* Basic Info */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-3">
            {fields.map(({ label, value }) => (
              <div key={label} className="flex gap-3 text-sm">
                <span className="w-16 text-gray-400 shrink-0">{label}</span>
                <span className="text-gray-900 font-medium">{value || '—'}</span>
              </div>
            ))}
          </div>

          {/* Card Image */}
          {contact.card_img_url ? (
            <div
              className="w-32 h-20 rounded-lg overflow-hidden border border-gray-200 cursor-pointer shrink-0"
              onClick={() => setLightbox(true)}
            >
              <Image
                src={contact.card_img_url}
                alt="名片"
                width={128}
                height={80}
                className="object-cover w-full h-full"
              />
            </div>
          ) : (
            <div className="w-32 h-20 rounded-lg border border-dashed border-gray-300 flex items-center justify-center shrink-0">
              <ImageIcon size={24} className="text-gray-300" />
            </div>
          )}
        </div>

        {/* Send Mail Button */}
        {contact.email && (
          <div className="mt-5 pt-5 border-t border-gray-100">
            <button
              onClick={openMailModal}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Mail size={15} />
              寄信給 {contact.name || contact.email}
            </button>
          </div>
        )}
      </div>

      {/* Interaction Logs */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">互動紀錄</h2>

        {/* Add Log */}
        <div className="flex gap-2 mb-6">
          <input
            type="text"
            value={newLog}
            onChange={(e) => setNewLog(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddLog()}
            placeholder="輸入互動紀錄..."
            className="flex-1 text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleAddLog}
            disabled={submitting || !newLog.trim()}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
          >
            新增
          </button>
        </div>

        {/* Timeline */}
        {logs.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">尚無互動紀錄</p>
        ) : (
          <ol className="relative border-l border-gray-200 space-y-4 pl-5">
            {logs.map((log) => (
              <li key={log.id} className="relative">
                <div className="absolute -left-[21px] top-1 w-3 h-3 rounded-full bg-blue-500 border-2 border-white" />
                <p className="text-sm text-gray-800">{log.content}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {log.users?.display_name && (
                    <span className="text-xs text-gray-500">{log.users.display_name}</span>
                  )}
                  <time className="text-xs text-gray-400">
                    {new Date(log.created_at).toLocaleString('zh-TW')}
                  </time>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && contact.card_img_url && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
          onClick={() => setLightbox(false)}
        >
          <Image
            src={contact.card_img_url}
            alt="名片大圖"
            width={800}
            height={500}
            className="max-w-[90vw] max-h-[80vh] object-contain rounded-lg"
          />
        </div>
      )}

      {/* Mail Modal */}
      {mailOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h3 className="text-base font-semibold text-gray-900">寄送郵件</h3>
              <button onClick={() => setMailOpen(false)} className="text-gray-400 hover:text-gray-700">
                <X size={18} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Recipient */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">收件人</label>
                <input
                  type="text"
                  value={contact.email ?? ''}
                  readOnly
                  className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-600"
                />
              </div>

              {/* Template selector */}
              {templates.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">套用範本</label>
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      const t = templates.find((t) => t.id === e.target.value)
                      if (t) applyTemplate(t)
                    }}
                    className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">— 選擇範本 —</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>{t.title}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Subject */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">主旨</label>
                <input
                  type="text"
                  value={mailSubject}
                  onChange={(e) => setMailSubject(e.target.value)}
                  placeholder="郵件主旨"
                  className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Body */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">內文（支援 HTML）</label>
                <textarea
                  value={mailBody}
                  onChange={(e) => setMailBody(e.target.value)}
                  rows={6}
                  placeholder="郵件內文..."
                  className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              {mailError && (
                <p className="text-sm text-red-600">{mailError}</p>
              )}
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200">
              <button
                onClick={() => setMailOpen(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSendMail}
                disabled={mailSending || !mailSubject.trim()}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
              >
                <Mail size={14} />
                {mailSending ? '寄送中...' : '送出'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
