'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'

interface CrmUser {
  id: string
  email: string
  display_name: string | null
  telegram_id: number | null
  role: string
  last_login_at: string | null
  created_at: string
}

export default function AdminUsersPage() {
  const router = useRouter()
  const supabase = createBrowserSupabaseClient()

  const [users, setUsers] = useState<CrmUser[]>([])
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      // Guard: only admin can access
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email) { router.push('/'); return }

      const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('email', user.email)
        .single()

      if (profile?.role !== 'admin') { router.push('/'); return }

      const { data } = await supabase
        .from('users')
        .select('id, email, display_name, telegram_id, role, last_login_at, created_at')
        .order('created_at', { ascending: true })

      setUsers(data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  async function toggleRole(u: CrmUser) {
    const newRole = u.role === 'admin' ? 'member' : 'admin'
    setUpdatingId(u.id)
    const { error } = await supabase
      .from('users')
      .update({ role: newRole })
      .eq('id', u.id)

    if (!error) {
      setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, role: newRole } : x))
    }
    setUpdatingId(null)
  }

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">使用者管理</h1>
      <p className="text-sm text-gray-500 mb-6">使用者需自行以 Microsoft 帳號登入，登入後自動建立。</p>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['姓名', 'Email', 'Telegram', '角色', '最後登入', '操作'].map((h) => (
                <th key={h} className="px-4 py-3 text-left font-medium text-gray-600">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">載入中...</td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">尚無使用者</td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-900 font-medium">{u.display_name || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{u.email}</td>
                  <td className="px-4 py-3">
                    {u.telegram_id ? (
                      <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full">
                        已綁定
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-400 rounded-full">
                        未綁定
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {u.role === 'admin' ? (
                      <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">
                        admin
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-500 rounded-full">
                        member
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {u.last_login_at
                      ? new Date(u.last_login_at).toLocaleDateString('zh-TW')
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleRole(u)}
                      disabled={updatingId === u.id}
                      className="px-3 py-1 text-xs border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-40 transition-colors"
                    >
                      {updatingId === u.id
                        ? '更新中...'
                        : u.role === 'admin'
                        ? '降為 member'
                        : '升為 admin'}
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
