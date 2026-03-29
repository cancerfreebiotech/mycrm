'use client'

import { useEffect, useState, useCallback } from 'react'
import { Trash2, RotateCcw, Loader2, AlertTriangle, X, CreditCard, MessageSquare } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'

interface TrashedContact {
  id: string
  name: string | null
  name_en: string | null
  company: string | null
  email: string | null
  deleted_at: string
  deleted_by_user: { display_name: string | null } | null
}

interface ContactDetail {
  id: string
  name: string | null
  name_en: string | null
  name_local: string | null
  company: string | null
  company_en: string | null
  job_title: string | null
  email: string | null
  second_email: string | null
  phone: string | null
  second_phone: string | null
  address: string | null
  website: string | null
  notes: string | null
  language: string | null
  hospital: string | null
  department: string | null
  deleted_at: string
  contact_tags: { tags: { id: string; name: string } }[]
  contact_cards: { id: string; card_img_url: string | null; label: string | null }[]
  interaction_logs: { id: string; type: string; content: string | null; created_at: string }[]
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('zh-TW', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div className="flex gap-2 text-sm">
      <span className="text-gray-500 dark:text-gray-400 min-w-20 shrink-0">{label}</span>
      <span className="text-gray-900 dark:text-gray-100 break-all">{value}</span>
    </div>
  )
}

