'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { KeyRound, Loader2, Plus, Trash2, Power, Copy, Check, X, ExternalLink } from 'lucide-react'

interface TokenRow {
  id: string
  name: string
  description: string | null
  assigned_to: string
  prefix: string
  scopes: string[]
  created_at: string
  expires_at: string | null
  last_used_at: string | null
  disabled_at: string | null
  disabled_reason: string | null
  assignee: { display_name: string | null; email: string } | null
}

interface UserOption {
  id: string
  email: string
  display_name: string | null
  role: string
  granted_features: string[] | null
}

const ALL_SCOPES = [
  { key: 'read:contacts', label: '讀 聯絡人', feature: null },
  { key: 'read:newsletter', label: '讀 電子報', feature: 'newsletter' },
  { key: 'read:tags', label: '讀 標籤', feature: 'tags' },
  { key: 'write:contacts', label: '寫 聯絡人', feature: null },
  { key: 'write:notes', label: '寫 筆記', feature: null },
  { key: 'write:newsletter', label: '寫 電子報', feature: 'newsletter' },
] as const

function fmt(ts: string | null): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
}

export default function McpTokensPage() {
  const router = useRouter()
  const supabase = createBrowserSupabaseClient()
  const [authChecked, setAuthChecked] = useState(false)
  const [tokens, setTokens] = useState<TokenRow[]>([])
  const [users, setUsers] = useState<UserOption[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newPlaintext, setNewPlaintext] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email) { router.push('/'); return }
      const { data: profile } = await supabase.from('users').select('role').eq('email', user.email).single()
      if (profile?.role !== 'super_admin') { router.push('/'); return }
      setAuthChecked(true)
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const load = async () => {
    setLoading(true)
    const [tokRes, { data: userData }] = await Promise.all([
      fetch('/api/admin/mcp-tokens'),
      supabase.from('users').select('id, email, display_name, role, granted_features').order('display_name'),
    ])
    if (tokRes.ok) setTokens((await tokRes.json()).tokens ?? [])
    setUsers((userData ?? []) as UserOption[])
    setLoading(false)
  }
  useEffect(() => { if (authChecked) load() }, [authChecked])  // eslint-disable-line react-hooks/exhaustive-deps

  async function toggleDisable(t: TokenRow) {
    const disabling = !t.disabled_at
    if (disabling && !confirm(`停用 token「${t.name}」？該 agent 會立即無法呼叫。`)) return
    const res = await fetch(`/api/admin/mcp-tokens/${t.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ disabled: disabling }),
    })
    if (res.ok) load()
    else alert((await res.json()).error ?? '操作失敗')
  }

  async function deleteToken(t: TokenRow) {
    if (!confirm(`永久刪除 token「${t.name}」？無法復原。`)) return
    const res = await fetch(`/api/admin/mcp-tokens/${t.id}`, { method: 'DELETE' })
    if (res.ok) load()
    else alert((await res.json()).error ?? '刪除失敗')
  }

  function statusBadge(t: TokenRow) {
    if (t.disabled_at) return <span className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 rounded-full">已停用</span>
    if (t.expires_at && new Date(t.expires_at).getTime() < Date.now()) return <span className="px-2 py-0.5 text-xs bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 rounded-full">已過期</span>
    return <span className="px-2 py-0.5 text-xs bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400 rounded-full">使用中</span>
  }

  if (!authChecked) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-gray-400" /></div>

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <KeyRound size={22} className="text-blue-500" />
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">MCP Tokens</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">給外部 agent 用的存取金鑰。發放後明文只顯示一次。</p>
        </div>
        <Link href="/admin/mcp-activity" className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 inline-flex items-center gap-1">
          活動紀錄 <ExternalLink size={12} />
        </Link>
        <button
          onClick={() => { setShowCreate(true); setNewPlaintext(null) }}
          className="flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
        >
          <Plus size={16} /> 發 Token
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-gray-400" /></div>
      ) : tokens.length === 0 ? (
        <div className="text-center py-12 text-gray-400">還沒有任何 token</div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-400">名稱 / 用途</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-400">發給</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-400">Scopes</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">上次使用</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">過期</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-400">狀態</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {tokens.map((t) => (
                <tr key={t.id} className="border-b border-gray-100 dark:border-gray-800 last:border-0 align-top">
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-900 dark:text-gray-100">{t.name}</div>
                    <div className="text-xs text-gray-400 font-mono">{t.prefix}…</div>
                    {t.description && <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 max-w-xs">{t.description}</div>}
                  </td>
                  <td className="px-3 py-2 text-gray-700 dark:text-gray-300 whitespace-nowrap">{t.assignee?.display_name || t.assignee?.email || '—'}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1 max-w-[200px]">
                      {t.scopes.map((s) => (
                        <span key={s} className={`px-1.5 py-0.5 text-xs rounded ${s.startsWith('write') ? 'bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400' : 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400'}`}>{s}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{fmt(t.last_used_at)}</td>
                  <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{t.expires_at ? fmt(t.expires_at) : '永久'}</td>
                  <td className="px-3 py-2">{statusBadge(t)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <Link href={`/admin/mcp-activity?token_id=${t.id}`} title="看活動" className="p-1.5 text-gray-400 hover:text-blue-500"><ExternalLink size={14} /></Link>
                      <button onClick={() => toggleDisable(t)} title={t.disabled_at ? '啟用' : '停用'} className="p-1.5 text-gray-400 hover:text-amber-500"><Power size={14} /></button>
                      <button onClick={() => deleteToken(t)} title="刪除" className="p-1.5 text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreateModal
          users={users}
          plaintext={newPlaintext}
          copied={copied}
          onCopy={() => { if (newPlaintext) { navigator.clipboard.writeText(newPlaintext); setCopied(true); setTimeout(() => setCopied(false), 2000) } }}
          onCreated={(pt) => { setNewPlaintext(pt); load() }}
          onClose={() => { setShowCreate(false); setNewPlaintext(null) }}
        />
      )}
    </div>
  )
}

