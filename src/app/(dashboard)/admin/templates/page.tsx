'use client'

import { useEffect, useRef, useState } from 'react'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { Pencil, Trash2, Plus, X, Upload, Paperclip, Loader2 } from 'lucide-react'

const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2MB

interface Attachment {
  id: string
  file_name: string
  file_url: string
  file_size: number
}

interface Template {
  id: string
  title: string
  subject: string | null
  body_content: string | null
  created_at: string
  attachments: Attachment[]
}

const emptyForm = () => ({ title: '', subject: '', body_content: '' })

export default function AdminTemplatesPage() {
  const supabase = createBrowserSupabaseClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Template | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  useEffect(() => { fetchTemplates() }, [])

  async function fetchTemplates() {
    setLoading(true)
    const { data } = await supabase
      .from('email_templates')
      .select('id, title, subject, body_content, created_at, template_attachments(id, file_name, file_url, file_size)')
      .order('created_at', { ascending: false })

    setTemplates((data ?? []).map((t) => ({
      ...t,
      attachments: (t.template_attachments as Attachment[]) ?? [],
    })))
    setLoading(false)
  }

  function openNew() {
    setEditing(null)
    setForm(emptyForm())
    setAttachments([])
    setFileError(null)
    setShowForm(true)
  }

  function openEdit(t: Template) {
    setEditing(t)
    setForm({ title: t.title, subject: t.subject ?? '', body_content: t.body_content ?? '' })
    setAttachments([...t.attachments])
    setFileError(null)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditing(null)
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    setFileError(null)

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        setFileError(`「${file.name}」超過 2MB 限制`)
        continue
      }
      setUploading(true)
      const path = `${Date.now()}_${file.name}`
      const { error } = await supabase.storage.from('template-attachments').upload(path, file, { upsert: false })
      if (error) { setFileError(error.message); setUploading(false); continue }
      const { data: urlData } = supabase.storage.from('template-attachments').getPublicUrl(path)

      if (editing) {
        // Save directly to DB if editing existing template
        const { data: att } = await supabase
          .from('template_attachments')
          .insert({ template_id: editing.id, file_name: file.name, file_url: urlData.publicUrl, file_size: file.size })
          .select('id, file_name, file_url, file_size')
          .single()
        if (att) setAttachments((prev) => [...prev, att as Attachment])
      } else {
        // Pending: store in local state until template is saved
        setAttachments((prev) => [...prev, { id: `pending_${Date.now()}`, file_name: file.name, file_url: urlData.publicUrl, file_size: file.size }])
      }
      setUploading(false)
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function removeAttachment(att: Attachment) {
    if (editing && !att.id.startsWith('pending_')) {
      await supabase.from('template_attachments').delete().eq('id', att.id)
    }
    setAttachments((prev) => prev.filter((a) => a.id !== att.id))
  }

  async function save() {
    if (!form.title.trim()) return
    setSaving(true)
    if (editing) {
      await supabase.from('email_templates').update({ title: form.title, subject: form.subject, body_content: form.body_content }).eq('id', editing.id)
    } else {
      const { data: created } = await supabase
        .from('email_templates')
        .insert({ title: form.title, subject: form.subject, body_content: form.body_content })
        .select('id').single()
      if (created) {
        const pending = attachments.filter((a) => a.id.startsWith('pending_'))
        if (pending.length > 0) {
          await supabase.from('template_attachments').insert(
            pending.map((a) => ({ template_id: created.id, file_name: a.file_name, file_url: a.file_url, file_size: a.file_size }))
          )
        }
      }
    }
    setSaving(false)
    closeForm()
    fetchTemplates()
  }

  async function deleteTemplate(id: string) {
    await supabase.from('email_templates').delete().eq('id', id)
    setTemplates((prev) => prev.filter((t) => t.id !== id))
    setConfirmDeleteId(null)
  }

  function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">郵件範本</h1>
        <button onClick={openNew} className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          <Plus size={16} /> 新增範本
        </button>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <tr>
              {['範本名稱', '郵件主旨', '附件', '建立時間', ''].map((h) => (
                <th key={h} className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">載入中...</td></tr>
            ) : templates.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">尚無郵件範本</td></tr>
            ) : (
              templates.map((t) => (
                <tr key={t.id} className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3 font-medium text-gray-800 dark:text-gray-200">{t.title}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{t.subject || '—'}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                    {t.attachments.length > 0
                      ? <span className="flex items-center gap-1"><Paperclip size={13} />{t.attachments.length} 個</span>
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                    {new Date(t.created_at).toLocaleDateString('zh-TW')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-3 justify-end">
                      <button onClick={() => openEdit(t)} className="text-gray-400 hover:text-blue-500 dark:hover:text-blue-400">
                        <Pencil size={16} />
                      </button>
                      {confirmDeleteId === t.id ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-red-500">確認刪除？</span>
                          <button onClick={() => deleteTemplate(t.id)} className="text-xs text-red-600 dark:text-red-400 hover:underline">確認</button>
                          <button onClick={() => setConfirmDeleteId(null)} className="text-xs text-gray-400">取消</button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmDeleteId(t.id)} className="text-gray-400 hover:text-red-500 dark:hover:text-red-400">
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Edit/New Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-900">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{editing ? '編輯範本' : '新增範本'}</h2>
              <button onClick={closeForm} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"><X size={20} /></button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">範本名稱 *</label>
                <input type="text" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">郵件主旨</label>
                <input type="text" value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">郵件內文（支援 HTML）</label>
                <textarea rows={8} value={form.body_content} onChange={(e) => setForm((f) => ({ ...f, body_content: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              {/* Attachments */}
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">附件（單檔最大 2MB）</label>
                <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileUpload} />
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}
                  className="flex items-center gap-2 text-sm px-3 py-2 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-gray-500 dark:text-gray-400 hover:border-blue-400 hover:text-blue-600 disabled:opacity-40 w-full justify-center">
                  {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                  {uploading ? '上傳中...' : '點擊上傳附件'}
                </button>
                {fileError && <p className="text-xs text-red-500 dark:text-red-400 mt-1">{fileError}</p>}
                {attachments.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {attachments.map((a) => (
                      <div key={a.id} className="flex items-center gap-2 text-sm bg-gray-50 dark:bg-gray-800 px-3 py-2 rounded-lg">
                        <Paperclip size={13} className="text-gray-400 shrink-0" />
                        <a href={a.file_url} target="_blank" rel="noreferrer" className="flex-1 truncate text-blue-600 dark:text-blue-400 hover:underline text-xs">
                          {a.file_name}
                        </a>
                        <span className="text-xs text-gray-400 shrink-0">{formatSize(a.file_size)}</span>
                        <button onClick={() => removeAttachment(a)} className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 shrink-0">
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 sticky bottom-0 bg-white dark:bg-gray-900">
              <button onClick={closeForm} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900">取消</button>
              <button onClick={save} disabled={saving || !form.title.trim() || uploading}
                className="flex items-center gap-2 px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">
                {saving && <Loader2 size={14} className="animate-spin" />}
                {saving ? '儲存中...' : '儲存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
