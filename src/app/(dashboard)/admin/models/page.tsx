'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { Plus, Trash2, Loader2, X, ToggleLeft, ToggleRight, Eye, EyeOff, ChevronRight, FlaskConical, Pencil } from 'lucide-react'
import type { AiFeature } from '@/lib/aiRouting'

type EndpointKind = 'openai' | 'google'

interface Endpoint {
  id: string
  name: string
  base_url: string
  api_key: string
  kind: EndpointKind
  is_active: boolean
  last_tested_at: string | null
  last_test_ok: boolean | null
  created_at: string
  model_count?: number
}

interface AiModel {
  id: string
  endpoint_id: string
  model_id: string
  display_name: string
  is_active: boolean
  last_tested_at: string | null
  last_test_ok: boolean | null
  created_at: string
}

// 功能指派下拉用的 active 模型（模型 + 端點皆 active）。
interface FeatureModel {
  id: string
  display_name: string
  model_id: string
  last_tested_at: string | null
  last_test_ok: boolean | null
  endpoint_name: string
  endpoint_kind: EndpointKind
}

// 來源：src/lib/aiRouting.ts 的 AI_FEATURES（client 端複製，避免把 server 依賴打包進 bundle）。
// 順序即頁面顯示順序。
const FEATURE_LIST: { key: AiFeature; googleOnly: boolean }[] = [
  { key: 'assistant', googleOnly: true },
  { key: 'briefing', googleOnly: true },
  { key: 'note_format', googleOnly: false },
  { key: 'feedback_triage', googleOnly: false },
  { key: 'ai_review', googleOnly: false },
  { key: 'newsletter_refine', googleOnly: false },
  { key: 'newsletter_translate', googleOnly: false },
  { key: 'card_ocr_default', googleOnly: false },
]

interface TestResult {
  ok: boolean
  latencyMs: number
  error?: string
}

