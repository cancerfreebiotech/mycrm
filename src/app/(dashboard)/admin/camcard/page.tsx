'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import {
  FolderInput, Loader2, Check, X, Merge, ExternalLink,
  ChevronDown, ChevronRight, AlertTriangle, CheckSquare
} from 'lucide-react'

interface PendingCard {
  id: string
  image_filename: string | null
  card_img_url: string | null
  ocr_data: Record<string, string | null>
  status: 'pending' | 'confirmed' | 'skipped'
  duplicate_contact_id: string | null
  match_type: string | null
  created_at: string
  duplicate_contact?: {
    id: string
    name: string | null
    name_en: string | null
    company: string | null
    email: string | null
  } | null
}

interface GroupedCards {
  company: string
  cards: PendingCard[]
}

type MergeAction = { pendingId: string; contactId: string; contactName: string } | null
type ContactSearchResult = { id: string; name: string | null; name_en: string | null; company: string | null; email: string | null }

export default function CamcardPage() {
  const supabase = createBrowserSupabaseClient()

  const [groups, setGroups] = useState<GroupedCards[]>([])
  const [loading, setLoading] = useState(true)
  const [totalPending, setTotalPending] = useState(0)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Merge modal
  const [mergeAction, setMergeAction] = useState<MergeAction>(null)
  const [mergeQuery, setMergeQuery] = useState('')
  const [mergeResults, setMergeResults] = useState<ContactSearchResult[]>([])
  const [mergeSearching, setMergeSearching] = useState(false)
  const [mergeSelectedContact, setMergeSelectedContact] = useState<ContactSearchResult | null>(null)
  const [mergeSaving, setMergeSaving] = useState(false)

  // Batch confirm
  const [batchConfirming, setBatchConfirming] = useState<string | null>(null)

  const fetchPending = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('camcard_pending')
      .select(`
        id, image_filename, card_img_url, ocr_data, status,
        duplicate_contact_id, match_type, created_at,
        duplicate_contact:contacts!duplicate_contact_id(id, name, name_en, company, email)
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    const cards = (data ?? []) as unknown as PendingCard[]
    setTotalPending(cards.length)

    // Group by company
    const map = new Map<string, PendingCard[]>()
    for (const card of cards) {
      const company = card.ocr_data?.company || card.ocr_data?.company_en || '（未知公司）'
      if (!map.has(company)) map.set(company, [])
      map.get(company)!.push(card)
    }

    const grouped: GroupedCards[] = []
    map.forEach((c, company) => grouped.push({ company, cards: c }))
    grouped.sort((a, b) => b.cards.length - a.cards.length)
    setGroups(grouped)
    setLoading(false)
  }, [supabase])

  useEffect(() => { fetchPending() }, [fetchPending])

  function toggleGroup(company: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(company)) next.delete(company)
      else next.add(company)
      return next
    })
  }

  async function handleConfirm(cardId: string) {
    setActionLoading(cardId)
    try {
      const res = await fetch(`/api/camcard/${cardId}/confirm`, { method: 'POST' })
      if (!res.ok) throw new Error((await res.json()).error)
      removeCard(cardId)
    } catch (e) {
      alert(e instanceof Error ? e.message : '操作失敗')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleSkip(cardId: string) {
    setActionLoading(cardId)
    try {
      const res = await fetch(`/api/camcard/${cardId}/skip`, { method: 'POST' })
      if (!res.ok) throw new Error((await res.json()).error)
      removeCard(cardId)
    } catch (e) {
      alert(e instanceof Error ? e.message : '操作失敗')
    } finally {
      setActionLoading(null)
    }
  }

  function openMerge(card: PendingCard) {
    setMergeAction({ pendingId: card.id, contactId: '', contactName: '' })
    setMergeQuery('')
    setMergeResults([])
    setMergeSelectedContact(null)

    // Pre-fill with duplicate if detected
    if (card.duplicate_contact) {
      const dc = card.duplicate_contact
      setMergeSelectedContact({
        id: dc.id,
        name: dc.name,
        name_en: dc.name_en,
        company: dc.company,
        email: dc.email,
      })
    }
  }

  async function searchContacts(q: string) {
    setMergeSearching(true)
    const { data } = await supabase
      .from('contacts')
      .select('id, name, name_en, company, email')
      .or(`name.ilike.%${q}%,company.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(10)
    setMergeResults((data ?? []) as ContactSearchResult[])
    setMergeSearching(false)
  }

  async function handleMergeConfirm() {
    if (!mergeAction || !mergeSelectedContact) return
    setMergeSaving(true)
    try {
      const res = await fetch(`/api/camcard/${mergeAction.pendingId}/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: mergeSelectedContact.id }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      removeCard(mergeAction.pendingId)
      setMergeAction(null)
    } catch (e) {
      alert(e instanceof Error ? e.message : '合併失敗')
    } finally {
      setMergeSaving(false)
    }
  }

  async function handleBatchConfirm(company: string) {
    const group = groups.find((g) => g.company === company)
    if (!group) return
    // Only confirm cards with no duplicate detected
    const toConfirm = group.cards.filter((c) => !c.duplicate_contact_id)
    if (toConfirm.length === 0) { alert('此群組無可直接確認的名片（重複聯絡人需手動處理）'); return }

    setBatchConfirming(company)
    try {
      for (const card of toConfirm) {
        await fetch(`/api/camcard/${card.id}/confirm`, { method: 'POST' })
        removeCard(card.id)
      }
    } finally {
      setBatchConfirming(null)
    }
  }

  function removeCard(cardId: string) {
    setGroups((prev) =>
      prev
        .map((g) => ({ ...g, cards: g.cards.filter((c) => c.id !== cardId) }))
        .filter((g) => g.cards.length > 0)
    )
    setTotalPending((n) => n - 1)
  }

  function OcrField({ label, value }: { label: string; value: string | null | undefined }) {
    if (!value) return null
    return (
      <div className="flex gap-1.5">
        <span className="text-gray-400 shrink-0 w-14 text-right">{label}</span>
        <span className="text-gray-700 dark:text-gray-300 break-all">{value}</span>
      </div>
    )
  }

  function CardItem({ card }: { card: PendingCard }) {
    const ocr = card.ocr_data ?? {}
    const name = ocr.name || ocr.name_en || '（無姓名）'
    const hasDup = !!card.duplicate_contact_id
    const dup = card.duplicate_contact
    const isLoading = actionLoading === card.id

    return (
      <div className={`bg-white dark:bg-gray-900 rounded-xl border p-4 ${hasDup ? 'border-yellow-300 dark:border-yellow-700' : 'border-gray-200 dark:border-gray-700'}`}>
        <div className="flex gap-4">
          {/* Card image */}
          {card.card_img_url ? (
            <img
              src={card.card_img_url}
              alt="名片"
              className="w-32 h-20 object-cover rounded-lg border border-gray-200 dark:border-gray-700 shrink-0"
            />
          ) : (
            <div className="w-32 h-20 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center shrink-0">
              <FolderInput size={20} className="text-gray-300" />
            </div>
          )}

          {/* OCR data */}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{name}</p>
            {ocr.job_title && <p className="text-xs text-gray-500 mt-0.5">{ocr.job_title}</p>}
            <div className="mt-2 text-xs space-y-0.5">
              <OcrField label="Email" value={ocr.email} />
              <OcrField label="電話" value={ocr.phone} />
              <OcrField label="地址" value={ocr.address} />
              <OcrField label="網站" value={ocr.website} />
            </div>
            {card.image_filename && (
              <p className="text-xs text-gray-300 dark:text-gray-600 mt-1.5">{card.image_filename}</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2 shrink-0 items-end">
            <button
              onClick={() => handleConfirm(card.id)}
              disabled={isLoading || hasDup}
              title={hasDup ? '偵測到重複聯絡人，請先處理' : '確認新增'}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isLoading ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              新增
            </button>
            <button
              onClick={() => openMerge(card)}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-40"
            >
              <Merge size={12} /> 合併
            </button>
            <button
              onClick={() => handleSkip(card.id)}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 dark:border-gray-700 text-gray-500 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40"
            >
              <X size={12} /> 略過
            </button>
          </div>
        </div>

        {/* Duplicate warning */}
        {hasDup && dup && (
          <div className="mt-3 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-lg px-3 py-2 flex items-center gap-2">
            <AlertTriangle size={13} className="text-yellow-500 shrink-0" />
            <p className="text-xs text-yellow-700 dark:text-yellow-400">
              {card.match_type === 'exact_email' ? '相同 Email：' : '姓名相似：'}
              <span className="font-medium">{dup.name || dup.name_en}</span>
              {dup.company && <span>（{dup.company}）</span>}
              <Link
                href={`/contacts/${dup.id}`}
                target="_blank"
                className="ml-1.5 inline-flex items-center gap-0.5 text-blue-500 hover:underline"
              >
                <ExternalLink size={10} /> 查看
              </Link>
            </p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">名片王匯入審查</h1>
          <p className="text-sm text-gray-400 mt-1">
            待審查：{totalPending} 張 · 按公司分組顯示
          </p>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16">
          <Loader2 size={24} className="animate-spin mx-auto mb-3 text-gray-400" />
          <p className="text-sm text-gray-400">載入中...</p>
        </div>
      ) : groups.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center">
          <FolderInput size={36} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">目前無待審查名片</p>
          <p className="text-gray-300 text-sm mt-1">
            使用 <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">scripts/camcard-import/import.ts</code> 匯入名片後，在此審查
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => {
            const isCollapsed = collapsedGroups.has(group.company)
            const noDupCards = group.cards.filter((c) => !c.duplicate_contact_id)
            const dupCount = group.cards.length - noDupCards.length
            const isBatchLoading = batchConfirming === group.company

            return (
              <div key={group.company} className="bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
                {/* Group header */}
                <div
                  className="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
                  onClick={() => toggleGroup(group.company)}
                >
                  <div className="flex items-center gap-2">
                    {isCollapsed ? <ChevronRight size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                    <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{group.company}</span>
                    <span className="text-xs text-gray-400">{group.cards.length} 張</span>
                    {dupCount > 0 && (
                      <span className="text-xs bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400 px-2 py-0.5 rounded-full">
                        ⚠️ {dupCount} 筆重複
                      </span>
                    )}
                  </div>
                  {noDupCards.length > 0 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleBatchConfirm(group.company) }}
                      disabled={isBatchLoading}
                      className="flex items-center gap-1.5 px-3 py-1 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                    >
                      {isBatchLoading ? <Loader2 size={12} className="animate-spin" /> : <CheckSquare size={12} />}
                      批次新增（{noDupCards.length}）
                    </button>
                  )}
                </div>

                {/* Group cards */}
                {!isCollapsed && (
                  <div className="px-4 pb-4 space-y-3">
                    {group.cards.map((card) => (
                      <CardItem key={card.id} card={card} />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Merge modal */}
      {mergeAction && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <Merge size={16} /> 合併至現有聯絡人
              </h2>
              <button onClick={() => setMergeAction(null)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-500">搜尋要合併的現有聯絡人，名片中的空白欄位將補入此聯絡人：</p>

              {/* Search */}
              <input
                type="text"
                value={mergeQuery}
                onChange={(e) => {
                  setMergeQuery(e.target.value)
                  if (e.target.value.length >= 1) searchContacts(e.target.value)
                  else setMergeResults([])
                }}
                placeholder="輸入姓名、公司或 Email..."
                className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

              {/* Results */}
              {mergeSearching && (
                <div className="text-center py-4"><Loader2 size={16} className="animate-spin mx-auto text-gray-400" /></div>
              )}
              {mergeResults.length > 0 && !mergeSearching && (
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                  {mergeResults.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => { setMergeSelectedContact(c); setMergeResults([]) }}
                      className="w-full text-left px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-100 dark:border-gray-700 last:border-0"
                    >
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{c.name || c.name_en}</p>
                      <p className="text-xs text-gray-500">{c.company} {c.email && `· ${c.email}`}</p>
                    </button>
                  ))}
                </div>
              )}

              {/* Selected contact */}
              {mergeSelectedContact && (
                <div className="bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-lg p-3">
                  <p className="text-xs font-semibold text-orange-600 dark:text-orange-400 mb-1">已選擇：</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{mergeSelectedContact.name || mergeSelectedContact.name_en}</p>
                  <p className="text-xs text-gray-500">{mergeSelectedContact.company}</p>
                  {mergeSelectedContact.email && <p className="text-xs text-gray-400">{mergeSelectedContact.email}</p>}
                  <Link
                    href={`/contacts/${mergeSelectedContact.id}`}
                    target="_blank"
                    className="inline-flex items-center gap-1 text-xs text-blue-500 hover:underline mt-1"
                  >
                    <ExternalLink size={10} /> 查看聯絡人
                  </Link>
                </div>
              )}

              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-xs text-gray-500 space-y-1">
                <p>• 名片的空白欄位將補入所選聯絡人</p>
                <p>• 名片圖片會加入聯絡人的名片圖庫</p>
                <p>• 名片暫存記錄標記為已確認</p>
              </div>
            </div>

            <div className="flex justify-between gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
              <button onClick={() => setMergeAction(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">取消</button>
              <button
                onClick={handleMergeConfirm}
                disabled={mergeSaving || !mergeSelectedContact}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50"
              >
                {mergeSaving ? <Loader2 size={14} className="animate-spin" /> : <Merge size={14} />}
                確認合併
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
