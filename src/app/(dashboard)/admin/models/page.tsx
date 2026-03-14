'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { Plus, Trash2, Loader2, X, ToggleLeft, ToggleRight } from 'lucide-react'

interface GeminiModel {
  id: string
  model_id: string
  display_name: string
  is_active: boolean
  created_at: string
}

export default function AdminModelsPage() {
  const supabase = createBrowserSupabaseClient()
  const router = useRouter()

  const [models, setModels] = useState<GeminiModel[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ model_id: '', display_name: '' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('email', user.email!)
        .single()

      if (profile?.role !== 'super_admin') { router.push('/'); return }

      await fetchModels()
    }
    init()
  }, [])

  async function fetchModels() {
    setLoading(true)
    const { data } = await supabase
      .from('gemini_models')
      .select('id, model_id, display_name, is_active, created_at')
      .order('created_at', { ascending: true })
    setModels(data ?? [])
    setLoading(false)
  }

  async function handleAdd() {
    setFormError(null)
    if (!form.model_id.trim() || !form.display_name.trim()) {
      setFormError('請填寫所有欄位')
      return
    }
    setSaving(true)
    const { error } = await supabase
      .from('gemini_models')
      .insert({ model_id: form.model_id.trim(), display_name: form.display_name.trim() })
    setSaving(false)
    if (error) {
      setFormError(error.message)
    } else {
      setForm({ model_id: '', display_name: '' })
      setShowForm(false)
      fetchModels()
    }
  }

  async function toggleActive(model: GeminiModel) {
    await supabase
      .from('gemini_models')
      .update({ is_active: !model.is_active })
      .eq('id', model.id)
    setModels((prev) => prev.map((m) => m.id === model.id ? { ...m, is_active: !m.is_active } : m))
  }

  async function deleteModel(id: string) {
    await supabase.from('gemini_models').delete().eq('id', id)
    setModels((prev) => prev.filter((m) => m.id !== id))
    setConfirmDeleteId(null)
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Gemini 模型管理</h1>
        <button
          onClick={() => { setShowForm(true); setFormError(null) }}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus size={16} /> 新增模型
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 mb-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">新增模型</h2>
            <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><X size={16} /></button>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Model ID（傳給 API 的字串）</label>
              <input
                type="text"
                value={form.model_id}
                onChange={(e) => setForm((f) => ({ ...f, model_id: e.target.value }))}
                placeholder="例：gemini-2.5-flash"
                className="w-full text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">顯示名稱</label>
              <input
                type="text"
                value={form.display_name}
                onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
                placeholder="例：Gemini 2.5 Flash"
                className="w-full text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {formError && <p className="text-xs text-red-500 dark:text-red-400">{formError}</p>}
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowForm(false)} className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">取消</button>
              <button
                onClick={handleAdd}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40"
              >
                {saving && <Loader2 size={13} className="animate-spin" />}
                {saving ? '新增中...' : '新增'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <tr>
              {['顯示名稱', 'Model ID', '狀態', '建立時間', ''].map((h) => (
                <th key={h} className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">載入中...</td></tr>
            ) : models.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">尚無模型</td></tr>
            ) : (
              models.map((m) => (
                <tr key={m.id} className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3 font-medium text-gray-800 dark:text-gray-200">{m.display_name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">{m.model_id}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleActive(m)}
                      className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${
                        m.is_active
                          ? 'text-green-600 dark:text-green-400 hover:text-green-700'
                          : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                      }`}
                    >
                      {m.is_active
                        ? <><ToggleRight size={16} /> 啟用</>
                        : <><ToggleLeft size={16} /> 停用</>
                      }
                    </button>
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                    {new Date(m.created_at).toLocaleDateString('zh-TW')}
                  </td>
                  <td className="px-4 py-3">
                    {confirmDeleteId === m.id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-red-500">確認刪除？</span>
                        <button onClick={() => deleteModel(m.id)} className="text-xs text-red-600 dark:text-red-400 hover:underline">確認</button>
                        <button onClick={() => setConfirmDeleteId(null)} className="text-xs text-gray-400">取消</button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmDeleteId(m.id)} className="text-gray-400 hover:text-red-500 dark:hover:text-red-400">
                        <Trash2 size={16} />
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-gray-400 dark:text-gray-500">
        停用的模型不會出現在個人設定的 dropdown。刪除前請確認無使用者正在使用該模型。
      </p>
    </div>
  )
}
