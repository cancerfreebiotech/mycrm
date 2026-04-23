'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import {
  FolderInput, Loader2, Check, X, Merge, ExternalLink,
  ChevronDown, ChevronRight, AlertTriangle, CheckSquare, ZoomIn,
  ChevronLeft, Pencil, Search, RotateCcw,
} from 'lucide-react'
import { PermissionGate } from '@/components/PermissionGate'

interface Tag { id: string; name: string }

interface PendingCard {
  id: string
  image_filename: string | null
  card_img_url: string | null
  back_img_url: string | null
  ocr_data: Record<string, string | null>
  status: 'pending' | 'confirmed' | 'skipped'
  duplicate_contact_id: string | null
  match_type: string | null
  created_at: string
  assignee_label: string | null
  duplicate_contact?: {
    id: string
    name: string | null
    name_en: string | null
    company: string | null
    email: string | null
  } | null
}

interface AssigneeOption { label: string; count: number }

interface GroupedCards {
  company: string
  cards: PendingCard[]
}

type MergeAction = { pendingId: string; contactId: string; contactName: string } | null
type ContactSearchResult = { id: string; name: string | null; name_en: string | null; company: string | null; email: string | null }

export default function CamcardPage() {
  const t = useTranslations('camcard')
  const tc = useTranslations('common')
  const supabase = createBrowserSupabaseClient()  // used for contact search only

  const PAGE_SIZE = 20

  const [groups, setGroups] = useState<GroupedCards[]>([])
  const [loading, setLoading] = useState(true)
  const [totalPending, setTotalPending] = useState(0)
  const [page, setPage] = useState(1)
  const [jumpInput, setJumpInput] = useState('')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Merge modal
  const [mergeAction, setMergeAction] = useState<MergeAction>(null)
  const [mergeQuery, setMergeQuery] = useState('')
  const [mergeResults, setMergeResults] = useState<ContactSearchResult[]>([])
  const [mergeSearching, setMergeSearching] = useState(false)
  const [mergeSelectedContact, setMergeSelectedContact] = useState<ContactSearchResult | null>(null)
  const [mergeSaving, setMergeSaving] = useState(false)

  // Current user (for audit log)
  const [myUser, setMyUser] = useState<{ id: string; display_name: string } | null>(null)

  // Tags
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [cardTags, setCardTags] = useState<Record<string, string[]>>({})

  // Importance
  const [cardImportance, setCardImportance] = useState<Record<string, string>>({})

  // Language
  const [cardLanguage, setCardLanguage] = useState<Record<string, string>>({})

  // Lightbox
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  // Batch confirm
  const [batchConfirming, setBatchConfirming] = useState<string | null>(null)

  // Edit modal
  const [editCard, setEditCard] = useState<PendingCard | null>(null)
  const [editData, setEditData] = useState<Record<string, string>>({})
  const [editSaving, setEditSaving] = useState(false)

  // Multi-select bulk confirm
  const [selectedCards, setSelectedCards] = useState<Set<string>>(new Set())
  const [bulkConfirming, setBulkConfirming] = useState(false)
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null)

  // Filters
  const [searchInput, setSearchInput] = useState('')
  const [searchFilter, setSearchFilter] = useState('')
  const [hasDuplicateFilter, setHasDuplicateFilter] = useState(false)
  const [countryCodeFilter, setCountryCodeFilter] = useState('')
  const [hasEmailFilter, setHasEmailFilter] = useState(false)
  const [assigneeFilter, setAssigneeFilter] = useState('')   // '', 'PO', 'Eva', '__unassigned__'
  const [sortFilter, setSortFilter] = useState<'newest' | 'oldest'>('newest')
  const [assigneeOptions, setAssigneeOptions] = useState<AssigneeOption[]>([])
  const [unassignedCount, setUnassignedCount] = useState(0)
  const [bulkAssigning, setBulkAssigning] = useState(false)

  // Debounce search input → searchFilter
  useEffect(() => {
    const t = setTimeout(() => setSearchFilter(searchInput), 400)
    return () => clearTimeout(t)
  }, [searchInput])

  const fetchPending = useCallback(async (targetPage: number) => {
    setLoading(true)
    const offset = (targetPage - 1) * PAGE_SIZE
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) })
    if (searchFilter) params.set('search', searchFilter)
    if (hasDuplicateFilter) params.set('has_duplicate', '1')
    if (countryCodeFilter) params.set('country_code', countryCodeFilter)
    if (hasEmailFilter) params.set('has_email', '1')
    if (assigneeFilter) params.set('assignee', assigneeFilter)
    if (sortFilter === 'oldest') params.set('sort', 'oldest')

    const res = await fetch(`/api/camcard/pending?${params}`)
    const json = res.ok ? await res.json() : { cards: [], total: 0 }
    const cards: PendingCard[] = json.cards ?? []
    setTotalPending(json.total ?? 0)

    // Group by company
    const map = new Map<string, PendingCard[]>()
    for (const card of cards) {
      const company = card.ocr_data?.company || card.ocr_data?.company_en || t('unknownCompany')
      if (!map.has(company)) map.set(company, [])
      map.get(company)!.push(card)
    }

    const grouped: GroupedCards[] = []
    map.forEach((c, company) => grouped.push({ company, cards: c }))
    grouped.sort((a, b) => b.cards.length - a.cards.length)
    setGroups(grouped)

    // Auto-select non-duplicate cards
    setSelectedCards(new Set(cards.filter(c => !c.duplicate_contact_id).map(c => c.id)))

    // Initialize language from country_code in OCR data
    const langMap: Record<string, string> = {}
    for (const card of cards) {
      const cc = card.ocr_data?.country_code ?? ''
      langMap[card.id] = cc === 'JP' ? 'japanese' : (cc === 'TW' || cc === 'CN') ? 'chinese' : 'english'
    }
    setCardLanguage(prev => ({ ...langMap, ...prev }))
    setLoading(false)
  }, [searchFilter, hasDuplicateFilter, countryCodeFilter, hasEmailFilter, assigneeFilter, sortFilter])

  // Fetch when page or fetchPending (filters) change
  useEffect(() => {
    fetchPending(page)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, fetchPending])

  // When filters change, reset to page 1 (fetchPending change above handles the re-fetch)
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    if (page !== 1) setPage(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchFilter, hasDuplicateFilter, countryCodeFilter, hasEmailFilter, assigneeFilter, sortFilter])

  useEffect(() => {
    supabase.from('tags').select('id, name').order('name').then(({ data }) => setAllTags(data ?? []))
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const meData = await fetch('/api/me').then(r => r.ok ? r.json() : null)
      setMyUser({ id: user.id, display_name: meData?.display_name || user.email || '' })
    })
  }, [])

  const reloadAssignees = useCallback(async () => {
    const res = await fetch('/api/camcard/assignees')
    if (!res.ok) return
    const j = await res.json() as { assignees: AssigneeOption[]; unassigned: number }
    setAssigneeOptions(j.assignees ?? [])
    setUnassignedCount(j.unassigned ?? 0)
  }, [])

  useEffect(() => { reloadAssignees() }, [reloadAssignees, searchFilter, assigneeFilter])

  async function bulkAssign(label: string | null) {
    if (selectedCards.size === 0) { alert('請先勾選要更改的名片'); return }
    const niceLabel = label ?? '（取消指派）'
    if (!confirm(`將 ${selectedCards.size} 張名片的審核人改為「${niceLabel}」？`)) return
    setBulkAssigning(true)
    try {
      const res = await fetch('/api/camcard/assignees', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selectedCards], assignee_label: label }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '更新失敗')
      await fetchPending(page)
      await reloadAssignees()
    } catch (e) {
      alert(e instanceof Error ? e.message : '更新失敗')
    } finally { setBulkAssigning(false) }
  }

  function toggleGroup(company: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(company)) next.delete(company)
      else next.add(company)
      return next
    })
  }

  function toggleCardTag(cardId: string, tagId: string) {
    setCardTags((prev) => {
      const current = prev[cardId] ?? []
      const next = current.includes(tagId) ? current.filter((t) => t !== tagId) : [...current, tagId]
      return { ...prev, [cardId]: next }
    })
  }

  async function resolveUser() {
    // Re-fetch if myUser not set or display_name looks like an email (fallback value)
    if (myUser && !myUser.display_name.includes('@')) return myUser
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const meData = await fetch('/api/me').then(r => r.ok ? r.json() : null)
    const u = { id: user.id, display_name: meData?.display_name || user.email || '' }
    setMyUser(u)
    return u
  }

  async function handleConfirm(cardId: string) {
    setActionLoading(cardId)
    const tagIds = cardTags[cardId] ?? []
    const importance = cardImportance[cardId] ?? 'medium'
    const language = cardLanguage[cardId] ?? 'english'
    const user = await resolveUser()
    try {
      const res = await fetch(`/api/camcard/${cardId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagIds, importance, language, confirmedByUserId: user?.id, confirmedByName: user?.display_name }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      removeCard(cardId)
    } catch (e) {
      alert(e instanceof Error ? e.message : t('operationFailed'))
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
      alert(e instanceof Error ? e.message : t('operationFailed'))
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
    const user = await resolveUser()
    try {
      const res = await fetch(`/api/camcard/${mergeAction.pendingId}/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: mergeSelectedContact.id, confirmedByUserId: user?.id, confirmedByName: user?.display_name }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      removeCard(mergeAction.pendingId)
      setMergeAction(null)
    } catch (e) {
      alert(e instanceof Error ? e.message : t('mergeFailed'))
    } finally {
      setMergeSaving(false)
    }
  }

  async function handleBatchConfirm(company: string) {
    const group = groups.find((g) => g.company === company)
    if (!group) return
    // Only confirm cards with no duplicate detected
    const toConfirm = group.cards.filter((c) => !c.duplicate_contact_id)
    if (toConfirm.length === 0) { alert(t('bulkNoConfirmable')); return }

    setBatchConfirming(company)
    const user = await resolveUser()
    try {
      for (const card of toConfirm) {
        await fetch(`/api/camcard/${card.id}/confirm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ confirmedByUserId: user?.id, confirmedByName: user?.display_name }),
        })
        removeCard(card.id)
      }
    } finally {
      setBatchConfirming(null)
    }
  }

  function openEdit(card: PendingCard) {
    const ocr = card.ocr_data ?? {}
    const fields: Record<string, string> = {}
    for (const key of [
      'name', 'name_en', 'name_local',
      'company', 'company_en',
      'job_title', 'department',
      'email', 'second_email',
      'phone', 'second_phone', 'fax',
      'address', 'address_en',
      'website', 'linkedin_url', 'facebook_url',
      'country_code',
    ]) {
      fields[key] = (ocr[key] as string) ?? ''
    }
    setEditData(fields)
    setEditCard(card)
  }

  async function handleSaveEdit() {
    if (!editCard) return
    setEditSaving(true)
    try {
      const res = await fetch(`/api/camcard/${editCard.id}/update`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ocr_data: editData }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      // Update local state
      setGroups((prev) => prev.map((g) => ({
        ...g,
        cards: g.cards.map((c) => c.id === editCard.id ? { ...c, ocr_data: { ...editData } } : c),
      })))
      setEditCard(null)
    } catch (e) {
      alert(e instanceof Error ? e.message : t('saveFailed'))
    } finally {
      setEditSaving(false)
    }
  }

  function removeCard(cardId: string) {
    setGroups((prev) => {
      const next = prev
        .map((g) => ({ ...g, cards: g.cards.filter((c) => c.id !== cardId) }))
        .filter((g) => g.cards.length > 0)
      // If page is now empty and not the first page, go back one page
      if (next.length === 0 && page > 1) {
        setPage((p) => p - 1)
      } else if (next.length === 0) {
        // Still on page 1 but empty — re-fetch to load next batch
        fetchPending(1)
      }
      return next
    })
    setTotalPending((n) => n - 1)
  }

  async function handleBulkConfirm() {
    const ids = [...selectedCards]
    if (ids.length === 0) return
    setBulkConfirming(true)
    setBulkProgress({ done: 0, total: ids.length })
    const user = await resolveUser()

    const CHUNK = 5
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK)
      await Promise.all(chunk.map(async (id) => {
        const tagIds = cardTags[id] ?? []
        const importance = cardImportance[id] ?? 'medium'
        const language = cardLanguage[id] ?? 'english'
        try {
          const res = await fetch(`/api/camcard/${id}/confirm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tagIds, importance, language, confirmedByUserId: user?.id, confirmedByName: user?.display_name }),
          })
          if (res.ok) {
            removeCard(id)
            setSelectedCards(prev => { const n = new Set(prev); n.delete(id); return n })
          }
        } catch {
          // continue on individual failure
        }
        setBulkProgress(prev => prev ? { ...prev, done: prev.done + 1 } : null)
      }))
    }

    setBulkConfirming(false)
    setBulkProgress(null)
  }

  function CardThumb({ url, alt, onPreview }: { url: string | null; alt: string; onPreview: (u: string) => void }) {
    const [broken, setBroken] = useState(false)
    if (!url || broken) {
      return (
        <div className="w-28 h-16 bg-gray-100 dark:bg-gray-800 rounded-lg flex flex-col items-center justify-center gap-1">
          <FolderInput size={16} className="text-gray-300" />
          {broken && <span className="text-xs text-gray-300">{t('loadFailed')}</span>}
        </div>
      )
    }
    return (
      <button
        onClick={() => onPreview(url)}
        className="relative w-28 h-16 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 group shrink-0"
        title={t('clickToEnlarge', { alt })}
      >
        <img
          src={url}
          alt={alt}
          className="w-full h-full object-cover"
          onError={() => setBroken(true)}
        />
        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <ZoomIn size={16} className="text-white" />
        </div>
      </button>
    )
  }

  function ensureHttp(url: string) {
    return /^https?:\/\//i.test(url) ? url : `https://${url}`
  }

  function OcrField({ label, value, href }: { label: string; value: string | null | undefined; href?: string }) {
    if (!value) return null
    return (
      <div className="flex gap-1.5">
        <span className="text-gray-400 shrink-0 w-14 text-right">{label}</span>
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline break-all">{value}</a>
        ) : (
          <span className="text-gray-700 dark:text-gray-300 break-all">{value}</span>
        )}
      </div>
    )
  }

  function CardItem({ card }: { card: PendingCard }) {
    const ocr = card.ocr_data ?? {}
    const name = ocr.name || ocr.name_en || t('noName')
    const hasDup = !!card.duplicate_contact_id
    const dup = card.duplicate_contact
    const isLoading = actionLoading === card.id
    const importance = cardImportance[card.id] ?? 'medium'
    const language = cardLanguage[card.id] ?? 'english'

    return (
      <div className={`bg-white dark:bg-gray-900 rounded-xl border p-4 ${hasDup ? 'border-yellow-300 dark:border-yellow-700' : selectedCards.has(card.id) ? 'border-green-300 dark:border-green-700' : 'border-gray-200 dark:border-gray-700'}`}>
        <div className="flex gap-4">
          {/* Checkbox */}
          <div className="flex items-start pt-1 shrink-0">
            <input
              type="checkbox"
              checked={selectedCards.has(card.id)}
              disabled={hasDup}
              onChange={() => {
                setSelectedCards(prev => {
                  const next = new Set(prev)
                  if (next.has(card.id)) next.delete(card.id)
                  else next.add(card.id)
                  return next
                })
              }}
              className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
            />
          </div>

          {/* Card images: front + back stacked, click to enlarge */}
          <div className="flex flex-col gap-1 shrink-0">
            <CardThumb url={card.card_img_url} alt={t('sideFront')} onPreview={setPreviewUrl} />
            {card.back_img_url && (
              <CardThumb url={card.back_img_url} alt={t('sideBack')} onPreview={setPreviewUrl} />
            )}
          </div>

          {/* OCR data */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{name}</p>
              {card.assignee_label && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-medium" title="審核人">
                  👤 {card.assignee_label}
                </span>
              )}
            </div>
            {ocr.job_title && <p className="text-xs text-gray-500 mt-0.5">{ocr.job_title}</p>}
            <div className="mt-2 text-xs space-y-0.5">
              {ocr.name_en && ocr.name_en !== ocr.name && <OcrField label={t('fieldNameEn')} value={ocr.name_en} />}
              <OcrField label={t('fieldCompany')} value={ocr.company || ocr.company_en} />
              <OcrField label={t('fieldDepartment')} value={ocr.department} />
              <OcrField label="Email" value={ocr.email} />
              <OcrField label={t('fieldPhone')} value={ocr.phone} />
              <OcrField label={t('fieldFax')} value={ocr.fax} />
              <OcrField label={t('fieldAddress')} value={ocr.address} />
              <OcrField label={t('fieldAddressEn')} value={ocr.address_en} />
              <OcrField label={t('fieldWebsite')} value={ocr.website} href={ocr.website ? ensureHttp(ocr.website) : undefined} />
              {ocr.country_code && <OcrField label={t('fieldCountry')} value={ocr.country_code} />}
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
              title={hasDup ? t('hasDupWarn') : t('confirmAddTitle')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isLoading ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              {t('addAction')}
            </button>
            <button
              onClick={() => openEdit(card)}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40"
            >
              <Pencil size={12} /> {t('editAction')}
            </button>
            <button
              onClick={() => openMerge(card)}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-40"
            >
              <Merge size={12} /> {t('mergeAction')}
            </button>
            <button
              onClick={() => handleSkip(card.id)}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 dark:border-gray-700 text-gray-500 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40"
            >
              <X size={12} /> {t('skipAction')}
            </button>
          </div>
        </div>

        {/* Duplicate warning */}
        {hasDup && dup && (
          <div className="mt-3 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-lg px-3 py-2 flex items-center gap-2">
            <AlertTriangle size={13} className="text-yellow-500 shrink-0" />
            <p className="text-xs text-yellow-700 dark:text-yellow-400">
              {card.match_type === 'exact_email' ? t('sameEmail') : t('similarName')}
              <span className="font-medium">{dup.name || dup.name_en}</span>
              {dup.company && <span>（{dup.company}）</span>}
              <Link
                href={`/contacts/${dup.id}`}
                target="_blank"
                className="ml-1.5 inline-flex items-center gap-0.5 text-blue-500 hover:underline"
              >
                <ExternalLink size={10} /> {t('view')}
              </Link>
            </p>
          </div>
        )}

        {/* Importance + Tag picker */}
        <div className="mt-3 flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-400 shrink-0">{t('importanceLabel')}</span>
            {(['high', 'medium', 'low'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setCardImportance((prev) => ({ ...prev, [card.id]: v }))}
                className={`w-7 h-6 text-xs rounded border transition-colors ${
                  importance === v
                    ? 'bg-green-500 border-green-500 text-white'
                    : 'border-gray-300 dark:border-gray-600 text-gray-500 hover:border-green-400'
                }`}
              >
                {v === 'high' ? 'H' : v === 'low' ? 'L' : 'M'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-400 shrink-0">{t('languageLabel')}</span>
            {([['chinese', t('langZh')], ['english', 'EN'], ['japanese', t('langJa')]] as const).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setCardLanguage((prev) => ({ ...prev, [card.id]: v }))}
                className={`px-2 h-6 text-xs rounded border transition-colors ${
                  language === v
                    ? 'bg-blue-500 border-blue-500 text-white'
                    : 'border-gray-300 dark:border-gray-600 text-gray-500 hover:border-blue-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1 items-center">
              <span className="text-xs text-gray-400 shrink-0">{t('tagsLabel')}</span>
              {allTags.map((tag) => {
                const isSelected = (cardTags[card.id] ?? []).includes(tag.id)
                return (
                  <button
                    key={tag.id}
                    onClick={() => toggleCardTag(card.id, tag.id)}
                    className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${
                      isSelected
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'text-gray-500 border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500'
                    }`}
                  >
                    {tag.name}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <PermissionGate feature="camcard">
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('pageTitle')}</h1>
          <p className="text-sm text-gray-400 mt-1">
            {t('pageDesc', { count: totalPending })}
          </p>
        </div>
        {totalPending > PAGE_SIZE && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
              className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm text-gray-600 dark:text-gray-400 tabular-nums">
              {tc('page', { current: page, total: Math.ceil(totalPending / PAGE_SIZE) })}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(Math.ceil(totalPending / PAGE_SIZE), p + 1))}
              disabled={page >= Math.ceil(totalPending / PAGE_SIZE) || loading}
              className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40"
            >
              <ChevronRight size={16} />
            </button>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                const n = parseInt(jumpInput, 10)
                const maxPage = Math.ceil(totalPending / PAGE_SIZE)
                if (!isNaN(n) && n >= 1 && n <= maxPage) {
                  setPage(n)
                }
                setJumpInput('')
              }}
              className="flex items-center gap-1"
            >
              <input
                type="number"
                min={1}
                max={Math.ceil(totalPending / PAGE_SIZE)}
                value={jumpInput}
                onChange={(e) => setJumpInput(e.target.value)}
                placeholder={t('jumpPlaceholder')}
                className="w-16 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 text-xs text-center bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="submit"
                className="px-2 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Go
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Filter bar */}
      <div className="mb-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 flex flex-wrap gap-3 items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="w-full pl-7 pr-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Country code */}
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-400 shrink-0">{t('fieldCountry')}</label>
          <div className="relative">
            <select
              value={countryCodeFilter}
              onChange={(e) => setCountryCodeFilter(e.target.value)}
              className="appearance-none pl-2 pr-6 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="">{t('countryAll')}</option>
              <option value="TW">{t('countryTW')}</option>
              <option value="JP">{t('countryJP')}</option>
              <option value="SG">{t('countrySG')}</option>
              <option value="HK">{t('countryHK')}</option>
              <option value="CN">{t('countryCN')}</option>
              <option value="US">{t('countryUS')}</option>
            </select>
            <ChevronDown size={12} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {/* Assignee / 審核人 */}
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-400 shrink-0">審核人</label>
          <div className="relative">
            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              className="appearance-none pl-2 pr-6 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="">全部</option>
              {assigneeOptions.map((a) => (
                <option key={a.label} value={a.label}>{a.label} ({a.count})</option>
              ))}
              {unassignedCount > 0 && <option value="__unassigned__">（未指派） ({unassignedCount})</option>}
            </select>
            <ChevronDown size={12} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {/* Has duplicate */}
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={hasDuplicateFilter}
            onChange={(e) => setHasDuplicateFilter(e.target.checked)}
            className="w-3.5 h-3.5 rounded border-gray-300 text-orange-500 focus:ring-orange-400"
          />
          <span className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">{t('filterHasDup')}</span>
        </label>

        {/* Has email */}
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={hasEmailFilter}
            onChange={(e) => setHasEmailFilter(e.target.checked)}
            className="w-3.5 h-3.5 rounded border-gray-300 text-blue-500 focus:ring-blue-400"
          />
          <span className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">{t('filterHasEmail')}</span>
        </label>

        {/* Sort */}
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-400 shrink-0">{t('sortLabel')}</label>
          <div className="relative">
            <select
              value={sortFilter}
              onChange={(e) => setSortFilter(e.target.value as 'newest' | 'oldest')}
              className="appearance-none pl-2 pr-6 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="newest">{t('sortNewest')}</option>
              <option value="oldest">{t('sortOldest')}</option>
            </select>
            <ChevronDown size={12} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {/* Select all / Deselect all */}
        <div className="flex items-center gap-1.5 border-l border-gray-200 dark:border-gray-700 pl-3">
          <button
            onClick={() => {
              const allNonDup = groups.flatMap(g => g.cards).filter(c => !c.duplicate_contact_id).map(c => c.id)
              setSelectedCards(new Set(allNonDup))
            }}
            className="text-xs text-blue-500 hover:text-blue-700 dark:hover:text-blue-300 whitespace-nowrap"
          >
            {t('selectAll')}
          </button>
          <span className="text-gray-300 dark:text-gray-600 text-xs">·</span>
          <button
            onClick={() => setSelectedCards(new Set())}
            className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 whitespace-nowrap"
          >
            {t('deselectAll')}
          </button>
        </div>

        {/* Reset */}
        {(searchInput || hasDuplicateFilter || countryCodeFilter || hasEmailFilter || sortFilter !== 'newest') && (
          <button
            onClick={() => { setSearchInput(''); setHasDuplicateFilter(false); setCountryCodeFilter(''); setHasEmailFilter(false); setSortFilter('newest') }}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-500 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <RotateCcw size={11} /> {t('clear')}
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-16">
          <Loader2 size={24} className="animate-spin mx-auto mb-3 text-gray-400" />
          <p className="text-sm text-gray-400">{tc('loading')}</p>
        </div>
      ) : groups.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center">
          <FolderInput size={36} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">{t('emptyPending')}</p>
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

      {/* Lightbox */}
      {previewUrl && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setPreviewUrl(null)}
        >
          <button
            className="absolute top-4 right-4 text-white/70 hover:text-white"
            onClick={() => setPreviewUrl(null)}
          >
            <X size={28} />
          </button>
          <img
            src={previewUrl}
            alt={t('cardPreview')}
            className="max-w-full max-h-full rounded-xl shadow-2xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Edit modal */}
      {editCard && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <Pencil size={16} /> 編輯名片資料
              </h2>
              <button onClick={() => setEditCard(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                {([
                  ['name', t('fieldCnName')],
                  ['name_en', t('fieldNameEn')],
                  ['name_local', t('fieldNameLocal')],
                  ['company', t('fieldCompanyZh')],
                  ['company_en', t('fieldCompanyEn')],
                  ['job_title', t('fieldJobTitle')],
                  ['department', t('fieldDepartment')],
                  ['email', 'Email'],
                  ['second_email', 'Email 2'],
                  ['phone', t('fieldPhone')],
                  ['second_phone', t('fieldSecondPhone')],
                  ['fax', t('fieldFax')],
                  ['country_code', t('fieldCountryCode')],
                  ['website', t('fieldWebsite')],
                  ['linkedin_url', 'LinkedIn'],
                  ['facebook_url', 'Facebook'],
                ] as [string, string][]).map(([key, label]) => (
                  <div key={key}>
                    <label className="block text-xs text-gray-400 mb-1">{label}</label>
                    <input
                      type="text"
                      value={editData[key] ?? ''}
                      onChange={(e) => setEditData((prev) => ({ ...prev, [key]: e.target.value }))}
                      className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                ))}
                <div className="col-span-2">
                  <label className="block text-xs text-gray-400 mb-1">{t('fieldAddressZhLabel')}</label>
                  <input
                    type="text"
                    value={editData.address ?? ''}
                    onChange={(e) => setEditData((prev) => ({ ...prev, address: e.target.value }))}
                    className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-400 mb-1">{t('fieldAddressEnLabel')}</label>
                  <input
                    type="text"
                    value={editData.address_en ?? ''}
                    onChange={(e) => setEditData((prev) => ({ ...prev, address_en: e.target.value }))}
                    className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-between gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
              <button onClick={() => setEditCard(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">{tc('cancel')}</button>
              <button
                onClick={handleSaveEdit}
                disabled={editSaving}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {editSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                {tc('save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Merge modal */}
      {mergeAction && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <Merge size={16} /> {t('mergeToExisting')}
              </h2>
              <button onClick={() => setMergeAction(null)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-500">{t('mergeSearchDesc')}</p>

              {/* Search */}
              <input
                type="text"
                value={mergeQuery}
                onChange={(e) => {
                  setMergeQuery(e.target.value)
                  if (e.target.value.length >= 1) searchContacts(e.target.value)
                  else setMergeResults([])
                }}
                placeholder={t('mergeSearchPlaceholder')}
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
                  <p className="text-xs font-semibold text-orange-600 dark:text-orange-400 mb-1">{t('selected')}</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{mergeSelectedContact.name || mergeSelectedContact.name_en}</p>
                  <p className="text-xs text-gray-500">{mergeSelectedContact.company}</p>
                  {mergeSelectedContact.email && <p className="text-xs text-gray-400">{mergeSelectedContact.email}</p>}
                  <Link
                    href={`/contacts/${mergeSelectedContact.id}`}
                    target="_blank"
                    className="inline-flex items-center gap-1 text-xs text-blue-500 hover:underline mt-1"
                  >
                    <ExternalLink size={10} /> {t('view')}聯絡人
                  </Link>
                </div>
              )}

              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-xs text-gray-500 space-y-1">
                <p>{t('mergeRule1')}</p>
                <p>{t('mergeRule2')}</p>
                <p>{t('mergeRule3')}</p>
              </div>
            </div>

            <div className="flex justify-between gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
              <button onClick={() => setMergeAction(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">{tc('cancel')}</button>
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
      {/* Floating bulk confirm bar */}
      {(selectedCards.size > 0 || bulkConfirming) && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-2xl shadow-2xl px-5 py-3">
          {bulkConfirming && bulkProgress ? (
            <>
              <Loader2 size={16} className="animate-spin shrink-0" />
              <span className="text-sm font-medium whitespace-nowrap">確認中… {bulkProgress.done} / {bulkProgress.total}</span>
              <div className="w-28 bg-gray-700 dark:bg-gray-300 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-green-400 h-full rounded-full transition-all duration-300"
                  style={{ width: `${Math.round((bulkProgress.done / bulkProgress.total) * 100)}%` }}
                />
              </div>
            </>
          ) : (
            <>
              <span className="text-sm whitespace-nowrap">{t.rich('bulkSelectedCount', { count: selectedCards.size, b: (chunks) => <b>{chunks}</b> })}</span>
              <button
                onClick={handleBulkConfirm}
                disabled={bulkConfirming}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 font-medium whitespace-nowrap"
              >
                <Check size={13} /> {t('bulkConfirmSelected', { count: selectedCards.size })}
              </button>
              <button
                onClick={async () => {
                  const label = prompt('指派審核人（輸入名字，如 PO / Eva / Tom；留空 = 取消指派）', 'PO')
                  if (label === null) return
                  await bulkAssign(label.trim() || null)
                }}
                disabled={bulkAssigning}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 disabled:opacity-50 font-medium whitespace-nowrap"
                title="批次指派審核人"
              >
                {bulkAssigning ? <Loader2 size={13} className="animate-spin" /> : <>👤</>} 指派審核人
              </button>
              <button
                onClick={() => setSelectedCards(new Set())}
                className="text-xs text-gray-400 dark:text-gray-500 hover:text-white dark:hover:text-gray-800 whitespace-nowrap"
              >
                {t('bulkDeselect')}
              </button>
            </>
          )}
        </div>
      )}
    </div>
    </PermissionGate>
  )
}
