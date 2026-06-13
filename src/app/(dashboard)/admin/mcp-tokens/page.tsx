'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
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
  { key: 'read:contacts', labelKey: 'scopeReadContacts', feature: null },
  { key: 'read:newsletter', labelKey: 'scopeReadNewsletter', feature: 'newsletter' },
  { key: 'read:tags', labelKey: 'scopeReadTags', feature: 'tags' },
  { key: 'write:contacts', labelKey: 'scopeWriteContacts', feature: null },
  { key: 'write:notes', labelKey: 'scopeWriteNotes', feature: null },
  { key: 'write:newsletter', labelKey: 'scopeWriteNewsletter', feature: 'newsletter' },
] as const

function fmt(ts: string | null): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
}

export default function McpTokensPage() {
  const t = useTranslations('mcpTokens')
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

  async function toggleDisable(tok: TokenRow) {
    const disabling = !tok.disabled_at
    if (disabling && !confirm(t('confirmDisable', { name: tok.name }))) return
    const res = await fetch(`/api/admin/mcp-tokens/${tok.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ disabled: disabling }),
    })
    if (res.ok) load()
    else alert((await res.json()).error ?? t('disableFailed'))
  }

  async function deleteToken(tok: TokenRow) {
    if (!confirm(t('confirmDelete', { name: tok.name }))) return
    const res = await fetch(`/api/admin/mcp-tokens/${tok.id}`, { method: 'DELETE' })
    if (res.ok) load()
    else alert((await res.json()).error ?? t('deleteFailed'))
  }

  function statusBadge(tok: TokenRow) {
    if (tok.disabled_at) return <span className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 rounded-full">{t('statusDisabled')}</span>
    if (tok.expires_at && new Date(tok.expires_at).getTime() < Date.now()) return <span className="px-2 py-0.5 text-xs bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 rounded-full">{t('statusExpired')}</span>
    return <span className="px-2 py-0.5 text-xs bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400 rounded-full">{t('statusActive')}</span>
  }

  if (!authChecked) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-gray-400" /></div>

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <KeyRound size={22} className="text-blue-500" />
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">MCP Tokens</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{t('subtitle')}</p>
        </div>
        <Link href="/admin/mcp-activity" className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 inline-flex items-center gap-1">
          {t('activityLog')} <ExternalLink size={12} />
        </Link>
        <button
          onClick={() => { setShowCreate(true); setNewPlaintext(null) }}
          className="flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
        >
          <Plus size={16} /> {t('issueToken')}
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-gray-400" /></div>
      ) : tokens.length === 0 ? (
        <div className="text-center py-12 text-gray-400">{t('empty')}</div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-400">{t('colNamePurpose')}</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-400">{t('colAssignee')}</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-400">Scopes</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">{t('colLastUsed')}</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">{t('colExpires')}</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-400">{t('colStatus')}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {tokens.map((tok) => (
                <tr key={tok.id} className="border-b border-gray-100 dark:border-gray-800 last:border-0 align-top">
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-900 dark:text-gray-100">{tok.name}</div>
                    <div className="text-xs text-gray-400 font-mono">{tok.prefix}…</div>
                    {tok.description && <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 max-w-xs">{tok.description}</div>}
                  </td>
                  <td className="px-3 py-2 text-gray-700 dark:text-gray-300 whitespace-nowrap">{tok.assignee?.display_name || tok.assignee?.email || '—'}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1 max-w-[200px]">
                      {tok.scopes.map((s) => (
                        <span key={s} className={`px-1.5 py-0.5 text-xs rounded ${s.startsWith('write') ? 'bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400' : 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400'}`}>{s}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{fmt(tok.last_used_at)}</td>
                  <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{tok.expires_at ? fmt(tok.expires_at) : t('permanent')}</td>
                  <td className="px-3 py-2">{statusBadge(tok)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <Link href={`/admin/mcp-activity?token_id=${tok.id}`} title={t('viewActivity')} className="p-1.5 text-gray-400 hover:text-blue-500"><ExternalLink size={14} /></Link>
                      <button onClick={() => toggleDisable(tok)} title={tok.disabled_at ? t('enable') : t('disable')} className="p-1.5 text-gray-400 hover:text-amber-500"><Power size={14} /></button>
                      <button onClick={() => deleteToken(tok)} title={t('delete')} className="p-1.5 text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
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
  const t = useTranslations('mcpTokens')
  const [name, setName] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [description, setDescription] = useState('')
  const [scopes, setScopes] = useState<string[]>(['read:contacts'])
  const [expiresIn, setExpiresIn] = useState<'24h' | '30d' | '1y' | 'never'>('never')
  const [allowAnyActor, setAllowAnyActor] = useState(false)
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
        out.push(t('warningItem', { scope: s, user: assignee.display_name || assignee.email, feature: def.feature }))
      }
    }
    return out
  }, [assignee, scopes, t])

  async function submit() {
    if (!name.trim() || !assignedTo || scopes.length === 0) return
    if (warnings.length > 0 && !confirm(t('confirmScopeExceed', { warnings: warnings.join('\n') }))) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/mcp-tokens', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), assigned_to: assignedTo, description: description.trim() || undefined, scopes, expires_in: expiresIn, allow_any_actor: allowAnyActor }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error ?? t('issueFailed')); return }
      onCreated(data.plaintext)
    } finally { setSubmitting(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 w-full max-w-lg p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{plaintext ? t('issuedTitle') : t('issueModalTitle')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        {plaintext ? (
          <div className="space-y-3">
            <div className="text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
              {t('plaintextWarning')}
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-xs font-mono break-all text-gray-900 dark:text-gray-100">{plaintext}</code>
              <button onClick={onCopy} className="shrink-0 p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">{copied ? <Check size={16} /> : <Copy size={16} />}</button>
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {t.rich('usageHint', {
                bearer: plaintext.slice(0, 12),
                code: (chunks) => <code className="font-mono">{chunks}</code>,
              })}
            </div>
            <div className="flex justify-end">
              <button onClick={onClose} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg">{t('done')}</button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400">{t('fieldName')}</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('fieldNamePlaceholder')}
                className="w-full mt-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400">{t('fieldAssignee')}</label>
              <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}
                className="w-full mt-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                <option value="">{t('selectUser')}</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.display_name || u.email}{u.role === 'super_admin' ? '（super_admin）' : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400">{t('fieldDescription')}</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder={t('fieldDescriptionPlaceholder')}
                className="w-full mt-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400">{t('fieldScopes')}</label>
              <div className="mt-1 grid grid-cols-2 gap-1.5">
                {ALL_SCOPES.map((s) => (
                  <label key={s.key} className="flex items-center gap-2 px-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                    <input type="checkbox" checked={scopes.includes(s.key)}
                      onChange={(e) => setScopes((prev) => e.target.checked ? [...prev, s.key] : prev.filter((x) => x !== s.key))} />
                    <span className={`text-xs ${s.key.startsWith('write') ? 'text-orange-700 dark:text-orange-400' : 'text-gray-700 dark:text-gray-300'}`}>{t(s.labelKey)}</span>
                  </label>
                ))}
              </div>
            </div>
            {warnings.length > 0 && (
              <div className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                {t('warningBanner')}<br />{warnings.join('；')}
              </div>
            )}
            <div>
              <label className="flex items-start gap-2 px-2 py-2 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                <input type="checkbox" checked={allowAnyActor} onChange={(e) => setAllowAnyActor(e.target.checked)} className="mt-0.5" />
                <span className="text-xs text-gray-700 dark:text-gray-300">
                  <span className="font-medium">{t('allowAnyActorTitle')}</span>{t('allowAnyActorSuffix')}<br />
                  <span className="text-gray-500 dark:text-gray-400">{t('allowAnyActorNote', { assignee: assignee?.display_name || assignee?.email || t('assigneeFallback') })}</span>
                </span>
              </label>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400">{t('fieldExpiry')}</label>
              <div className="mt-1 flex flex-wrap gap-2">
                {([['never', t('expiryNever')], ['1y', t('expiry1y')], ['30d', t('expiry30d')], ['24h', t('expiry24h')]] as const).map(([v, l]) => (
                  <label key={v} className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" name="expiry" checked={expiresIn === v} onChange={() => setExpiresIn(v)} />
                    <span className="text-xs text-gray-700 dark:text-gray-300">{l}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg">{t('cancel')}</button>
              <button onClick={submit} disabled={submitting || !name.trim() || !assignedTo || scopes.length === 0}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50">
                {submitting ? t('issuing') : t('issueSubmit')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