function CreateModal({ users, plaintext, copied, onCopy, onCreated, onClose }: {
  users: UserOption[]
  plaintext: string | null
  copied: boolean
  onCopy: () => void
  onCreated: (pt: string) => void
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [description, setDescription] = useState('')
  const [scopes, setScopes] = useState<string[]>(['read:contacts'])
  const [expiresIn, setExpiresIn] = useState<'24h' | '30d' | '1y' | 'never'>('never')
  const [submitting, setSubmitting] = useState(false)

  const assignee = users.find((u) => u.id === assignedTo)

  // Warn if a granted scope exceeds the assignee's mycrm permissions
  const warnings = useMemo(() => {
    if (!assignee) return []
    if (assignee.role === 'super_admin') return []
    const feats = assignee.granted_features ?? []
    const out: string[] = []
    for (const s of scopes) {
      const def = ALL_SCOPES.find((x) => x.key === s)
      if (def?.feature && !feats.includes(def.feature)) {
        out.push(`${s}（${assignee.display_name || assignee.email} 在 mycrm 沒有 ${def.feature} 權限）`)
      }
    }
    return out
  }, [assignee, scopes])

  async function submit() {
    if (!name.trim() || !assignedTo || scopes.length === 0) return
    if (warnings.length > 0 && !confirm(`注意：以下 scope 超過該使用者在 mycrm 的權限：\n\n${warnings.join('\n')}\n\nToken 仍會發放（scope 獨立）。確定？`)) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/mcp-tokens', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), assigned_to: assignedTo, description: description.trim() || undefined, scopes, expires_in: expiresIn }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error ?? '發放失敗'); return }
      onCreated(data.plaintext)
    } finally { setSubmitting(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 w-full max-w-lg p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{plaintext ? 'Token 已發放' : '發 MCP Token'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        {plaintext ? (
          <div className="space-y-3">
            <div className="text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
              ⚠ 這個明文 token 只會顯示這一次。請立刻複製保存，關閉後無法再看到。
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-xs font-mono break-all text-gray-900 dark:text-gray-100">{plaintext}</code>
              <button onClick={onCopy} className="shrink-0 p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">{copied ? <Check size={16} /> : <Copy size={16} />}</button>
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              使用方式：在 agent 的 MCP 設定加 header <code className="font-mono">Authorization: Bearer {plaintext.slice(0, 12)}…</code>，寫入工具還要加 <code className="font-mono">X-Acting-User: &lt;email&gt;</code>。
            </div>
            <div className="flex justify-end">
              <button onClick={onClose} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg">完成</button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400">Token 名稱 *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例：Eva 的 Slack bot"
                className="w-full mt-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400">發給誰用 *</label>
              <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}
                className="w-full mt-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                <option value="">— 選擇使用者 —</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.display_name || u.email}{u.role === 'super_admin' ? '（super_admin）' : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400">用途說明</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="例：每天早上自動 tag 昨日新增的 contact"
                className="w-full mt-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400">權限範圍 *</label>
              <div className="mt-1 grid grid-cols-2 gap-1.5">
                {ALL_SCOPES.map((s) => (
                  <label key={s.key} className="flex items-center gap-2 px-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                    <input type="checkbox" checked={scopes.includes(s.key)}
                      onChange={(e) => setScopes((prev) => e.target.checked ? [...prev, s.key] : prev.filter((x) => x !== s.key))} />
                    <span className={`text-xs ${s.key.startsWith('write') ? 'text-orange-700 dark:text-orange-400' : 'text-gray-700 dark:text-gray-300'}`}>{s.label}</span>
                  </label>
                ))}
              </div>
            </div>
            {warnings.length > 0 && (
              <div className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                ⚠ 部分 scope 超過該使用者的 mycrm 權限（token 仍可發、scope 獨立）：<br />{warnings.join('；')}
              </div>
            )}
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400">過期時間</label>
              <div className="mt-1 flex flex-wrap gap-2">
                {([['never', '永久'], ['1y', '1 年'], ['30d', '30 天'], ['24h', '24 小時']] as const).map(([v, l]) => (
                  <label key={v} className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" name="expiry" checked={expiresIn === v} onChange={() => setExpiresIn(v)} />
                    <span className="text-xs text-gray-700 dark:text-gray-300">{l}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg">取消</button>
              <button onClick={submit} disabled={submitting || !name.trim() || !assignedTo || scopes.length === 0}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50">
                {submitting ? '發放中…' : '發放 token'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
