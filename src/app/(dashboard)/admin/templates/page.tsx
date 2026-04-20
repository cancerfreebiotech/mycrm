'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { Pencil, Trash2, Plus, X, Upload, Paperclip, Loader2, Sparkles, ChevronDown, ChevronUp } from 'lucide-react'
import { PermissionGate } from '@/components/PermissionGate'
import TipTapEditor from '@/components/TipTapEditor'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

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
  const t = useTranslations('templates')
  const tc = useTranslations('common')
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
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [aiDescription, setAiDescription] = useState('')
  const [aiGenerating, setAiGenerating] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  useEffect(() => { fetchTemplates() }, [])

  async function fetchTemplates() {
    setLoading(true)
    const { data } = await supabase
      .from('email_templates')
      .select('id, title, subject, body_content, created_at, template_attachments(id, file_name, file_url, file_size)')
      .order('created_at', { ascending: false })

    setTemplates((data ?? []).map((tpl) => ({
      ...tpl,
      attachments: (tpl.template_attachments as Attachment[]) ?? [],
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

  function openEdit(tpl: Template) {
    setEditing(tpl)
    setForm({ title: tpl.title, subject: tpl.subject ?? '', body_content: tpl.body_content ?? '' })
    setAttachments([...tpl.attachments])
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
        setFileError(t('fileSizeErrorFile', { name: file.name }))
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

  async function handleAiGenerate() {
    if (!aiDescription.trim()) return
    setAiError(null)
    setAiGenerating(true)
    try {
      const res = await fetch('/api/ai-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: aiDescription,
          templateContent: form.body_content || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? t('aiError'))
      setForm((f) => ({ ...f, body_content: json.html }))
      setAiDescription('')
    } catch (err) {
      setAiError(err instanceof Error ? err.message : String(err))
    } finally {
      setAiGenerating(false)
    }
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
    setTemplates((prev) => prev.filter((tpl) => tpl.id !== id))
    setConfirmDeleteId(null)
  }

  function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  return (
    <PermissionGate feature="email_templates">
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('title')}</h1>
        <button onClick={openNew} className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          <Plus size={16} /> {t('addTemplate')}
        </button>
      </div>

      {loading ? (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-8 text-center text-sm text-gray-400">{tc('loading')}</div>
      ) : templates.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-8 text-center text-sm text-gray-400">{t('noTemplates')}</div>
      ) : (
        <div className="space-y-3">
          {templates.map((tpl) => {
            const expanded = expandedId === tpl.id
            return (
              <div key={tpl.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="flex items-start gap-3 p-4">
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : tpl.id)}
                    className="flex-1 text-left min-w-0"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 shrink-0">
                        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </span>
                      <span className="font-medium text-gray-800 dark:text-gray-200 truncate">{tpl.title}</span>
                    </div>
                    <div className="mt-1 ml-6 text-sm text-gray-600 dark:text-gray-400 truncate">
                      {tpl.subject || '—'}
                    </div>
                    <div className="mt-1 ml-6 flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                      <span>{new Date(tpl.created_at).toLocaleDateString()}</span>
                      {tpl.attachments.length > 0 && (
                        <span className="flex items-center gap-1">
                          <Paperclip size={12} />
                          {t('attachCount', { count: tpl.attachments.length })}
                        </span>
                      )}
                    </div>
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => openEdit(tpl)}
                      className="p-2 text-gray-400 hover:text-blue-500 dark:hover:text-blue-400"
                      aria-label={tc('edit')}
                    >
                      <Pencil size={16} />
                    </button>
                    {confirmDeleteId === tpl.id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-red-500 hidden sm:inline">{t('confirmDelete')}</span>
                        <button onClick={() => deleteTemplate(tpl.id)} className="text-xs text-red-600 dark:text-red-400 hover:underline">{tc('confirm')}</button>
                        <button onClick={() => setConfirmDeleteId(null)} className="text-xs text-gray-400">{tc('cancel')}</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(tpl.id)}
                        className="p-2 text-gray-400 hover:text-red-500 dark:hover:text-red-400"
                        aria-label={tc('delete')}
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
                {expanded && (
                  <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 px-4 py-3">
                    {tpl.body_content
                      ? (
                        <div
                          className="prose prose-sm dark:prose-invert max-w-none"
                          dangerouslySetInnerHTML={{ __html: tpl.body_content }}
                        />
                      )
                      : <div className="text-xs text-gray-400 italic">—</div>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Edit/New Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-900">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{editing ? t('editTemplate') : t('newTemplate')}</h2>
              <button onClick={closeForm} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"><X size={20} /></button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('nameLabel')}</label>
                <input type="text" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('subjectLabel')}</label>
                <input type="text" value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              {/* AI Generate */}
              <div className="rounded-lg border border-dashed border-purple-300 dark:border-purple-700 bg-purple-50 dark:bg-purple-950/30 p-3 space-y-2">
                <label className="block text-xs font-medium text-purple-700 dark:text-purple-400 flex items-center gap-1">
                  <Sparkles size={13} /> {t('aiGenerate')}
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={aiDescription}
                    onChange={(e) => setAiDescription(e.target.value)}
                    placeholder={t('aiPlaceholder')}
                    className="flex-1 text-sm px-3 py-2 border border-purple-200 dark:border-purple-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAiGenerate() }}
                  />
                  <button
                    type="button"
                    onClick={handleAiGenerate}
                    disabled={aiGenerating || !aiDescription.trim()}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-40 shrink-0"
                  >
                    {aiGenerating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                    {aiGenerating ? t('aiGenerating') : t('generate')}
                  </button>
                </div>
                {aiError && <p className="text-xs text-red-500 dark:text-red-400">{aiError}</p>}
                <p className="text-xs text-purple-500 dark:text-purple-400">{t('aiHint')}</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('bodyLabel')}</label>
                <TipTapEditor
                  content={form.body_content}
                  onChange={(html) => setForm((f) => ({ ...f, body_content: html }))}
                />
              </div>

              {/* Attachments */}
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">{t('attachLabel')}</label>
                <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileUpload} />
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}
                  className="flex items-center gap-2 text-sm px-3 py-2 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-gray-500 dark:text-gray-400 hover:border-blue-400 hover:text-blue-600 disabled:opacity-40 w-full justify-center">
                  {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                  {uploading ? t('uploading') : t('uploadBtn')}
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
              <button onClick={closeForm} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900">{tc('cancel')}</button>
              <button onClick={save} disabled={saving || !form.title.trim() || uploading}
                className="flex items-center gap-2 px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">
                {saving && <Loader2 size={14} className="animate-spin" />}
                {saving ? t('saving') : tc('save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </PermissionGate>
  )
}
