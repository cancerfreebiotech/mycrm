'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Trash2 } from 'lucide-react'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface AuthUser {
  id: string
  telegram_id: number
  name: string | null
  is_admin: boolean
  created_at: string
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AuthUser[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ telegram_id: '', name: '', is_admin: false })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchUsers()
  }, [])

  async function fetchUsers() {
    const { data } = await supabase
      .from('authorized_users')
      .select('*')
      .order('created_at', { ascending: false })
    setUsers(data ?? [])
    setLoading(false)
  }

  async function addUser() {
    setError('')
    const tid = parseInt(form.telegram_id)
    if (!tid || isNaN(tid)) {
      setError('請輸入有效的 Telegram ID（數字）')
      return
    }
    setSubmitting(true)
    const { data, error: err } = await supabase
      .from('authorized_users')
      .insert({ telegram_id: tid, name: form.name || null, is_admin: form.is_admin })
      .select('*')
      .single()
    if (err) {
      setError(err.message)
    } else if (data) {
      setUsers((prev) => [data, ...prev])
      setForm({ telegram_id: '', name: '', is_admin: false })
    }
    setSubmitting(false)
  }

  async function deleteUser(id: string) {
    if (!confirm('確定要刪除此使用者嗎？')) return
    await supabase.from('authorized_users').delete().eq('id', id)
    setUsers((prev) => prev.filter((u) => u.id !== id))
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">白名單管理</h1>

      {/* Add Form */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h2 className="text-base font-semibold text-gray-800 mb-4">新增授權使用者</h2>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Telegram ID *</label>
            <input
              type="number"
              value={form.telegram_id}
              onChange={(e) => setForm((f) => ({ ...f, telegram_id: e.target.value }))}
              placeholder="12345678"
              className="w-36 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">名稱</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="顯示名稱"
              className="w-40 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 pb-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_admin}
              onChange={(e) => setForm((f) => ({ ...f, is_admin: e.target.checked }))}
              className="w-4 h-4 accent-blue-600"
            />
            管理員
          </label>
          <button
            onClick={addUser}
            disabled={submitting}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors pb-2"
          >
            新增
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Telegram ID', '名稱', '管理員', '建立時間', ''].map((h) => (
                <th key={h} className="px-4 py-3 text-left font-medium text-gray-600">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">載入中...</td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">尚無授權使用者</td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-gray-700">{u.telegram_id}</td>
                  <td className="px-4 py-3 text-gray-700">{u.name || '—'}</td>
                  <td className="px-4 py-3">
                    {u.is_admin ? (
                      <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">管理員</span>
                    ) : (
                      <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-500 rounded-full">一般</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(u.created_at).toLocaleDateString('zh-TW')}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => deleteUser(u.id)}
                      className="text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