export default function TrashPage() {
  const t = useTranslations('nav')
  const [contacts, setContacts] = useState<TrashedContact[]>([])
  const [loading, setLoading] = useState(true)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [actionId, setActionId] = useState<string | null>(null)
  const [detailContact, setDetailContact] = useState<ContactDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/contacts/trash')
    if (res.ok) {
      const data = await res.json()
      setContacts(data.contacts ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    const supabase = createBrowserSupabaseClient()
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return
      const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('email', session.user.email!)
        .single()
      if (profile?.role === 'super_admin') {
        setIsSuperAdmin(true)
        load()
      } else {
        setLoading(false)
      }
    })
  }, [load])

  async function openDetail(id: string) {
    setDetailLoading(true)
    setDetailContact(null)
    const supabase = createBrowserSupabaseClient()
    const { data } = await supabase
      .from('contacts')
      .select(`
        id, name, name_en, name_local, company, company_en, job_title,
        email, second_email, phone, second_phone, address, website, notes,
        language, hospital, department, deleted_at,
        contact_tags(tags(id, name)),
        contact_cards(id, card_img_url, label),
        interaction_logs(id, type, content, created_at)
      `)
      .eq('id', id)
      .single()
    setDetailContact(data as ContactDetail)
    setDetailLoading(false)
  }

  async function handleRestore(id: string) {
    if (!confirm('確定要還原此聯絡人？')) return
    setActionId(id)
    const res = await fetch(`/api/contacts/${id}/restore`, { method: 'POST' })
    if (res.ok) {
      setContacts((prev) => prev.filter((c) => c.id !== id))
      setDetailContact(null)
    } else {
      const body = await res.json()
      alert(body.error ?? '還原失敗')
    }
    setActionId(null)
  }

  async function handlePermanentDelete(id: string, name: string | null) {
    if (!confirm(`確定要永久刪除「${name || '此聯絡人'}」？此操作無法復原，相關名片圖片也會一併刪除。`)) return
    setActionId(id)
    const res = await fetch(`/api/contacts/${id}/permanent`, { method: 'DELETE' })
    if (res.ok) {
      setContacts((prev) => prev.filter((c) => c.id !== id))
      setDetailContact(null)
    } else {
      const body = await res.json()
      alert(body.error ?? '永久刪除失敗')
    }
    setActionId(null)
  }

  if (!isSuperAdmin && !loading) {
    return (
      <div className="p-8 text-center text-gray-500 dark:text-gray-400">
        無權限存取此頁面
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Trash2 size={22} className="text-red-500" />
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">回收區</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            已移至回收區的聯絡人可以還原，或由 Super Admin 永久刪除
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={24} className="animate-spin text-gray-400" />
        </div>
      ) : contacts.length === 0 ? (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">
          <Trash2 size={40} className="mx-auto mb-3 opacity-30" />
          <p>回收區是空的</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          {/* Warning banner */}
          <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800 text-sm text-amber-700 dark:text-amber-400">
            <AlertTriangle size={14} />
            共 {contacts.length} 筆聯絡人在回收區。永久刪除後無法復原。
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">姓名</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400 hidden sm:table-cell">公司</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400 hidden md:table-cell">刪除者</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">刪除時間</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {contacts.map((contact) => {
                  const isActing = actionId === contact.id
                  const displayName = contact.name || contact.name_en || '（無姓名）'
                  return (
                    <tr
                      key={contact.id}
                      className="border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/30"
                    >
                      <td className="px-4 py-3">
                        <button
                          onClick={() => openDetail(contact.id)}
                          className="font-medium text-blue-600 dark:text-blue-400 hover:underline text-left"
                        >
                          {displayName}
                        </button>
                        {contact.email && (
                          <div className="text-xs text-gray-400 mt-0.5">{contact.email}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400 hidden sm:table-cell">
                        {contact.company ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400 hidden md:table-cell">
                        {contact.deleted_by_user?.display_name ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">
                        {formatDate(contact.deleted_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 justify-end">
                          <button
                            onClick={() => handleRestore(contact.id)}
                            disabled={isActing}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 disabled:opacity-50"
                          >
                            {isActing ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                            還原
                          </button>
                          <button
                            onClick={() => handlePermanentDelete(contact.id, contact.name || contact.name_en)}
                            disabled={isActing}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 disabled:opacity-50"
                          >
                            {isActing ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                            永久刪除
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {(detailLoading || detailContact) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100">
                {detailContact ? (detailContact.name || detailContact.name_en || '（無姓名）') : '載入中...'}
              </h2>
              <button
                onClick={() => setDetailContact(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X size={18} />
              </button>
            </div>

            {detailLoading ? (
              <div className="flex justify-center py-16">
                <Loader2 size={24} className="animate-spin text-gray-400" />
              </div>
            ) : detailContact && (
              <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
                {/* Basic info */}
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">基本資料</h3>
                  <InfoRow label="姓名" value={detailContact.name} />
                  <InfoRow label="英文名" value={detailContact.name_en} />
                  <InfoRow label="當地語名" value={detailContact.name_local} />
                  <InfoRow label="公司" value={detailContact.company} />
                  <InfoRow label="公司（英）" value={detailContact.company_en} />
                  <InfoRow label="職稱" value={detailContact.job_title} />
                  <InfoRow label="Email" value={detailContact.email} />
                  <InfoRow label="Email 2" value={detailContact.second_email} />
                  <InfoRow label="電話" value={detailContact.phone} />
                  <InfoRow label="電話 2" value={detailContact.second_phone} />
                  <InfoRow label="地址" value={detailContact.address} />
                  <InfoRow label="網站" value={detailContact.website} />
                  <InfoRow label="語文" value={detailContact.language} />
                  <InfoRow label="醫院" value={detailContact.hospital} />
                  <InfoRow label="科別" value={detailContact.department} />
                  <InfoRow label="備註" value={detailContact.notes} />
                  <div className="text-xs text-gray-400 mt-1">刪除時間：{formatDate(detailContact.deleted_at)}</div>
                </div>

                {/* Tags */}
                {detailContact.contact_tags.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">Tags</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {detailContact.contact_tags.map((ct) => (
                        <span key={ct.tags.id} className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full">
                          {ct.tags.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Card images */}
                {detailContact.contact_cards.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2 flex items-center gap-1.5">
                      <CreditCard size={12} /> 名片
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {detailContact.contact_cards.map((card) =>
                        card.card_img_url ? (
                          <img
                            key={card.id}
                            src={card.card_img_url}
                            alt={card.label ?? '名片'}
                            className="h-24 rounded border border-gray-200 dark:border-gray-700 object-cover"
                          />
                        ) : null
                      )}
                    </div>
                  </div>
                )}

                {/* Interaction logs */}
                {detailContact.interaction_logs.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2 flex items-center gap-1.5">
                      <MessageSquare size={12} /> 互動紀錄（{detailContact.interaction_logs.length}）
                    </h3>
                    <div className="space-y-2">
                      {detailContact.interaction_logs.slice(0, 10).map((log) => (
                        <div key={log.id} className="text-sm bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
                          <div className="text-xs text-gray-400 mb-0.5">{new Date(log.created_at).toLocaleDateString()} · {log.type}</div>
                          <div className="text-gray-700 dark:text-gray-300 line-clamp-2">
                            {log.content?.replace(/<[^>]+>/g, '') ?? '—'}
                          </div>
                        </div>
                      ))}
                      {detailContact.interaction_logs.length > 10 && (
                        <div className="text-xs text-gray-400 text-center">
                          還有 {detailContact.interaction_logs.length - 10} 筆紀錄未顯示
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Modal footer actions */}
            {detailContact && (
              <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700 flex gap-3 justify-end">
                <button
                  onClick={() => handleRestore(detailContact.id)}
                  disabled={actionId === detailContact.id}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 disabled:opacity-50"
                >
                  {actionId === detailContact.id ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                  還原
                </button>
                <button
                  onClick={() => handlePermanentDelete(detailContact.id, detailContact.name || detailContact.name_en)}
                  disabled={actionId === detailContact.id}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 disabled:opacity-50"
                >
                  {actionId === detailContact.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  永久刪除
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
