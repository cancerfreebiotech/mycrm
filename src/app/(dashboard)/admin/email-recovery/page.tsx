'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2, MailX, Mail, Check, AlertCircle } from 'lucide-react'
import { PermissionGate } from '@/components/PermissionGate'

interface ContactRef {
  id: string
  name: string | null
  name_en: string | null
  name_local: string | null
  company: string | null
  email: string | null
  email_status: string | null
  created_at: string | null
}

interface RecoveryRow {
  bad: ContactRef
  bad_event_at: string | null
  bad_event_reason: string | null
  candidates: ContactRef[]
}

interface ApiResponse {
  total: number
  with_candidates: number
  rows: RecoveryRow[]
}

export default function EmailRecoveryPage() {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [applying, setApplying] = useState<string | null>(null)
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set())
  const [filterMode, setFilterMode] = useState<'all' | 'with_candidates'>('with_candidates')
  const [customEmailDrafts, setCustomEmailDrafts] = useState<Map<string, string>>(new Map())

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/email-recovery')
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? '載入失敗')
        return
      }
      setData(body as ApiResponse)
    } catch (e) {
      setError(e instanceof Error ? e.message : '載入失敗')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function applyReplace(badId: string, newEmail: string, mergeFromId?: string) {
    if (!confirm(`確認把 ${newEmail} 設為新 email？舊 email 會寫進 notes，bounced 狀態會清除。`)) return
    setApplying(badId)
    try {
      const res = await fetch('/api/admin/email-recovery/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bad_contact_id: badId,
          new_email: newEmail,
          merge_from_contact_id: mergeFromId,
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        alert(`失敗：${body.error ?? '未知錯誤'}`)
        return
      }
      setAppliedIds((prev) => new Set(prev).add(badId))
    } finally {
      setApplying(null)
    }
  }

  const visible = useMemo(() => {
    if (!data) return []
    return filterMode === 'with_candidates'
      ? data.rows.filter((r) => r.candidates.length > 0)
      : data.rows
  }, [data, filterMode])

  return (
    <PermissionGate feature="duplicates">
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/" className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
            <ArrowLeft size={18} />
          </Link>
          <MailX size={22} className="text-amber-600" />
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Email 復活</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              退信 / 無效 email 的聯絡人，找出可能的「換工作後」新名片，一鍵替換 email
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
        ) : error ? (
          <div className="px-4 py-3 rounded-lg text-sm bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800">
            {error}
          </div>
        ) : data ? (
          <>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">總壞 email 聯絡人</div>
                <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{data.total}</div>
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">有候選新名片</div>
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">{data.with_candidates}</div>
              </div>
            </div>

            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setFilterMode('with_candidates')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                  filterMode === 'with_candidates'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                }`}
              >
                只看有候選
              </button>
              <button
                onClick={() => setFilterMode('all')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                  filterMode === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                }`}
              >
                全部 ({data.total})
              </button>
            </div>

            {visible.length === 0 ? (
              <p className="text-center text-gray-400 dark:text-gray-500 py-12 text-sm">沒有資料</p>
            ) : (
              <div className="space-y-4">
                {visible.map((row) => {
                  const applied = appliedIds.has(row.bad.id)
                  const isApplying = applying === row.bad.id
                  const customDraft = customEmailDrafts.get(row.bad.id) ?? ''
                  return (
                    <div
                      key={row.bad.id}
                      className={`bg-white dark:bg-gray-900 rounded-xl border p-4 ${
                        applied
                          ? 'border-green-300 dark:border-green-700 opacity-60'
                          : 'border-gray-200 dark:border-gray-800'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <Link
                            href={`/contacts/${row.bad.id}`}
                            className="text-base font-semibold text-gray-900 dark:text-gray-100 hover:underline"
                          >
                            {row.bad.name ?? '(無姓名)'}
                          </Link>
                          {row.bad.company && (
                            <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">{row.bad.company}</span>
                          )}
                        </div>
                        {applied && (
                          <div className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
                            <Check size={16} /> 已替換
                          </div>
                        )}
                      </div>

                      <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 mb-3">
                        <div className="flex items-center gap-2 text-sm">
                          <Mail size={14} className="text-amber-600 dark:text-amber-400" />
                          <span className="font-mono text-amber-900 dark:text-amber-200">{row.bad.email ?? '(無 email)'}</span>
                          <span className="px-2 py-0.5 text-xs rounded-full bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-200">
                            {row.bad.email_status}
                          </span>
                        </div>
                        {row.bad_event_at && (
                          <div className="mt-1.5 text-xs text-amber-700 dark:text-amber-400">
                            {new Date(row.bad_event_at).toLocaleString('zh-TW')} — {row.bad_event_reason?.slice(0, 150)}
                          </div>
                        )}
                      </div>

                      {row.candidates.length > 0 && (
                        <div className="space-y-2 mb-3">
                          <div className="text-xs font-medium text-gray-500 dark:text-gray-400">同名候選聯絡人（新建立）：</div>
                          {row.candidates.map((c) => (
                            <div
                              key={c.id}
                              className="flex items-center justify-between bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-3"
                            >
                              <div className="text-sm">
                                <Link href={`/contacts/${c.id}`} className="font-medium text-gray-900 dark:text-gray-100 hover:underline">
                                  {c.name ?? '(無姓名)'}
                                </Link>
                                {c.company && <span className="text-gray-500 dark:text-gray-400 ml-2">{c.company}</span>}
                                <div className="font-mono text-green-700 dark:text-green-400 mt-1">{c.email}</div>
                                {c.created_at && (
                                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                    建立於 {new Date(c.created_at).toLocaleDateString('zh-TW')}
                                  </div>
                                )}
                              </div>
                              <button
                                disabled={applied || isApplying}
                                onClick={() => applyReplace(row.bad.id, c.email!, c.id)}
                                className="px-3 py-1.5 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                              >
                                {isApplying ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                                用此 email 替換 + 軟刪新聯絡人
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {!applied && (
                        <div className="flex items-center gap-2 pt-3 border-t border-gray-200 dark:border-gray-800">
                          <span className="text-xs text-gray-500 dark:text-gray-400">或手動輸入 email：</span>
                          <input
                            type="email"
                            value={customDraft}
                            onChange={(e) => setCustomEmailDrafts((m) => new Map(m).set(row.bad.id, e.target.value))}
                            placeholder="new@example.com"
                            className="flex-1 px-2 py-1 rounded text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                          />
                          <button
                            disabled={isApplying || !customDraft.trim()}
                            onClick={() => applyReplace(row.bad.id, customDraft.trim())}
                            className="px-3 py-1 rounded text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            替換
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {appliedIds.size > 0 && (
              <button
                onClick={load}
                className="mt-6 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
              >
                重新載入（已替換 {appliedIds.size} 筆）
              </button>
            )}
          </>
        ) : null}
      </div>
    </PermissionGate>
  )
}
