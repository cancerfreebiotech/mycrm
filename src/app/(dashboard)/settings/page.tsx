'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { Sun, Moon, Check } from 'lucide-react'

interface AiEndpoint {
  id: string
  name: string
  is_active: boolean
}

interface AiModel {
  id: string
  endpoint_id: string
  model_id: string
  display_name: string
}

const ROLE_LABEL: Record<string, string> = {
  super_admin: 'Super Admin',
  member: 'Member',
}

export default function SettingsPage() {
  const supabase = createBrowserSupabaseClient()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState('')
  const [telegramId, setTelegramId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [endpoints, setEndpoints] = useState<AiEndpoint[]>([])
  const [allModels, setAllModels] = useState<AiModel[]>([])
  const [selectedEndpointId, setSelectedEndpointId] = useState<string>('')
  const [selectedModelId, setSelectedModelId] = useState<string>('')  // ai_models.id (UUID)

  const filteredModels = allModels.filter((m) => m.endpoint_id === selectedEndpointId)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email) return
      setEmail(user.email)

      const [{ data: userData }, { data: eps }, { data: mds }] = await Promise.all([
        supabase
          .from('users')
          .select('display_name, role, telegram_id, ai_model_id, theme')
          .eq('email', user.email)
          .single(),
        supabase
          .from('ai_endpoints')
          .select('id, name, is_active')
          .eq('is_active', true)
          .order('created_at', { ascending: true }),
        supabase
          .from('ai_models')
          .select('id, endpoint_id, model_id, display_name')
          .eq('is_active', true)
          .order('created_at', { ascending: true }),
      ])

      const epList = eps ?? []
      const mdList = mds ?? []
      setEndpoints(epList)
      setAllModels(mdList)

      if (userData) {
        setDisplayName(userData.display_name ?? '')
        setRole(userData.role ?? 'member')
        setTelegramId(userData.telegram_id ? String(userData.telegram_id) : '')
        if (userData.theme) setTheme(userData.theme)

        // Restore selected endpoint/model from saved ai_model_id
        if (userData.ai_model_id) {
          const savedModel = mdList.find((m) => m.id === userData.ai_model_id)
          if (savedModel) {
            setSelectedEndpointId(savedModel.endpoint_id)
            setSelectedModelId(savedModel.id)
          }
        } else if (epList.length > 0) {
          setSelectedEndpointId(epList[0].id)
        }
      }

      setLoading(false)
    }
    load()
  }, [])

  // When endpoint changes, reset model selection to first available
  function handleEndpointChange(epId: string) {
    setSelectedEndpointId(epId)
    const first = allModels.find((m) => m.endpoint_id === epId)
    setSelectedModelId(first?.id ?? '')
  }

  async function handleSave() {
    setError(null); setSaved(false)

    const parsed = telegramId.trim() ? Number(telegramId.trim()) : null
    if (telegramId.trim() && (isNaN(parsed!) || !Number.isInteger(parsed))) {
      setError('Telegram ID 必須為數字'); return
    }

    setSaving(true)
    const { error: err } = await supabase
      .from('users')
      .update({
        telegram_id: parsed,
        ai_model_id: selectedModelId || null,
        theme: theme ?? 'light',
      })
      .eq('email', email)

    setSaving(false)
    if (err) {
      setError(err.message)
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }
  }

  if (loading) return <div className="text-sm text-gray-400">載入中...</div>

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">個人設定</h1>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-5">

        {/* Account info (read-only) */}
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">帳號</label>
            <p className="text-sm text-gray-900 dark:text-gray-100">{email}</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">顯示名稱</label>
            <p className="text-sm text-gray-900 dark:text-gray-100">{displayName || '—'}</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">角色</label>
            <span className={`inline-block text-xs px-2.5 py-1 rounded-full font-medium ${
              role === 'super_admin'
                ? 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-400'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
            }`}>
              {ROLE_LABEL[role] ?? role}
            </span>
          </div>
        </div>

        <hr className="border-gray-100 dark:border-gray-800" />

        {/* Telegram ID */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Telegram ID
          </label>
          <input
            type="text"
            value={telegramId}
            onChange={(e) => setTelegramId(e.target.value)}
            placeholder="例：123456789"
            className="w-full text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
            在 Telegram 傳訊給 <span className="font-medium text-gray-600 dark:text-gray-400">@userinfobot</span> 取得數字 ID，綁定後即可使用 Bot 掃描名片。
          </p>
        </div>

        {/* AI Model (two-layer) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            AI OCR 模型
          </label>
          <div className="space-y-2">
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Endpoint</label>
              <select
                value={selectedEndpointId}
                onChange={(e) => handleEndpointChange(e.target.value)}
                className="w-full text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {endpoints.length === 0 && <option value="">（尚無可用 Endpoint）</option>}
                {endpoints.map((ep) => (
                  <option key={ep.id} value={ep.id}>{ep.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Model</label>
              <select
                value={selectedModelId}
                onChange={(e) => setSelectedModelId(e.target.value)}
                disabled={filteredModels.length === 0}
                className="w-full text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {filteredModels.length === 0 && <option value="">（此 Endpoint 尚無 Model）</option>}
                {filteredModels.map((m) => (
                  <option key={m.id} value={m.id}>{m.display_name}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
            此設定會影響 Bot 及網頁名片辨識所使用的 AI 模型。
          </p>
        </div>

        {/* Theme */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            介面主題
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTheme('light')}
              className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg border transition-colors ${
                mounted && theme === 'light'
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                  : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <Sun size={15} /> 淺色
              {mounted && theme === 'light' && <Check size={13} />}
            </button>
            <button
              type="button"
              onClick={() => setTheme('dark')}
              className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg border transition-colors ${
                mounted && theme === 'dark'
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                  : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <Moon size={15} /> 深色
              {mounted && theme === 'dark' && <Check size={13} />}
            </button>
          </div>
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {saved && (
          <p className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
            <Check size={14} /> 已儲存
          </p>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
        >
          {saving ? '儲存中...' : '儲存'}
        </button>
      </div>
    </div>
  )
}
