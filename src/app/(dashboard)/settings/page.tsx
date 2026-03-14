'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { Sun, Moon, Check } from 'lucide-react'

const GEMINI_MODELS = [
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash（推薦）' },
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
]

const ROLE_LABEL: Record<string, string> = {
  super_admin: 'Super Admin',
  member: 'Member',
}

export default function SettingsPage() {
  const supabase = createBrowserSupabaseClient()
  const { theme, setTheme } = useTheme()

  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState('')
  const [telegramId, setTelegramId] = useState('')
  const [geminiModel, setGeminiModel] = useState('gemini-2.5-flash')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email) return
      setEmail(user.email)

      const { data } = await supabase
        .from('users')
        .select('display_name, role, telegram_id, gemini_model, theme')
        .eq('email', user.email)
        .single()

      if (data) {
        setDisplayName(data.display_name ?? '')
        setRole(data.role ?? 'member')
        setTelegramId(data.telegram_id ? String(data.telegram_id) : '')
        setGeminiModel(data.gemini_model ?? 'gemini-2.5-flash')
        if (data.theme) setTheme(data.theme)
      }
      setLoading(false)
    }
    load()
  }, [])

  async function handleSave() {
    setError(null); setSaved(false)

    const parsed = telegramId.trim() ? Number(telegramId.trim()) : null
    if (telegramId.trim() && (isNaN(parsed!) || !Number.isInteger(parsed))) {
      setError('Telegram ID 必須為數字'); return
    }

    setSaving(true)
    const { error: err } = await supabase
      .from('users')
      .update({ telegram_id: parsed, gemini_model: geminiModel, theme: theme ?? 'light' })
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
            className="w-full text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
            在 Telegram 傳訊給 <span className="font-medium text-gray-600 dark:text-gray-400">@userinfobot</span> 取得數字 ID，綁定後即可使用 Bot 掃描名片。
          </p>
        </div>

        {/* Gemini Model */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Gemini OCR 模型
          </label>
          <select
            value={geminiModel}
            onChange={(e) => setGeminiModel(e.target.value)}
            className="w-full text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {GEMINI_MODELS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
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
                theme === 'light'
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                  : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <Sun size={15} /> 淺色
              {theme === 'light' && <Check size={13} />}
            </button>
            <button
              type="button"
              onClick={() => setTheme('dark')}
              className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg border transition-colors ${
                theme === 'dark'
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                  : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <Moon size={15} /> 深色
              {theme === 'dark' && <Check size={13} />}
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