export default function AdminModelsPage() {
  const supabase = createBrowserSupabaseClient()
  const router = useRouter()
  const t = useTranslations('models')
  const tc = useTranslations('common')
  const locale = useLocale()

  const [loading, setLoading] = useState(true)
  const [endpoints, setEndpoints] = useState<Endpoint[]>([])
  const [selectedEndpoint, setSelectedEndpoint] = useState<Endpoint | null>(null)
  const [models, setModels] = useState<AiModel[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)

  // Endpoint form
  const [showEndpointForm, setShowEndpointForm] = useState(false)
  const [epForm, setEpForm] = useState<{ name: string; base_url: string; api_key: string; kind: EndpointKind }>({ name: '', base_url: '', api_key: '', kind: 'openai' })
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
  const [editingNameId, setEditingNameId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newApiKey, setNewApiKey] = useState('')

  // Testing (keyed: ep:<id> / md:<id> / feat:<feature>)
  const [testing, setTesting] = useState<Record<string, boolean>>({})
  const [testResult, setTestResult] = useState<Record<string, TestResult>>({})

  // Feature assignment
  const [featureAssignments, setFeatureAssignments] = useState<{ [k in AiFeature]?: string | null }>({})
  const [featureModels, setFeatureModels] = useState<FeatureModel[]>([])
  const [featSaving, setFeatSaving] = useState<Record<string, boolean>>({})
  const [featError, setFeatError] = useState<Record<string, string>>({})

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: profile } = await supabase.from('users').select('role').eq('email', user.email!).single()
      if (profile?.role !== 'super_admin') { router.push('/'); return }
      await Promise.all([fetchEndpoints(), fetchFeatureData()])
    }
    init()
  }, [])

  async function fetchEndpoints() {
    setLoading(true)
    const { data } = await supabase
      .from('ai_endpoints')
      .select('id, name, base_url, api_key, kind, is_active, last_tested_at, last_test_ok, created_at')
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
    setEndpoints(data.map((ep) => ({ ...ep, model_count: countMap[ep.id] ?? 0 })) as Endpoint[])
    setLoading(false)
  }

  async function fetchModels(endpointId: string) {
    setModelsLoading(true)
    const { data } = await supabase
      .from('ai_models')
      .select('id, endpoint_id, model_id, display_name, is_active, last_tested_at, last_test_ok, created_at')
      .eq('endpoint_id', endpointId)
      .order('created_at', { ascending: true })
    setModels((data ?? []) as AiModel[])
    setModelsLoading(false)
  }

  async function fetchFeatureData() {
    // RLS 限定成員只讀到自己 org 的指派列。
    const { data: assigns } = await supabase.from('ai_feature_models').select('feature, ai_model_id')
    const map: { [k in AiFeature]?: string | null } = {}
    ;(assigns ?? []).forEach((r) => { map[r.feature as AiFeature] = r.ai_model_id })
    setFeatureAssignments(map)

    const { data: mds } = await supabase
      .from('ai_models')
      .select('id, display_name, model_id, is_active, last_tested_at, last_test_ok, ai_endpoints(name, kind, is_active)')
      .eq('is_active', true)
    const list: FeatureModel[] = []
    for (const m of mds ?? []) {
      const raw = (m as { ai_endpoints: unknown }).ai_endpoints
      const ep = (Array.isArray(raw) ? raw[0] : raw) as { name?: string; kind?: EndpointKind; is_active?: boolean } | null
      if (!ep?.is_active) continue // 端點停用 → 不可指派
      list.push({
        id: m.id,
        display_name: m.display_name,
        model_id: m.model_id,
        last_tested_at: m.last_tested_at,
        last_test_ok: m.last_test_ok,
        endpoint_name: ep.name ?? '',
        endpoint_kind: ep.kind ?? 'openai',
      })
    }
    setFeatureModels(list)
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
    if (!epForm.name.trim() || !epForm.base_url.trim()) {
      setEpError(t('fillAllFields')); return
    }
    setEpSaving(true)
    const { error } = await supabase.from('ai_endpoints').insert({
      name: epForm.name.trim(),
      base_url: epForm.base_url.trim(),
      api_key: epForm.api_key.trim() || 'placeholder',
      kind: epForm.kind,
    })
    setEpSaving(false)
    if (error) { setEpError(error.message); return }
    setEpForm({ name: '', base_url: '', api_key: '', kind: 'openai' })
    setShowEndpointForm(false)
    fetchEndpoints()
  }

  async function toggleEndpoint(ep: Endpoint) {
    await supabase.from('ai_endpoints').update({ is_active: !ep.is_active }).eq('id', ep.id)
    setEndpoints((prev) => prev.map((e) => e.id === ep.id ? { ...e, is_active: !e.is_active } : e))
    if (selectedEndpoint?.id === ep.id) setSelectedEndpoint((p) => p ? { ...p, is_active: !p.is_active } : p)
  }

  async function changeEndpointKind(ep: Endpoint, kind: EndpointKind) {
    await supabase.from('ai_endpoints').update({ kind }).eq('id', ep.id)
    setEndpoints((prev) => prev.map((e) => e.id === ep.id ? { ...e, kind } : e))
    if (selectedEndpoint?.id === ep.id) setSelectedEndpoint((p) => p ? { ...p, kind } : p)
    // 端點型態改變會影響 googleOnly 功能的可選模型，重新載入指派資料。
    fetchFeatureData()
  }

  async function deleteEndpoint(id: string) {
    await supabase.from('ai_endpoints').delete().eq('id', id)
    setEndpoints((prev) => prev.filter((e) => e.id !== id))
    if (selectedEndpoint?.id === id) { setSelectedEndpoint(null); setModels([]) }
    setConfirmDeleteEpId(null)
    fetchFeatureData()
  }

  async function saveEndpointName(id: string) {
    const name = newName.trim()
    if (!name) return
    await supabase.from('ai_endpoints').update({ name }).eq('id', id)
    setEndpoints((prev) => prev.map((e) => e.id === id ? { ...e, name } : e))
    if (selectedEndpoint?.id === id) setSelectedEndpoint((p) => p ? { ...p, name } : p)
    setEditingNameId(null)
    setNewName('')
    // 功能指派下拉的「端點 / 模型」標籤引用端點名稱，重撈保持一致
    fetchFeatureData()
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
    fetchFeatureData()
  }

  async function toggleModel(m: AiModel) {
    await supabase.from('ai_models').update({ is_active: !m.is_active }).eq('id', m.id)
    setModels((prev) => prev.map((x) => x.id === m.id ? { ...x, is_active: !x.is_active } : x))
    fetchFeatureData()
  }

  async function deleteModel(id: string) {
    await supabase.from('ai_models').delete().eq('id', id)
    setModels((prev) => prev.filter((m) => m.id !== id))
    setConfirmDeleteMdId(null)
    if (selectedEndpoint) fetchEndpoints()
    fetchFeatureData()
  }

  // ── Test ─────────────────────────────────────────────────────────────────

  async function runTest(
    key: string,
    body: { endpointId: string } | { modelId: string } | { feature: AiFeature },
    persistTo?: { endpointId?: string; modelId?: string },
  ) {
    setTesting((s) => ({ ...s, [key]: true }))
    setTestResult((r) => { const n = { ...r }; delete n[key]; return n })
    try {
      const res = await fetch('/api/ai-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.status === 401) { router.push('/login'); return }
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setTestResult((r) => ({ ...r, [key]: { ok: false, latencyMs: 0, error: json.error || t('testFailed') } }))
        return
      }
      setTestResult((r) => ({ ...r, [key]: { ok: json.ok, latencyMs: json.latencyMs ?? 0, error: json.error } }))
      // 持久化的測試 → 同步本地 last_tested 狀態（重整後亦由 DB 反映）。
      if (json.persisted && json.testedAt) {
        if (persistTo?.endpointId) {
          setEndpoints((prev) => prev.map((e) => e.id === persistTo.endpointId ? { ...e, last_tested_at: json.testedAt, last_test_ok: json.ok } : e))
        }
        if (persistTo?.modelId) {
          setModels((prev) => prev.map((m) => m.id === persistTo.modelId ? { ...m, last_tested_at: json.testedAt, last_test_ok: json.ok } : m))
          setFeatureModels((prev) => prev.map((m) => m.id === persistTo.modelId ? { ...m, last_tested_at: json.testedAt, last_test_ok: json.ok } : m))
        }
      }
    } catch {
      setTestResult((r) => ({ ...r, [key]: { ok: false, latencyMs: 0, error: t('testFailed') } }))
    } finally {
      setTesting((s) => ({ ...s, [key]: false }))
    }
  }

  // ── Feature assignment ─────────────────────────────────────────────────────

  async function assignFeature(feature: AiFeature, aiModelId: string | null) {
    setFeatSaving((s) => ({ ...s, [feature]: true }))
    setFeatError((e) => { const n = { ...e }; delete n[feature]; return n })
    try {
      const res = await fetch('/api/ai-feature-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feature, aiModelId }),
      })
      if (res.status === 401) { router.push('/login'); return }
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setFeatError((e) => ({ ...e, [feature]: json.error || t('saveFailed') }))
        return
      }
      setFeatureAssignments((a) => ({ ...a, [feature]: aiModelId }))
    } catch {
      setFeatError((e) => ({ ...e, [feature]: t('saveFailed') }))
    } finally {
      setFeatSaving((s) => ({ ...s, [feature]: false }))
    }
  }

  function maskKey(key: string) {
    if (key === 'placeholder' || key.length <= 8) return '••••••••'
    return key.slice(0, 4) + '••••' + key.slice(-4)
  }

  // 常駐「上次測試」小字。
  function lastTested(at: string | null, ok: boolean | null) {
    if (!at) return <span className="text-xs text-gray-400">{t('neverTested')}</span>
    return (
      <span className="text-xs text-gray-500 dark:text-gray-400">
        {t('lastTested')}：{new Date(at).toLocaleString(locale)} {ok ? '✅' : '❌'}
      </span>
    )
  }

  // Inline 測試結果（不用 toast）。
  function testResultInline(key: string) {
    const r = testResult[key]
    if (!r) return null
    if (r.ok) {
      return (
        <span className="text-xs text-green-600 dark:text-green-400 whitespace-normal break-words">
          ✅ {t('testOk')}（{(r.latencyMs / 1000).toFixed(1)}s）
        </span>
      )
    }
    return (
      <span className="text-xs text-red-600 dark:text-red-400 whitespace-normal break-words max-w-[240px]">
        ❌ {r.error}
      </span>
    )
  }

  function TestButton({ testKey, onClick }: { testKey: string; onClick: () => void }) {
    const busy = !!testing[testKey]
    return (
      <button
        onClick={onClick}
        disabled={busy}
        className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-40 disabled:no-underline"
      >
        {busy ? <Loader2 size={12} className="animate-spin" /> : <FlaskConical size={12} />}
        {busy ? t('testing') : t('testBtn')}
      </button>
    )
  }

  const inputCls = 'w-full text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500'

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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('colName')}</label>
                <input type="text" value={epForm.name} onChange={(e) => setEpForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder={t('endpointPlaceholder')} className={`${inputCls} text-base sm:text-sm`} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('colKind')}</label>
                <select value={epForm.kind} onChange={(e) => setEpForm((f) => ({ ...f, kind: e.target.value as EndpointKind }))}
                  className={`${inputCls} text-base sm:text-sm`}>
                  <option value="openai">{t('kindOpenai')}</option>
                  <option value="google">{t('kindGoogle')}</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Base URL</label>
                <input type="text" value={epForm.base_url} onChange={(e) => setEpForm((f) => ({ ...f, base_url: e.target.value }))}
                  placeholder="https://..." className={`${inputCls} text-base sm:text-sm`} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">API Key</label>
                <input type="password" value={epForm.api_key} onChange={(e) => setEpForm((f) => ({ ...f, api_key: e.target.value }))}
                  placeholder={t('apiKeyOptional')} className={`${inputCls} text-base sm:text-sm`} />
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{t('apiKeyOptionalHint')}</p>
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  {[t('colName'), t('colKind'), 'Base URL', 'API Key', 'Models', t('colStatus'), t('colTest'), ''].map((h, i) => (
                    <th key={i} className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} className="px-4 py-6 text-center text-gray-400">{tc('loading')}</td></tr>
                ) : endpoints.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-6 text-center text-gray-400">{t('noEndpoints')}</td></tr>
                ) : endpoints.map((ep) => (
                  <tr key={ep.id}
                    onClick={() => selectEndpoint(ep)}
                    className={`border-t border-gray-100 dark:border-gray-800 cursor-pointer transition-colors ${selectedEndpoint?.id === ep.id ? 'bg-blue-50 dark:bg-blue-950/30' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}>
                    <td className="px-4 py-3 font-medium text-gray-800 dark:text-gray-200 whitespace-nowrap">
                      {editingNameId === ep.id ? (
                        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                          <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') saveEndpointName(ep.id) }}
                            placeholder={t('colName')} autoFocus
                            className="text-xs px-2 py-1 border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-32 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                          <button onClick={() => saveEndpointName(ep.id)} className="text-xs text-blue-600 hover:underline">{tc('save')}</button>
                          <button onClick={() => { setEditingNameId(null); setNewName('') }} className="text-xs text-gray-400">{tc('cancel')}</button>
                        </div>
                      ) : (
                        <span className="flex items-center gap-1">
                          {selectedEndpoint?.id === ep.id && <ChevronRight size={14} className="text-blue-500 shrink-0" />}
                          {ep.name}
                          <button onClick={(e) => { e.stopPropagation(); setEditingNameId(ep.id); setNewName(ep.name) }}
                            title={t('editName')} aria-label={t('editName')}
                            className="text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 ml-1">
                            <Pencil size={12} />
                          </button>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <select value={ep.kind} onChange={(e) => changeEndpointKind(ep, e.target.value as EndpointKind)}
                        className="text-sm px-2 py-1 border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500">
                        <option value="openai">{t('kindOpenai')}</option>
                        <option value="google">{t('kindGoogle')}</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 font-mono max-w-[180px] truncate">{ep.base_url}</td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      {editingKeyId === ep.id ? (
                        <div className="flex gap-1">
                          <input type="password" value={newApiKey} onChange={(e) => setNewApiKey(e.target.value)}
                            placeholder={t('newApiKey')}
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
                    <td className="px-4 py-3 align-top" onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-col gap-1 min-w-[140px]">
                        <div className="flex items-center gap-2 flex-wrap">
                          <TestButton testKey={`ep:${ep.id}`} onClick={() => runTest(`ep:${ep.id}`, { endpointId: ep.id }, { endpointId: ep.id })} />
                          {testResultInline(`ep:${ep.id}`)}
                        </div>
                        {lastTested(ep.last_tested_at, ep.last_test_ok)}
                      </div>
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
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Model ID</label>
                  <input type="text" value={mdForm.model_id} onChange={(e) => setMdForm((f) => ({ ...f, model_id: e.target.value }))}
                    placeholder={t('modelIdPlaceholder')} className={`${inputCls} text-base sm:text-sm`} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('colDisplayName')}</label>
                  <input type="text" value={mdForm.display_name} onChange={(e) => setMdForm((f) => ({ ...f, display_name: e.target.value }))}
                    placeholder={t('modelNamePlaceholder')} className={`${inputCls} text-base sm:text-sm`} />
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
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    {[t('colDisplayName'), 'Model ID', t('colStatus'), t('colTest'), t('colCreated'), ''].map((h, i) => (
                      <th key={i} className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {modelsLoading ? (
                    <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">{tc('loading')}</td></tr>
                  ) : models.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">{t('noModels')}</td></tr>
                  ) : models.map((m) => (
                    <tr key={m.id} className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-4 py-3 font-medium text-gray-800 dark:text-gray-200 whitespace-nowrap">{m.display_name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">{m.model_id}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => toggleModel(m)}
                          className={`flex items-center gap-1 text-xs font-medium ${m.is_active ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`}>
                          {m.is_active ? <><ToggleRight size={15} /> {t('enabled')}</> : <><ToggleLeft size={15} /> {t('disabled')}</>}
                        </button>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex flex-col gap-1 min-w-[140px]">
                          <div className="flex items-center gap-2 flex-wrap">
                            <TestButton testKey={`md:${m.id}`} onClick={() => runTest(`md:${m.id}`, { modelId: m.id }, { modelId: m.id })} />
                            {testResultInline(`md:${m.id}`)}
                          </div>
                          {lastTested(m.last_tested_at, m.last_test_ok)}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs whitespace-nowrap">
                        {new Date(m.created_at).toLocaleDateString(locale)}
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
        </div>
      )}

      {/* ── Feature assignment ── */}
      <div>
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-3">{t('featureAssignTitle')}</h2>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {FEATURE_LIST.map(({ key, googleOnly }) => {
            const assignedId = featureAssignments[key] ?? null
            const assignedModel = assignedId ? featureModels.find((m) => m.id === assignedId) ?? null : null
            const options = featureModels.filter((m) => !googleOnly || m.endpoint_kind === 'google')
            const testKey = `feat:${key}`
            return (
              <div key={key} className="border-t first:border-t-0 border-gray-100 dark:border-gray-800 p-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 sm:flex-1">
                  <div className="text-sm font-medium text-gray-800 dark:text-gray-200">{t(`features.${key}.name`)}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t(`features.${key}.desc`)}</div>
                </div>
                <div className="flex flex-col gap-1.5 sm:items-end sm:shrink-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <select
                      value={assignedId ?? ''}
                      disabled={!!featSaving[key]}
                      onChange={(e) => assignFeature(key, e.target.value || null)}
                      className="w-full sm:w-64 text-base sm:text-sm px-3 py-2.5 sm:py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                    >
                      <option value="">{t('systemDefault')}</option>
                      {options.map((m) => (
                        <option key={m.id} value={m.id}>{m.endpoint_name} / {m.display_name}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => runTest(testKey, { feature: key }, assignedId ? { modelId: assignedId } : undefined)}
                      disabled={!!testing[testKey]}
                      className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 py-2.5 text-sm font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40"
                    >
                      {testing[testKey] ? <Loader2 size={14} className="animate-spin" /> : <FlaskConical size={14} />}
                      {testing[testKey] ? t('testing') : t('testBtn')}
                    </button>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap sm:justify-end">
                    {testResultInline(testKey)}
                    {assignedId
                      ? lastTested(assignedModel?.last_tested_at ?? null, assignedModel?.last_test_ok ?? null)
                      : <span className="text-xs text-gray-400">{t('systemDefault')}</span>}
                  </div>
                  {featError[key] && <span className="text-xs text-red-600 dark:text-red-400 break-words max-w-[240px]">{featError[key]}</span>}
                </div>
              </div>
            )
          })}
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">{t('selfHostedHint')}</p>
      </div>
    </div>
  )
}
