'use client'

import { useEffect, useState } from 'react'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { Pencil, Trash2, Plus, X } from 'lucide-react'

const supabase = createBrowserSupabaseClient()

interface Template {
  id: string
  title: string | null
  subject: string | null
  body_content: string | null
  attachment_urls: string[] | null
  created_at: string
}

const emptyForm = (): Omit<Template, 'id' | 'created_at'> => ({
  title: '',
  subject: '',
  body_content: '',
  attachment_urls: [],
})

export default function AdminTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Template | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [newAttachment, setNewAttachment] = useState('')
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    fetchTemplates()
  }, [])

  async function fetchTemplates() {
    const { data } = await supabase
      .from('email_templates')
      .select('*')
      .order('created_at', { ascending: false })
    setTemplates(data ?? [])
    setLoading(false)
  }

  function openNew() {
    setEditing(null)
    setForm(emptyForm())
    setShowForm(true)
  }

  function openEdit(t: Template) {
    setEditing(t)
    setForm({
      title: t.title ?? '',
      subject: t.subject ?? '',
      body_content: t.body_content ?? '',
      attachment_urls: t.attachment_urls ?? [],
    })
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditing(null)
    setNewAttachment('')
  }

  function addAttachment() {
    if (!newAttachment.trim()) return
    setForm((f) => ({ ...f, attachment_urls: [...(f.attachment_urls ?? []), newAttachment.trim()] }))
    setNewAttachment('')
  }

  function removeAttachment(idx: number) {
    setForm((f) => ({ ...f, attachment_urls: f.attachment_urls?.filter((_, i) => i !== idx) ?? null }))
  }

  async function save() {
    setSaving(true)
    if (editing) {
      const { data } = await supabase
        .from('email_templates')
        .update(form)
        .eq('id', editing.id)
        .select('*')
        .single()
      if (data) setTemplates((prev) => prev.map((t) => (t.id === data.id ? data : t)))
    } else {
      const { data } = await supabase
        .from('email_templates')
        .insert(form)
        .select('*')
        .single()
      if (data) setTemplates((prev) => [data, ...prev])
    }
    setSaving(false)
    closeForm()
  }

  async function deleteTemplate(id: string) {
    if (!confirm('確定要刪除此範本嗎？')) return
    await supabase.from('email_templates').delete().eq('id', id)
    setTemplates((prev) => prev.filter((t) => t.id !== id))
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">郵件範本</h1>
        <button
          onClick={openNew}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={16} /> 新增範本
        </button>
      </div>

      {/* List */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['範本名稱', '郵件主旨', '建立時間', ''].map((h) => (
                <th key={h} className="px-4 py-3 text-left font-medium text-gray-600">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">載入中...</td></tr>
            ) : templates.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">尚無郵件範本</td></tr>
            ) : (
              templates.map((t) => (
                <tr key={t.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{t.title || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{t.subject || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(t.created_at).toLocaleDateString('zh-TW')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-3 justify-end">
                      <button onClick={() => openEdit(t)} className="text-gray-400 hover:text-blue-500 transition-colors">
                        <Pencil size={16} />
                      </button>
                      <button onClick={() => deleteTemplate(t.id)} className="text-gray-400 hover:text-red-500 transition-colors">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-base font-semibold text-gray-900">
                {editing ? '編輯範本' : '新增範本'}
              </h2>
              <button onClick={closeForm} className="text-gray-400 hover:text-gray-700">
                <X size={20} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">範本名稱</label>
                <input
                  type="text"
                  value={form.title ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">郵件主旨</label>
                <input
                  type="text"
                  value={form.subject ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">郵件內文（支援 HTML）</label>
                <textarea
                  rows={8}
                  value={form.body_content ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, body_content: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-2">附件 URL</label>
                <div className="space-y-2 mb-2">
                  {(form.attachment_urls ?? []).map((url, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm">
                      <span className="flex-1 truncate text-gray-700 bg-gray-50 px-3 py-1.5 rounded border border-gray-200">
                        {url}
                      </span>
                      <button onClick={() => removeAttachment(idx)} className="text-gray-400 hover:text-red-500">
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newAttachment}
                    onChange={(e) => setNewAttachment(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addAttachment()}
                    placeholder="https://..."
                    className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={addAttachment}
                    className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200">
              <button onClick={closeForm} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
                取消
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
              >
                {saving ? '儲存中...' : '儲存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
