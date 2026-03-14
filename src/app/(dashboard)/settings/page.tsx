'use client'

import { useEffect, useState } from 'react'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'

export default function SettingsPage() {
  const supabase = createBrowserSupabaseClient()

  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [telegramId, setTelegramId] = useState('')
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
        .select('display_name, telegram_id')
        .eq('email', user.email)
        .single()

      if (data) {
        setDisplayName(data.display_name ?? '')
        setTelegramId(data.telegram_id ? String(data.telegram_id) : '')
      }
      setLoading(false)
    }
    load()
  }, [])

  async function handleSave() {
    setError(null)
    setSaved(false)

    const parsed = telegramId.trim() ? Number(telegramId.trim()) : null
    if (telegramId.trim() && (isNaN(parsed!) || !Number.isInteger(parsed))) {
      setError('Telegram ID 必須為數字')
      return
    }

    setSaving(true)
    const { error: err } = await supabase
      .from('users')
      .update({ telegram_id: parsed })
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
      <h1 className="text-2xl font-bold text-gray-900 mb-6">個人設定</h1>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        {/* Account info (read-only) */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">帳號</label>
          <p className="text-sm text-gray-900">{email}</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">顯示名稱</label>
          <p className="text-sm text-gray-900">{displayName || '—'}</p>
        </div>

        <hr className="border-gray-100" />

        {/* Telegram ID */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Telegram ID
          </label>
          <input
            type="text"
            value={telegramId}
            onChange={(e) => setTelegramId(e.target.value)}
            placeholder="例：123456789"
            className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="mt-2 text-xs text-gray-400">
            請在 Telegram 傳訊給{' '}
            <span className="font-medium text-gray-600">@userinfobot</span>
            ，它會回傳你的數字 ID。綁定後即可使用 Bot 掃描名片。
          </p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {saved && <p className="text-sm text-green-600">✓ 已儲存</p>}

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
