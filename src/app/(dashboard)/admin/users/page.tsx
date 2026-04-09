'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { ALL_FEATURE_KEYS, FEATURE_LABELS } from '@/lib/features'

interface CrmUser {
  id: string
  email: string
  display_name: string | null
  telegram_id: number | null
  teams_user_id: string | null
  role: string
  last_login_at: string | null
  created_at: string
  granted_features: string[]
}

export default function AdminUsersPage() {
  const router = useRouter()
  const t = useTranslations('users')
  const tc = useTranslations('common')
  const supabase = createBrowserSupabaseClient()

  const [users, setUsers] = useState<CrmUser[]>([])
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [resetMfaId, setResetMfaId] = useState<string | null>(null)
  const [mfaStatus, setMfaStatus] = useState<Record<string, boolean>>({})

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email) { router.push('/'); return }

      const { data: profile } = await supabase
        .from('users')
        .select('id, role')
        .eq('email', user.email)
        .single()

      if (profile?.role !== 'super_admin') { router.push('/'); return }
      setCurrentUserId(profile.id)

      const { data } = await supabase
        .from('users')
        .select('id, email, display_name, telegram_id, teams_user_id, role, last_login_at, created_at, granted_features')
        .order('created_at', { ascending: true })

      setUsers(data ?? [])
      setLoading(false)

      // Load MFA status
      const mfaRes = await fetch('/api/admin/mfa-status')
      if (mfaRes.ok) {
        const { status } = await mfaRes.json()
        setMfaStatus(status ?? {})
      }
    }
    load()
  }, [])

  async function toggleRole(u: CrmUser) {
    const newRole = u.role === 'super_admin' ? 'member' : 'super_admin'
    setUpdatingId(u.id)
    const { error } = await supabase.from('users').update({ role: newRole }).eq('id', u.id)
    if (!error) {
      setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, role: newRole } : x))
    }
    setUpdatingId(null)
  }

  async function resetMfa(u: CrmUser) {
    if (!confirm(`確定要重設「${u.display_name || u.email}」的 MFA？該用戶下次登入時需重新設置。`)) return
    setResetMfaId(u.id)
    try {
      const res = await fetch(`/api/admin/users/${u.id}/reset-mfa`, { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        alert(`已刪除 ${data.deleted} 個 MFA 驗證器`)
        // Refresh MFA status
        const mfaRes = await fetch('/api/admin/mfa-status')
        if (mfaRes.ok) {
          const { status } = await mfaRes.json()
          setMfaStatus(status ?? {})
        }
      } else {
        alert(`重設失敗：${data.error}`)
      }
    } catch {
      alert('重設失敗，請稍後再試')
    } finally {
      setResetMfaId(null)
    }
  }

  async function toggleFeature(u: CrmUser, feature: string) {
    const current = u.granted_features ?? []
    const next = current.includes(feature)
      ? current.filter((f) => f !== feature)
      : [...current, feature]
    setUpdatingId(u.id)
    const { error } = await supabase.from('users').update({ granted_features: next }).eq('id', u.id)
    if (!error) {
      setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, granted_features: next } : x))
    }
    setUpdatingId(null)
  }

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">{t('title')}</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{t('subtitle')}</p>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <tr>
              {[t('colName'), t('colEmail'), t('colTelegram'), t('colTeams'), t('colRole'), t('colLastLogin'), 'MFA', t('colActions')].map((h) => (
                <th key={h} className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400">{tc('loading')}</td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400">{t('noUsers')}</td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3 text-gray-900 dark:text-gray-100 font-medium">{u.display_name || '—'}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{u.email}</td>
                  <td className="px-4 py-3">
                    {u.telegram_id ? (
                      <span className="px-2 py-0.5 text-xs bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400 rounded-full">{t('telegramBound')}</span>
                    ) : (
                      <span className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-400 rounded-full">{t('telegramUnbound')}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {u.teams_user_id ? (
                      <span className="px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-400 rounded-full">{t('teamsBound')}</span>
                    ) : (
                      <span className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-400 rounded-full">{t('teamsUnbound')}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {u.role === 'super_admin' ? (
                      <span className="px-2 py-0.5 text-xs bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-400 rounded-full">super_admin</span>
                    ) : (
                      <span className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded-full">member</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                    {u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1.5 items-start">
                      {mfaStatus[u.email] ? (
                        <span className="px-2 py-0.5 text-xs bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400 rounded-full">已設定</span>
                      ) : (
                        <span className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-400 rounded-full">未設定</span>
                      )}
                      {mfaStatus[u.email] && (
                        <button
                          onClick={() => resetMfa(u)}
                          disabled={resetMfaId === u.id}
                          className="px-2 py-0.5 text-xs border border-orange-200 dark:border-orange-800 rounded-lg text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/30 disabled:opacity-40 transition-colors"
                        >
                          {resetMfaId === u.id ? '重設中...' : '重設'}
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => toggleRole(u)}
                        disabled={updatingId === u.id || u.id === currentUserId}
                        title={u.id === currentUserId ? t('selfRoleHint') : undefined}
                        className="px-3 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 transition-colors"
                      >
                        {updatingId === u.id
                          ? t('updating')
                          : u.role === 'super_admin'
                          ? t('demoteToMember')
                          : t('promoteToAdmin')}
                      </button>
                    </div>
                    {u.role !== 'super_admin' && (
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {ALL_FEATURE_KEYS.map((key) => {
                          const granted = (u.granted_features ?? []).includes(key)
                          return (
                            <button
                              key={key}
                              onClick={() => toggleFeature(u, key)}
                              disabled={updatingId === u.id}
                              className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${
                                granted
                                  ? 'bg-blue-100 dark:bg-blue-950 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300'
                                  : 'border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:border-gray-400'
                              }`}
                            >
                              {granted ? '✓ ' : ''}{FEATURE_LABELS[key]}
                            </button>
                          )
                        })}
                      </div>
                    )}
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
