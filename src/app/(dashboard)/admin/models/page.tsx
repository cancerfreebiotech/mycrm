'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { Plus, Trash2, Loader2, X, ToggleLeft, ToggleRight, Eye, EyeOff, ChevronRight } from 'lucide-react'

interface Endpoint {
  id: string
  name: string
  base_url: string
  api_key: string
  is_active: boolean
  created_at: string
  model_count?: number
}

interface AiModel {
  id: string
  endpoint_id: string
  model_id: string
  display_name: string
  is_active: boolean
  created_at: string
}

export default function AdminModelsPage() {
  const supabase = createBrowserSupabaseClient()
  const router = useRouter()
  const t = useTranslations('models')
  const tc = useTranslations('common')

  const [loading, setLoading] = useState(true)
  const [endpoints, setEndpoints] = useState<Endpoint[]>([])
  const [selectedEndpoint, setSelectedEndpoint] = useState<Endpoint | null>(null)
  const [models, setModels] = useState<AiModel[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)

  // Endpoint form
  const [showEndpointForm, setShowEndpointForm] = useState(false)
  const [epForm, setEpForm] = useState({ name: '', base_url: '', api_key: '' })
  const [epSaving, setEpSaving] = useState(false)
  const [epError, setEpError] = useState<string | null>(null)
  const [showApiKey, setShowApiKey] = useState(false)
  const [confirmDeleteEpId, setConfirmDeleteEpId] = useState<string | null>(null)

  // Model form
  const [showModelForm, setShowModelForm] = useState(false)
  const [mdForm, setMdForm] = useState({ model_id: '', display_name: '' })
  const [mdSaving, setMdSaving] = useState(false)
  const [mdError, setMdError] = useState<string | null>(null)
  const [confirmDeleteMdId, setConfirmDeleteMdId] = useState<string | null>(null)

  // Edit API key
  const [editingKeyId, setEditingKeyId] = useState<string | null>(null)
  const [newApiKey, setNewApiKey] = useState('')

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: profile } = await supabase.from('users').select('role').eq('email', user.email!).single()
      if (profile?.role !== 'super_admin') { router.push('/'); return }
      await fetchEndpoints()
    }
    init()
  }, [])

  async function fetchEndpoints() {
    setLoading(true)
    const { data } = await supabase
      .from('ai_endpoints')
      .select('id, name, base_url, api_key, is_active, created_at')
      .order('created_at', { ascending: true })

    if (!data) { setLoading(false); return }

    // Get model counts
    const counts = await Promise.all(
      data.map(async (ep) => {
        const { count } = await supabase
          .from('ai_models')
          .select('*', { count: 'exact', head: true })
          .eq('endpoint_id', ep.id)
        return { id: ep.id, count: count ?? 0 }
      })
    )
    const countMap = Object.fromEntries(counts.map((c) => [c.id, c.count]))
    setEndpoints(data.map((ep) => ({ ...ep, model_count: countMap[ep.id] ?? 0 })))
    setLoading(false)
  }

  async function fetchModels(endpointId: string) {
    setModelsLoading(true)
    const { data } = await supabase
      .from('ai_models')
      .select('id, endpoint_id, model_id, display_name, is_active, created_at')
      .eq('endpoint_id', endpointId)
      .order('created_at', { ascending: true })
    setModels(data ?? [])
    setModelsLoading(false)
  }

  function selectEndpoint(ep: Endpoint) {
    setSelectedEndpoint(ep)
    setShowModelForm(false)
    setMdForm({ model_id: '', display_name: '' })
    fetchModels(ep.id)
  }

  // ── Endpoint CRUD ────────────────────────────────────────────────────────

  async function addEndpoint() {
    setEpError(null)
    if (!epForm.name.trim() || !epForm.base_url.trim() || !epForm.api_key.trim()) {
      setEpError(t('fillAllFields')); return
    }
    setEpSaving(true)
    const { error } = await supabase.from('ai_endpoints').insert({
      name: epForm.name.trim(),
      base_url: epForm.base_url.trim(),
      api_key: epForm.api_key.trim(),
    })
    setEpSaving(false)
    if (error) { setEpError(error.message); return }
    setEpForm({ name: '', base_url: '', api_key: '' })
    setShowEndpointForm(false)
    fetchEndpoints()
  }

  async function toggleEndpoint(ep: Endpoint) {
    await supabase.from('ai_endpoints').update({ is_active: !ep.is_active }).eq('id', ep.id)
    setEndpoints((prev) => prev.map((e) => e.id === ep.id ? { ...e, is_active: !e.is_active } : e))
    if (selectedEndpoint?.id === ep.id) setSelectedEndpoint((p) => p ? { ...p, is_active: !p.is_active } : p)
  }

  async function deleteEndpoint(id: string) {
    await supabase.from('ai_endpoints').delete().eq('id', id)
    setEndpoints((prev) => prev.filter((e) => e.id !== id))
    if (selectedEndpoint?.id === id) { setSelectedEndpoint(null); setModels([]) }
    setConfirmDeleteEpId(null)
  }

  async function saveApiKey(id: string) {
    if (!newApiKey.trim()) return
    await supabase.from('ai_endpoints').update({ api_key: newApiKey.trim() }).eq('id', id)
    setEndpoints((prev) => prev.map((e) => e.id === id ? { ...e, api_key: newApiKey.trim() } : e))
    setEditingKeyId(null)
    setNewApiKey('')
  }

  // ── Model CRUD ───────────────────────────────────────────────────────────

  async function addModel() {
    if (!selectedEndpoint) return
    setMdError(null)
    if (!mdForm.model_id.trim() || !mdForm.display_name.trim()) {
      setMdError(t('fillAllFields')); return
    }
    setMdSaving(true)
    const { error } = await supabase.from('ai_models').insert({
      endpoint_id: selectedEndpoint.id,
      model_id: mdForm.model_id.trim(),
      display_name: mdForm.display_name.trim(),
    })
    setMdSaving(false)
    if (error) { setMdError(error.message); return }
    setMdForm({ model_id: '', display_name: '' })
    setShowModelForm(false)
    fetchModels(selectedEndpoint.id)
    fetchEndpoints()
  }

  async function toggleModel(m: AiModel) {
    await supabase.from('ai_models').update({ is_active: !m.is_active }).eq('id', m.id)
    setModels((prev) => prev.map((x) => x.id === m.id ? { ...x, is_active: !x.is_active } : x))
  }

  async function deleteModel(id: string) {
    await supabase.from('ai_models').delete().eq('id', id)
    setModels((prev) => prev.filter((m) => m.id !== id))
    setConfirmDeleteMdId(null)
    if (selectedEndpoint) fetchEndpoints()
  }

  function maskKey(key: string) {
    if (key === 'placeholder' || key.length <= 8) return '••••••••'
    return key.slice(0, 4) + '••••' + key.slice(-4)
  }

  return (
    <div className="max-w-5xl space-y-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('title')}</h1>

      {/* ── Endpoints ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">Endpoints</h2>
          <button
            onClick={() => { setShowEndpointForm(true); setEpError(null) }}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus size={14} /> {t('addEndpoint')}
          </button>
        </div>

        {showEndpointForm && (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-3">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{t('addEndpoint')}</span>
              <button onClick={() => setShowEndpointForm(false)}><X size={15} className="text-gray-400" /></button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('colName')}</label>
                <input type="text" value={epForm.name} onChange={(e) => setEpForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="例：Google Gemini"
                  className="w-full text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Base URL</label>
                <input type="text" value={epForm.base_url} onChange={(e) => setEpForm((f) => ({ ...f, base_url: e.target.value }))}
                  placeholder="https://..."
                  className="w-full text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">API Key</label>
                <input type="password" value={epForm.api_key} onChange={(e) => setEpForm((f) => ({ ...f, api_key: e.target.value }))}
                  placeholder="sk-..."
                  className="w-full text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            {epError && <p className="text-xs text-red-500 mt-2">{epError}</p>}
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setShowEndpointForm(false)} className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">{tc('cancel')}</button>
              <button onClick={addEndpoint} disabled={epSaving}
                className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">
                {epSaving && <Loader2 size={13} className="animate-spin" />}
                {epSaving ? t('adding') : tc('add')}
              </button>
            </div>
          </div>
        )}

        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <tr>
                {[t('colName'), 'Base URL', 'API Key', 'Models', t('colStatus'), ''].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">{tc('loading')}</td></tr>
              ) : endpoints.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">{t('noEndpoints')}</td></tr>
              ) : endpoints.map((ep) => (
                <tr key={ep.id}
                  onClick={() => selectEndpoint(ep)}
                  className={`border-t border-gray-100 dark:border-gray-800 cursor-pointer transition-colors ${selectedEndpoint?.id === ep.id ? 'bg-blue-50 dark:bg-blue-950/30' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}>
                  <td className="px-4 py-3 font-medium text-gray-800 dark:text-gray-200 flex items-center gap-1">
                    {selectedEndpoint?.id === ep.id && <ChevronRight size={14} className="text-blue-500 shrink-0" />}
                    {ep.name}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 font-mono max-w-[180px] truncate">{ep.base_url}</td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    {editingKeyId === ep.id ? (
                      <div className="flex gap-1">
                        <input type="password" value={newApiKey} onChange={(e) => setNewApiKey(e.target.value)}
                          placeholder="新 API Key"
                          className="text-xs px-2 py-1 border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-28 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        <button onClick={() => saveApiKey(ep.id)} className="text-xs text-blue-600 hover:underline">{tc('save')}</button>
                        <button onClick={() => { setEditingKeyId(null); setNewApiKey('') }} className="text-xs text-gray-400">{tc('cancel')}</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
                          {showApiKey ? ep.api_key : maskKey(ep.api_key)}
                        </span>
                        <button onClick={() => setShowApiKey((v) => !v)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                          {showApiKey ? <EyeOff size={12} /> : <Eye size={12} />}
                        </button>
                        <button onClick={() => { setEditingKeyId(ep.id); setNewApiKey('') }}
                          className="text-xs text-blue-500 hover:underline ml-1">{t('changeKey')}</button>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-center">{ep.model_count}</td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => toggleEndpoint(ep)}
                      className={`flex items-center gap-1 text-xs font-medium ${ep.is_active ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`}>
                      {ep.is_active ? <><ToggleRight size={15} /> {t('enabled')}</> : <><ToggleLeft size={15} /> {t('disabled')}</>}
                    </button>
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    {confirmDeleteEpId === ep.id ? (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-red-500">{t('confirmDelete')}</span>
                        <button onClick={() => deleteEndpoint(ep.id)} className="text-xs text-red-600 hover:underline">{tc('confirm')}</button>
                        <button onClick={() => setConfirmDeleteEpId(null)} className="text-xs text-gray-400">{tc('cancel')}</button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmDeleteEpId(ep.id)} className="text-gray-400 hover:text-red-500 dark:hover:text-red-400">
                        <Trash2 size={15} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Models ── */}
      {selectedEndpoint && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">
              {selectedEndpoint.name} — Models
            </h2>
            <button
              onClick={() => { setShowModelForm(true); setMdError(null) }}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Plus size={14} /> {t('addModel')}
            </button>
          </div>

          {showModelForm && (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-3">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{t('addModel')}</span>
                <button onClick={() => setShowModelForm(false)}><X size={15} className="text-gray-400" /></button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Model ID</label>
                  <input type="text" value={mdForm.model_id} onChange={(e) => setMdForm((f) => ({ ...f, model_id: e.target.value }))}
                    placeholder="例：gemini-2.5-flash"
                    className="w-full text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('colDisplayName')}</label>
                  <input type="text" value={mdForm.display_name} onChange={(e) => setMdForm((f) => ({ ...f, display_name: e.target.value }))}
                    placeholder="例：Gemini 2.5 Flash"
                    className="w-full text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              {mdError && <p className="text-xs text-red-500 mt-2">{mdError}</p>}
              <div className="flex justify-end gap-2 mt-3">
                <button onClick={() => setShowModelForm(false)} className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">{tc('cancel')}</button>
                <button onClick={addModel} disabled={mdSaving}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">
                  {mdSaving && <Loader2 size={13} className="animate-spin" />}
                  {mdSaving ? t('adding') : tc('add')}
                </button>
              </div>
            </div>
          )}

          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  {[t('colDisplayName'), 'Model ID', t('colStatus'), t('colCreated'), ''].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {modelsLoading ? (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">{tc('loading')}</td></tr>
                ) : models.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">{t('noModels')}</td></tr>
                ) : models.map((m) => (
                  <tr key={m.id} className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-3 font-medium text-gray-800 dark:text-gray-200">{m.display_name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">{m.model_id}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => toggleModel(m)}
                        className={`flex items-center gap-1 text-xs font-medium ${m.is_active ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`}>
                        {m.is_active ? <><ToggleRight size={15} /> {t('enabled')}</> : <><ToggleLeft size={15} /> {t('disabled')}</>}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">
                      {new Date(m.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      {confirmDeleteMdId === m.id ? (
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-red-500">{t('confirmDelete')}</span>
                          <button onClick={() => deleteModel(m.id)} className="text-xs text-red-600 hover:underline">{tc('confirm')}</button>
                          <button onClick={() => setConfirmDeleteMdId(null)} className="text-xs text-gray-400">{tc('cancel')}</button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmDeleteMdId(m.id)} className="text-gray-400 hover:text-red-500 dark:hover:text-red-400">
                          <Trash2 size={15} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
