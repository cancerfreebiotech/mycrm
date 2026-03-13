'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { ArrowLeft, ImageIcon } from 'lucide-react'
import Image from 'next/image'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface Contact {
  id: string
  name: string | null
  company: string | null
  job_title: string | null
  email: string | null
  phone: string | null
  card_img_url: string | null
  created_at: string
}

interface Log {
  id: string
  content: string
  created_at: string
}

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [contact, setContact] = useState<Contact | null>(null)
  const [logs, setLogs] = useState<Log[]>([])
  const [newLog, setNewLog] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [lightbox, setLightbox] = useState(false)

  useEffect(() => {
    async function load() {
      const [{ data: c }, { data: l }] = await Promise.all([
        supabase.from('contacts').select('*').eq('id', id).single(),
        supabase
          .from('interaction_logs')
          .select('id, content, created_at')
          .eq('contact_id', id)
          .order('created_at', { ascending: false }),
      ])
      setContact(c)
      setLogs(l ?? [])
    }
    load()
  }, [id])

  async function addLog() {
    if (!newLog.trim()) return
    setSubmitting(true)
    const { data } = await supabase
      .from('interaction_logs')
      .insert({ contact_id: id, content: newLog.trim(), created_by: null })
      .select('id, content, created_at')
      .single()
    if (data) setLogs((prev) => [data, ...prev])
    setNewLog('')
    setSubmitting(false)
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
            onKeyDown={(e) => e.key === 'Enter' && addLog()}
            placeholder="輸入互動紀錄..."
            className="flex-1 text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={addLog}
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
                <time className="text-xs text-gray-400">
                  {new Date(log.created_at).toLocaleString('zh-TW')}
                </time>
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
    </div>
  )
}
