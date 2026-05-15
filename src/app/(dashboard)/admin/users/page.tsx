'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ChevronUp, ChevronDown, ChevronsUpDown, Loader2, Wrench } from 'lucide-react'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { ALL_FEATURE_KEYS, FEATURE_LABELS } from '@/lib/features'

type SortKey = 'name' | 'email' | 'telegram' | 'teams' | 'role' | 'last_login' | 'mfa'
type SortDir = 'asc' | 'desc'

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
  const tm = useTranslations('maintenance')
  const supabase = createBrowserSupabaseClient()

  const [users, setUsers] = useState<CrmUser[]>([])
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [resetMfaId, setResetMfaId] = useState<string | null>(null)
  const [mfaStatus, setMfaStatus] = useState<Record<string, boolean>>({})
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  // Maintenance mode
  const [maintenanceEnabled, setMaintenanceEnabled] = useState<boolean | null>(null)
  const [maintenanceSaving, setMaintenanceSaving] = useState(false)

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sortedUsers = useMemo(() => {
    const arr = [...users]
    const dir = sortDir === 'asc' ? 1 : -1
    arr.sort((a, b) => {
      let av: string | number, bv: string | number
      switch (sortKey) {
        case 'name':
          av = (a.display_name || a.email || '').toLowerCase()
          bv = (b.display_name || b.email || '').toLowerCase()
          break
        case 'email':
          av = (a.email || '').toLowerCase()
          bv = (b.email || '').toLowerCase()
          break
        case 'telegram':
          av = a.telegram_id ? 1 : 0
          bv = b.telegram_id ? 1 : 0
          break
        case 'teams':
          av = a.teams_user_id ? 1 : 0
          bv = b.teams_user_id ? 1 : 0
          break
        case 'role':
          av = a.role === 'super_admin' ? 1 : 0
          bv = b.role === 'super_admin' ? 1 : 0
          break
        case 'last_login':
          av = a.last_login_at ? new Date(a.last_login_at).getTime() : 0
          bv = b.last_login_at ? new Date(b.last_login_at).getTime() : 0
          break
        case 'mfa':
          av = mfaStatus[a.email] ? 1 : 0
          bv = mfaStatus[b.email] ? 1 : 0
          break
      }
      if (av < bv) return -1 * dir
      if (av > bv) return 1 * dir
      return 0
    })
    return arr
  }, [users, sortKey, sortDir, mfaStatus])

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <ChevronsUpDown size={12} className="text-gray-300 dark:text-gray-600" />
    return sortDir === 'asc'
      ? <ChevronUp size={12} className="text-gray-700 dark:text-gray-300" />
      : <ChevronDown size={12} className="text-gray-700 dark:text-gray-300" />
  }

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

      // Parallel: MFA status + maintenance status
      const [mfaRes, mRes] = await Promise.all([
        fetch('/api/admin/mfa-status'),
        fetch('/api/admin/maintenance'),
      ])
      if (mfaRes.ok) {
        const { status } = await mfaRes.json()
        setMfaStatus(status ?? {})
      }
      if (mRes.ok) {
        const { enabled } = await mRes.json()
        setMaintenanceEnabled(!!enabled)
      }
    }
    load()
  }, [])

  async function toggleMaintenance() {
    if (maintenanceEnabled === null) return
    const next = !maintenanceEnabled
    if (next && !confirm(tm('confirmEnable'))) return
    setMaintenanceSaving(true)
    try {
      const res = await fetch('/api/admin/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      })
      if (res.ok) {
        setMaintenanceEnabled(next)
      } else {
        const data = await res.json()
        alert(data.error ?? tm('toggleFailed'))
      }
    } catch {
      alert(tm('toggleFailed'))
    } finally {
      setMaintenanceSaving(false)
    }
  }

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
    if (!confirm(t('confirmResetMfa', { name: u.display_name || u.email }))) return
    setResetMfaId(u.id)
    try {
      const res = await fetch(`/api/admin/users/${u.id}/reset-mfa`, { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        alert(t('mfaDeleted', { count: data.deleted }))
        const mfaRes = await fetch('/api/admin/mfa-status')
        if (mfaRes.ok) {
          const { status } = await mfaRes.json()
          setMfaStatus(status ?? {})
        }
      } else {
        alert(t('resetFailedWithError', { error: data.error }))
      }
    } catch {
      alert(t('resetFailed'))
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

  function RoleBadge({ role }: { role: string }) {
    return role === 'super_admin' ? (
      <span className="px-2 py-0.5 text-xs bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-400 rounded-full">super_admin</span>
    ) : (
      <span className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded-full">member</span>
    )
  }

  function StatusPill({ active, on, off }: { active: boolean; on: string; off: string }) {
    return active ? (
      <span className="px-2 py-0.5 text-xs bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400 rounded-full">{on}</span>
    ) : (
      <span className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-400 rounded-full">{off}</span>
    )
  }

  function ActionButtons({ u }: { u: CrmUser }) {
    return (
      <>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => toggleRole(u)}
            disabled={updatingId === u.id || u.id === currentUserId}
            title={u.id === currentUserId ? t('selfRoleHint') : undefined}
            className="min-h-[36px] px-3 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 transition-colors"
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
                  className={`min-h-[32px] px-2.5 py-1 text-xs rounded-full border transition-colors ${
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
      </>
    )
  }

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">{t('title')}</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{t('subtitle')}</p>

      {/* Maintenance Mode toggle */}
      <div className={`rounded-xl border mb-6 p-4 sm:p-5 ${
        maintenanceEnabled
          ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800'
          : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700'
      }`}>
        <div className="flex items-start sm:items-center gap-3 flex-col sm:flex-row sm:justify-between">
          <div className="flex items-start gap-3">
            <Wrench size={20} className={maintenanceEnabled ? 'text-amber-600 dark:text-amber-400 shrink-0 mt-0.5' : 'text-gray-400 shrink-0 mt-0.5'} />
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{tm('toggleTitle')}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {maintenanceEnabled ? tm('toggleStatusOn') : tm('toggleStatusOff')}
              </p>
            </div>
          </div>
          <button
            onClick={toggleMaintenance}
            disabled={maintenanceEnabled === null || maintenanceSaving}
            className={`min-h-[44px] w-full sm:w-auto px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 ${
              maintenanceEnabled
                ? 'bg-amber-600 hover:bg-amber-700 text-white'
                : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200'
            }`}
          >
            {maintenanceSaving ? (
              <span className="flex items-center gap-2 justify-center">
                <Loader2 size={14} className="animate-spin" /> {tc('loading')}
              </span>
            ) : maintenanceEnabled === null ? (
              tc('loading')
            ) : maintenanceEnabled ? (
              tm('toggleDisable')
            ) : (
              tm('toggleEnable')
            )}
          </button>
        </div>
      </div>

      {/* Mobile: card list */}
      <div className="sm:hidden space-y-3">
        {loading ? (
          <p className="text-center text-gray-400 py-8">{tc('loading')}</p>
        ) : sortedUsers.length === 0 ? (
          <p className="text-center text-gray-400 py-8">{t('noUsers')}</p>
        ) : (
          sortedUsers.map((u) => (
            <div key={u.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{u.display_name || '—'}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{u.email}</p>
                </div>
                <RoleBadge role={u.role} />
              </div>
              <div className="flex flex-wrap gap-1.5 mb-3">
                <StatusPill active={!!u.telegram_id} on={`TG ${t('telegramBound')}`} off={`TG ${t('telegramUnbound')}`} />
                <StatusPill active={!!u.teams_user_id} on={`Teams ${t('teamsBound')}`} off={`Teams ${t('teamsUnbound')}`} />
                <StatusPill active={!!mfaStatus[u.email]} on={`MFA ${t('mfaSet')}`} off={`MFA ${t('mfaNotSet')}`} />
              </div>
              <p className="text-xs text-gray-400 mb-3">
                {t('colLastLogin')}: {u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : '—'}
              </p>
              {mfaStatus[u.email] && (
                <button
                  onClick={() => resetMfa(u)}
                  disabled={resetMfaId === u.id}
                  className="min-h-[36px] mb-2 w-full px-3 py-1.5 text-xs border border-orange-200 dark:border-orange-800 rounded-lg text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/30 disabled:opacity-40 transition-colors"
                >
                  {resetMfaId === u.id ? t('resetting') : t('reset') + ' MFA'}
                </button>
              )}
              <ActionButtons u={u} />
            </div>
          ))
        )}
      </div>

      {/* Desktop: table (sm+) */}
      <div className="hidden sm:block bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <tr>
              {([
                ['name', t('colName')],
                ['email', t('colEmail')],
                ['telegram', t('colTelegram')],
                ['teams', t('colTeams')],
                ['role', t('colRole')],
                ['last_login', t('colLastLogin')],
                ['mfa', 'MFA'],
              ] as const).map(([key, label]) => (
                <th key={key} className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">
                  <button
                    onClick={() => toggleSort(key as SortKey)}
                    className="inline-flex items-center gap-1 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                  >
                    {label}
                    <SortIcon k={key as SortKey} />
                  </button>
                </th>
              ))}
              <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">{t('colActions')}</th>
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
              sortedUsers.map((u) => (
                <tr key={u.id} className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3 text-gray-900 dark:text-gray-100 font-medium">{u.display_name || '—'}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{u.email}</td>
                  <td className="px-4 py-3">
                    <StatusPill active={!!u.telegram_id} on={t('telegramBound')} off={t('telegramUnbound')} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill active={!!u.teams_user_id} on={t('teamsBound')} off={t('teamsUnbound')} />
                  </td>
                  <td className="px-4 py-3">
                    <RoleBadge role={u.role} />
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1.5 items-start">
                      <StatusPill active={!!mfaStatus[u.email]} on={t('mfaSet')} off={t('mfaNotSet')} />
                      {mfaStatus[u.email] && (
                        <button
                          onClick={() => resetMfa(u)}
                          disabled={resetMfaId === u.id}
                          className="px-2 py-0.5 text-xs border border-orange-200 dark:border-orange-800 rounded-lg text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/30 disabled:opacity-40 transition-colors"
                        >
                          {resetMfaId === u.id ? t('resetting') : t('reset')}
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 space-y-2">
                    <ActionButtons u={u} />
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
