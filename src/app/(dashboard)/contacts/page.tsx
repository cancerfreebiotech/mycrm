'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { Search, Download, Plus, ChevronDown, ChevronUp, ChevronsUpDown, Copy, Check, Loader2, X, Linkedin, Mail, Users, SlidersHorizontal } from 'lucide-react'
import * as XLSX from 'xlsx'

interface Tag {
  id: string
  name: string
  is_email_blacklist?: boolean
}

interface Country {
  code: string
  name_zh: string
  emoji: string | null
}

interface Contact {
  id: string
  name: string | null
  company: string | null
  job_title: string | null
  email: string | null
  phone: string | null
  country_code: string | null
  met_at: string | null
  met_date: string | null
  created_at: string
  last_activity_at: string
  importance: string
  language: string | null
  email_status: 'bounced' | 'unsubscribed' | 'invalid' | 'deferred' | 'mailbox_full' | 'sender_blocked' | 'recipient_blocked' | null
  email_opt_out: boolean | null
  created_by: string | null
  users: { display_name: string | null } | null
  contact_tags: { tags: Tag }[]
}

interface Creator { id: string; display_name: string | null }

function ImportanceDots({ value }: { value: string }) {
  const filled = value === 'high' ? 3 : value === 'low' ? 1 : 2
  return (
    <span className="flex items-center gap-0.5 shrink-0">
      {[0, 1, 2].map((i) => (
        <span key={i} className={`w-2 h-2 rounded-full ${i < filled ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'}`} />
      ))}
    </span>
  )
}

const PAGE_SIZE = 20

export default function ContactsPage() {
  const t = useTranslations('contacts')
  const tc = useTranslations('common')
  const searchParams = useSearchParams()
  const router = useRouter()

  const [contacts, setContacts] = useState<Contact[]>([])
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [allCountries, setAllCountries] = useState<Country[]>([])
  const [query, setQuery] = useState('')
  const [metQuery, setMetQuery] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false)
  const [selectedCountries, setSelectedCountries] = useState<string[]>([])
  const [selectedImportance, setSelectedImportance] = useState<string>('')
  const [importanceDropdownOpen, setImportanceDropdownOpen] = useState(false)
  const [countryDropdownOpen, setCountryDropdownOpen] = useState(false)
  const [selectedLanguage, setSelectedLanguage] = useState<string>('')
  const [languageDropdownOpen, setLanguageDropdownOpen] = useState(false)
  const [selectedEmailStatus, setSelectedEmailStatus] = useState<string>(
    searchParams?.get('email_status') ?? ''
  )
  const [creators, setCreators] = useState<Creator[]>([])
  const [selectedCreators, setSelectedCreators] = useState<string[]>([])
  const [emailStatusDropdownOpen, setEmailStatusDropdownOpen] = useState(false)
  const [creatorDropdownOpen, setCreatorDropdownOpen] = useState(false)
  const [createdFrom, setCreatedFrom] = useState('')
  const [createdTo, setCreatedTo] = useState('')
  const [createdDateDropdownOpen, setCreatedDateDropdownOpen] = useState(false)
  const [metDateFrom, setMetDateFrom] = useState('')
  const [metDateTo, setMetDateTo] = useState('')
  const [metDateDropdownOpen, setMetDateDropdownOpen] = useState(false)
  const [columnsDropdownOpen, setColumnsDropdownOpen] = useState(false)

  type ColKey = 'company' | 'job_title' | 'email' | 'tags' | 'met_at' | 'creator' | 'created_at'
  const DEFAULT_COLS: Record<ColKey, boolean> = {
    company: true, job_title: true, email: true, tags: true,
    met_at: true, creator: false, created_at: true,
  }
  const [visibleCols, setVisibleCols] = useState<Record<ColKey, boolean>>(() => {
    if (typeof window === 'undefined') return DEFAULT_COLS
    try {
      const stored = localStorage.getItem('contacts_visible_columns')
      return stored ? { ...DEFAULT_COLS, ...JSON.parse(stored) } : DEFAULT_COLS
    } catch { return DEFAULT_COLS }
  })
  function toggleCol(key: ColKey) {
    setVisibleCols((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      localStorage.setItem('contacts_visible_columns', JSON.stringify(next))
      return next
    })
  }
  const [loading, setLoading] = useState(true)
  const [addDropOpen, setAddDropOpen] = useState(false)
  const [liParsing, setLiParsing] = useState(false)
  const liInputRef = useRef<HTMLInputElement>(null)
  const [page, setPage] = useState(1)
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null)
  type SortField = 'name' | 'company' | 'job_title' | 'email' | 'created_at' | 'last_activity_at' | 'tag'
  const [sortField, setSortField] = useState<SortField | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [batchModalOpen, setBatchModalOpen] = useState(false)
  const [batchForm, setBatchForm] = useState({
    met_at: '', met_date: '', referred_by: '',
    company: '', country_code: '', language: '', _tag_ids: [] as string[],
  })
  const [batchSaving, setBatchSaving] = useState(false)
  const [canExport, setCanExport] = useState(false)
  const [canNewsletter, setCanNewsletter] = useState(false)
  const [listModalOpen, setListModalOpen] = useState(false)
  const [listForm, setListForm] = useState({ name: '', description: '' })
  const [listCreating, setListCreating] = useState(false)
  const [listError, setListError] = useState<string | null>(null)

  function copyEmail(email: string) {
    navigator.clipboard.writeText(email)
    setCopiedEmail(email)
    setTimeout(() => setCopiedEmail(null), 1500)
  }

  useEffect(() => {
    fetchAll()
  }, [])

  async function fetchAll() {
    const supabase = createBrowserSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    const [contactRes, { data: tagData }, { data: countryData }, { data: userData }, { data: creatorData }] = await Promise.all([
      fetch('/api/contacts/all').then(r => r.json()),
      supabase.from('tags').select('id, name').order('name'),
      supabase.from('countries').select('code, name_zh, emoji').eq('is_active', true).order('name_zh'),
      user?.email
        ? supabase.from('users').select('role, granted_features').eq('email', user.email).single()
        : Promise.resolve({ data: null }),
      supabase.from('users').select('id, display_name').order('display_name'),
    ])
    const isSuperAdmin = userData?.role === 'super_admin'
    const grantedFeatures: string[] = userData?.granted_features ?? []
    setCanExport(isSuperAdmin || grantedFeatures.includes('export_contacts'))
    setCanNewsletter(isSuperAdmin || grantedFeatures.includes('newsletter'))
    const tags = tagData ?? []
    setContacts((Array.isArray(contactRes) ? contactRes : []) as Contact[])
    setAllTags(tags)
    setAllCountries(countryData ?? [])
    setCreators((creatorData ?? []) as Creator[])
    setLoading(false)

    // Initialize filters from URL query params (after data loaded)
    const tagParam = searchParams.get('tag')
    if (tagParam) {
      const matched = tags.find((t) => t.name === tagParam)
      if (matched) setSelectedTags([matched.id])
    }
    const countryParam = searchParams.get('country')
    if (countryParam) {
      setSelectedCountries([countryParam])
    }
    const importanceParam = searchParams.get('importance')
    if (importanceParam) {
      setSelectedImportance(importanceParam)
    }
    const creatorParam = searchParams.get('creator')
    if (creatorParam) {
      setSelectedCreators(creatorParam.split(','))
    }
  }

  function toggleTag(tagId: string) {
    setSelectedTags((prev) =>
      prev.includes(tagId) ? prev.filter((t) => t !== tagId) : [...prev, tagId]
    )
    setPage(1)
  }

  function toggleCountry(code: string) {
    setSelectedCountries((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    )
    setPage(1)
  }

  function handleSort(field: SortField) {
    if (sortField !== field) {
      setSortField(field)
      setSortDir('asc')
    } else if (sortDir === 'asc') {
      setSortDir('desc')
    } else {
      setSortField(null)
    }
    setPage(1)
  }

  // Unique met_at values for the datalist autocomplete dropdown.
  // Sorted by frequency desc, then alpha — most-used events surface first.
  const metAtOptions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const c of contacts) {
      const v = c.met_at?.trim()
      if (!v) continue
      counts.set(v, (counts.get(v) ?? 0) + 1)
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([v]) => v)
  }, [contacts])

  const filtered = contacts.filter((c) => {
    const matchQuery =
      !query ||
      c.name?.toLowerCase().includes(query.toLowerCase()) ||
      c.company?.toLowerCase().includes(query.toLowerCase()) ||
      c.email?.toLowerCase().includes(query.toLowerCase())
    const metQ = metQuery.trim().toLowerCase()
    const matchMet =
      !metQ || c.met_at?.toLowerCase().includes(metQ)
    const matchTags =
      selectedTags.length === 0 ||
      selectedTags.some((tid) => c.contact_tags.some((ct) => ct.tags?.id === tid))
    const matchCountry =
      selectedCountries.length === 0 ||
      selectedCountries.some((code) =>
        code === '__other__' ? !c.country_code : c.country_code === code
      )
    const matchImportance = !selectedImportance || c.importance === selectedImportance
    const matchLanguage = !selectedLanguage || c.language === selectedLanguage
    const matchEmailStatus = !selectedEmailStatus ||
      (selectedEmailStatus === 'ok' ? !c.email_status : c.email_status === selectedEmailStatus)
    const matchCreator =
      selectedCreators.length === 0 ||
      (c.created_by != null && selectedCreators.includes(c.created_by))
    const createdDate = c.created_at.slice(0, 10)
    const matchCreatedFrom = !createdFrom || createdDate >= createdFrom
    const matchCreatedTo = !createdTo || createdDate <= createdTo
    const metDateStr = c.met_date?.slice(0, 10) ?? ''
    const matchMetDateFrom = !metDateFrom || (!!metDateStr && metDateStr >= metDateFrom)
    const matchMetDateTo = !metDateTo || (!!metDateStr && metDateStr <= metDateTo)
    return matchQuery && matchMet && matchTags && matchCountry && matchImportance && matchLanguage && matchEmailStatus && matchCreator && matchCreatedFrom && matchCreatedTo && matchMetDateFrom && matchMetDateTo
  })

  const sorted = sortField
    ? [...filtered].sort((a, b) => {
        let va: string, vb: string
        if (sortField === 'tag') {
          va = a.contact_tags.map(ct => ct.tags?.name ?? '').sort().join(',')
          vb = b.contact_tags.map(ct => ct.tags?.name ?? '').sort().join(',')
        } else if (sortField === 'created_at') {
          va = a.created_at
          vb = b.created_at
        } else if (sortField === 'last_activity_at') {
          va = a.last_activity_at
          vb = b.last_activity_at
        } else {
          va = a[sortField] ?? ''
          vb = b[sortField] ?? ''
        }
        if (!va && !vb) return 0
        if (!va) return 1
        if (!vb) return -1
        return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
      })
    : filtered

  const hasFilter = !!(query || metQuery || selectedTags.length > 0 || selectedCountries.length > 0 || selectedImportance || selectedLanguage || selectedEmailStatus || selectedCreators.length > 0 || createdFrom || createdTo || metDateFrom || metDateTo)
  const visibleColCount = 2 + Object.values(visibleCols).filter(Boolean).length // checkbox + name + visible cols
  const isBlacklisted = (c: Contact) => c.contact_tags.some((ct) => ct.tags?.is_email_blacklist === true)
  const isEmailable = (c: Contact) => !!c.email && !c.email_status && !c.email_opt_out && !isBlacklisted(c)
  const emailPool = selectedIds.size > 0 ? sorted.filter(c => selectedIds.has(c.id)) : sorted
  const emailTargets = emailPool.filter(isEmailable)
  const uniqueEmailCount = new Set(emailTargets.map((c) => c.email!.trim().toLowerCase())).size
  const showEmailBtn = emailTargets.length > 0 && (selectedIds.size > 0 || hasFilter)
  // Exclusion breakdown — single-bucket per contact, blacklist FIRST so that
  // a blacklisted contact is always counted as blacklist regardless of whether
  // they also have no email / opt_out / etc. (matches user mental model: a
  // blacklist tag means "always exclude this person", everything else is moot.)
  // Priority: blacklist > no_email > unsub > bounced > transient.
  const excludedBlacklist = emailPool.filter(c => isBlacklisted(c)).length
  const excludedNoEmail = emailPool.filter(c => !isBlacklisted(c) && !c.email).length
  const excludedUnsub = emailPool.filter(c => !isBlacklisted(c) && c.email && (c.email_opt_out || c.email_status === 'unsubscribed')).length
  const excludedBounced = emailPool.filter(c => !isBlacklisted(c) && c.email && !c.email_opt_out && (c.email_status === 'bounced' || c.email_status === 'invalid')).length
  const excludedTransient = emailPool.filter(c => !isBlacklisted(c) && c.email && !c.email_opt_out && (c.email_status === 'deferred' || c.email_status === 'mailbox_full' || c.email_status === 'sender_blocked' || c.email_status === 'recipient_blocked')).length
  const excludedTotal = excludedNoEmail + excludedBlacklist + excludedUnsub + excludedBounced + excludedTransient
  const excludedBreakdownParts: string[] = []
  if (excludedBlacklist > 0) excludedBreakdownParts.push(t('emailExcludedBlacklist', { count: excludedBlacklist }))
  if (excludedNoEmail > 0) excludedBreakdownParts.push(t('emailExcludedNoEmail', { count: excludedNoEmail }))
  if (excludedUnsub > 0) excludedBreakdownParts.push(t('emailExcludedUnsub', { count: excludedUnsub }))
  if (excludedBounced > 0) excludedBreakdownParts.push(t('emailExcludedBounced', { count: excludedBounced }))
  if (excludedTransient > 0) excludedBreakdownParts.push(t('emailExcludedTransient', { count: excludedTransient }))
  const excludedBreakdown = excludedBreakdownParts.join('、')
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (selectedIds.size === paginated.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(paginated.map((c) => c.id)))
    }
  }

  async function handleCreateList() {
    if (!listForm.name.trim()) {
      setListError(t('listNameRequired'))
      return
    }
    // Source IDs: emailable subset (same rules as 寄信), so blacklist /
    // opt-out / no-email / bad-status contacts never enter the list.
    const sourceIds = emailTargets.map((c) => c.id)
    if (sourceIds.length === 0) {
      setListError(t('listNoContacts'))
      return
    }
    setListCreating(true)
    setListError(null)
    try {
      const res = await fetch('/api/newsletter/lists/from-contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: listForm.name.trim(),
          description: listForm.description.trim() || undefined,
          contactIds: sourceIds,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setListError(data.error ?? t('listCreateFailed'))
        return
      }
      setListModalOpen(false)
      setSelectedIds(new Set())
      router.push(`/admin/newsletter/lists/${data.list_id}`)
    } catch (e) {
      setListError(e instanceof Error ? e.message : t('listCreateFailed'))
    } finally {
      setListCreating(false)
    }
  }

  async function handleBatchSave() {
    setBatchSaving(true)
    const supabase = createBrowserSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase.from('users').select('id').eq('email', user!.email!).single()
    const ids = Array.from(selectedIds)

    const updateFields: Record<string, unknown> = {}
    if (batchForm.met_at) updateFields.met_at = batchForm.met_at
    if (batchForm.met_date) updateFields.met_date = batchForm.met_date
    if (batchForm.referred_by) updateFields.referred_by = batchForm.referred_by
    if (batchForm.company) updateFields.company = batchForm.company
    if (batchForm.country_code) updateFields.country_code = batchForm.country_code
    if (batchForm.language) updateFields.language = batchForm.language

    if (Object.keys(updateFields).length > 0) {
      await supabase.from('contacts').update(updateFields).in('id', ids)
    }

    if (batchForm._tag_ids.length > 0) {
      const tagInserts = ids.flatMap((contact_id) =>
        batchForm._tag_ids.map((tag_id) => ({ contact_id, tag_id }))
      )
      await supabase.from('contact_tags').upsert(tagInserts, { onConflict: 'contact_id,tag_id', ignoreDuplicates: true })
    }

    if (batchForm.met_at) {
      const logContent =
        t('batchLogMet', { at: batchForm.met_at, date: batchForm.met_date }) +
        (batchForm.referred_by ? t('batchLogReferredBy', { name: batchForm.referred_by }) : '')
      await supabase.from('interaction_logs').insert(
        ids.map((contact_id) => ({ contact_id, type: 'meeting', content: logContent, created_by: profile!.id }))
      )
    }

    setContacts((prev) => prev.map((c) => {
      if (!ids.includes(c.id)) return c
      const updated = { ...c }
      if (batchForm.met_at) updated.met_at = batchForm.met_at
      if (batchForm.company) updated.company = batchForm.company
      if (batchForm.country_code) updated.country_code = batchForm.country_code
      if (batchForm.language) updated.language = batchForm.language
      if (batchForm._tag_ids.length > 0) {
        const existingTagIds = c.contact_tags.map((ct) => ct.tags?.id)
        const newTags = batchForm._tag_ids
          .filter((tid) => !existingTagIds.includes(tid))
          .map((tid) => ({ tags: allTags.find((t) => t.id === tid)! }))
          .filter((t) => t.tags)
        updated.contact_tags = [...c.contact_tags, ...newTags]
      }
      return updated
    }))

    setBatchSaving(false)
    setBatchModalOpen(false)
    setSelectedIds(new Set())
    setBatchForm({ met_at: '', met_date: '', referred_by: '', company: '', country_code: '', language: '', _tag_ids: [] })
  }

  async function handleLinkedInUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLiParsing(true)
    setAddDropOpen(false)
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const result = reader.result as string
          resolve(result.split(',')[1])
        }
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const res = await fetch('/api/linkedin/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64 }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error ?? t('parseFailed'))
      sessionStorage.setItem('linkedin_prefill', JSON.stringify(data))
      const cardParam = data.card_img_url ? `&card_img_url=${encodeURIComponent(data.card_img_url)}` : ''
      router.push(`/contacts/new?source=linkedin${cardParam}`)
    } catch (err) {
      alert(t('linkedinParseFailed') + (err instanceof Error ? err.message : String(err)))
    } finally {
      setLiParsing(false)
      if (liInputRef.current) liInputRef.current.value = ''
    }
  }

  function exportData(format: 'xlsx' | 'csv') {
    const rows = sorted.map((c) => ({
      [t('name')]: c.name ?? '',
      [t('company')]: c.company ?? '',
      [t('jobTitle')]: c.job_title ?? '',
      Email: c.email ?? '',
      [t('phone')]: c.phone ?? '',
      Tags: c.contact_tags.map((ct) => ct.tags?.name).filter(Boolean).join(', '),
      [t('creator')]: c.users?.display_name ?? '',
      [t('createdAt')]: new Date(c.created_at).toLocaleDateString(),
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, t('title'))
    XLSX.writeFile(wb, `contacts.${format}`)
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('title')}</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-gray-500 dark:text-gray-400">{tc('total', { count: sorted.length })}</span>
          <span className="hidden sm:inline text-sm text-gray-400 dark:text-gray-500">{tc('page', { current: page, total: totalPages })}</span>
          <button
            onClick={() => canExport && exportData('xlsx')}
            disabled={!canExport}
            title={!canExport ? t('exportNoPermission') : undefined}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download size={14} /> Excel
          </button>
          <button
            onClick={() => canExport && exportData('csv')}
            disabled={!canExport}
            title={!canExport ? t('exportNoPermission') : undefined}
            className="hidden sm:flex items-center gap-1.5 text-sm px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download size={14} /> CSV
          </button>
          <Link
            href="/contacts/batch-upload"
            className="hidden sm:flex items-center gap-1.5 text-sm px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <Plus size={14} /> {t('batchUpload')}
          </Link>
          {showEmailBtn && (
            <button
              onClick={() => {
                // Dedupe by email so we send once per unique address; multiple
                // CRM contacts sharing one email collapse to one send.
                const seen = new Set<string>()
                const deduped: typeof emailTargets = []
                for (const c of emailTargets) {
                  const lc = c.email!.trim().toLowerCase()
                  if (seen.has(lc)) continue
                  seen.add(lc)
                  deduped.push(c)
                }
                sessionStorage.setItem('emailRecipients', JSON.stringify(deduped.map(c => c.id)))
                router.push('/email/compose')
              }}
              title={excludedTotal > 0 ? t('emailExcludedTooltip', { breakdown: excludedBreakdown }) : undefined}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              <Mail size={14} />
              {t('emailButtonLabel', { count: uniqueEmailCount })}
              {excludedTotal > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded bg-green-800/50 dark:bg-green-900/70">
                  {t('emailExcludedBadge', { count: excludedTotal })}
                </span>
              )}
            </button>
          )}
          {selectedIds.size > 0 && (
            <button
              onClick={() => setBatchModalOpen(true)}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600"
            >
              <Check size={14} /> 批次編輯（{selectedIds.size}）
            </button>
          )}
          {canNewsletter && (selectedIds.size > 0 || hasFilter) && emailTargets.length > 0 && (
            <button
              onClick={() => { setListForm({ name: '', description: '' }); setListError(null); setListModalOpen(true) }}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700"
              title={selectedIds.size === 0 ? t('createListFromFilterHint') : undefined}
            >
              <Users size={14} /> {t('createListButton', { count: emailTargets.length })}
            </button>
          )}
          <div className="relative">
            <button
              onClick={() => setAddDropOpen(v => !v)}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              disabled={liParsing}
            >
              {liParsing ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              {liParsing ? t('parsing') : t('new')}
              <ChevronDown size={12} className={`transition-transform ${addDropOpen ? 'rotate-180' : ''}`} />
            </button>
            {addDropOpen && (
              <div className="absolute right-0 top-full mt-1 w-44 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20 py-1">
                <Link
                  href="/contacts/new"
                  className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                  onClick={() => setAddDropOpen(false)}
                >
                  <Plus size={14} /> 新增聯絡人
                </Link>
                <button
                  className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 w-full text-left"
                  onClick={() => liInputRef.current?.click()}
                >
                  <Linkedin size={14} className="text-blue-600" /> LinkedIn 截圖
                </button>
              </div>
            )}
            <input ref={liInputRef} type="file" accept="image/*" className="hidden" onChange={handleLinkedInUpload} />
          </div>
        </div>
      </div>

      {showEmailBtn && excludedTotal > 0 && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 text-xs text-blue-800 dark:text-blue-300 flex items-start gap-2">
          <Mail size={14} className="mt-0.5 shrink-0" />
          <div>
            {t('emailExcludedBanner', { sending: emailTargets.length, uniqueEmails: uniqueEmailCount, excluded: excludedTotal })}
            <span className="text-blue-600 dark:text-blue-400 ml-1">{excludedBreakdown}</span>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            placeholder={t('searchPlaceholder')}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1) }}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Tag filter dropdown */}
        <div className="relative">
          <button
            onClick={() => { setTagDropdownOpen((v) => !v); setCountryDropdownOpen(false) }}
            className="flex items-center gap-2 text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            {t('tagFilter')}
            {selectedTags.length > 0 && (
              <span className="bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-xs px-1.5 py-0.5 rounded-full">
                {selectedTags.length}
              </span>
            )}
            <ChevronDown size={14} />
          </button>
          {tagDropdownOpen && (
            <div className="absolute top-full mt-1 left-0 z-10 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-40">
              {allTags.length === 0 && (
                <p className="px-3 py-2 text-xs text-gray-400">{t('noTagsMatch')}</p>
              )}
              {allTags.map((tag) => (
                <button
                  key={tag.id}
                  onClick={() => toggleTag(tag.id)}
                  className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-800 ${
                    selectedTags.includes(tag.id) ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-700 dark:text-gray-300'
                  }`}
                >
                  <span className={`w-3 h-3 border rounded ${selectedTags.includes(tag.id) ? 'bg-blue-500 border-blue-500' : 'border-gray-300 dark:border-gray-600'}`} />
                  {tag.name}
                </button>
              ))}
              {selectedTags.length > 0 && (
                <button
                  onClick={() => setSelectedTags([])}
                  className="w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:text-gray-600 border-t border-gray-100 dark:border-gray-700 mt-1 pt-1"
                >
                  {t('clearFilter')}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Country filter dropdown */}
        <div className="relative">
          <button
            onClick={() => { setCountryDropdownOpen((v) => !v); setTagDropdownOpen(false) }}
            className="flex items-center gap-2 text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            {t('countryFilter')}
            {selectedCountries.length > 0 && (
              <span className="bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-xs px-1.5 py-0.5 rounded-full">
                {selectedCountries.length}
              </span>
            )}
            <ChevronDown size={14} />
          </button>
          {countryDropdownOpen && (
            <div className="absolute top-full mt-1 left-0 z-10 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-44 max-h-60 overflow-y-auto">
              {allCountries.map((country) => (
                <button
                  key={country.code}
                  onClick={() => toggleCountry(country.code)}
                  className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-800 ${
                    selectedCountries.includes(country.code) ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-700 dark:text-gray-300'
                  }`}
                >
                  <span className={`w-3 h-3 border rounded shrink-0 ${selectedCountries.includes(country.code) ? 'bg-blue-500 border-blue-500' : 'border-gray-300 dark:border-gray-600'}`} />
                  <span>{country.emoji}</span>
                  {country.name_zh}
                </button>
              ))}
              <button
                onClick={() => toggleCountry('__other__')}
                className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-800 border-t border-gray-100 dark:border-gray-700 mt-1 pt-1 ${
                  selectedCountries.includes('__other__') ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                <span className={`w-3 h-3 border rounded shrink-0 ${selectedCountries.includes('__other__') ? 'bg-blue-500 border-blue-500' : 'border-gray-300 dark:border-gray-600'}`} />
                {t('countryUnknown')}
              </button>
              {selectedCountries.length > 0 && (
                <button
                  onClick={() => setSelectedCountries([])}
                  className="w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:text-gray-600 border-t border-gray-100 dark:border-gray-700 mt-1 pt-1"
                >
                  {t('clearFilter')}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Importance filter dropdown */}
        <div className="relative">
          <button
            onClick={() => { setImportanceDropdownOpen((v) => !v); setTagDropdownOpen(false); setCountryDropdownOpen(false) }}
            className="flex items-center gap-2 text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            {t('importanceFilter')}
            {selectedImportance && (
              <span className="bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 text-xs px-1.5 py-0.5 rounded-full">1</span>
            )}
            <ChevronDown size={14} />
          </button>
          {importanceDropdownOpen && (
            <div className="absolute top-full mt-1 left-0 z-10 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-36">
              {[
                { value: '', label: 'ALL' },
                { value: 'high', label: 'H' },
                { value: 'medium', label: 'M' },
                { value: 'low', label: 'L' },
              ].map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => { setSelectedImportance(value); setImportanceDropdownOpen(false); setPage(1) }}
                  className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-800 ${
                    selectedImportance === value ? 'text-green-600 dark:text-green-400 font-medium' : 'text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {value && <ImportanceDots value={value} />}
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Language filter dropdown */}
        <div className="relative">
          <button
            onClick={() => { setLanguageDropdownOpen((v) => !v); setTagDropdownOpen(false); setCountryDropdownOpen(false); setImportanceDropdownOpen(false) }}
            className="flex items-center gap-2 text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            {t('languageFilter')}
            {selectedLanguage && (
              <span className="bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-xs px-1.5 py-0.5 rounded-full">1</span>
            )}
            <ChevronDown size={14} />
          </button>
          {languageDropdownOpen && (
            <div className="absolute top-full mt-1 left-0 z-10 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-36">
              {[
                { value: '', label: 'ALL' },
                { value: 'chinese', label: t('languageChinese') },
                { value: 'english', label: 'EN' },
                { value: 'japanese', label: t('languageJapanese') },
              ].map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => { setSelectedLanguage(value); setLanguageDropdownOpen(false); setPage(1) }}
                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 ${
                    selectedLanguage === value ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Email Status filter dropdown */}
        <div className="relative">
          <button
            onClick={() => { setEmailStatusDropdownOpen((v) => !v); setTagDropdownOpen(false); setCountryDropdownOpen(false); setImportanceDropdownOpen(false); setLanguageDropdownOpen(false); setCreatorDropdownOpen(false); setMetDateDropdownOpen(false) }}
            className="flex items-center gap-2 text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            {t('email')}
            {selectedEmailStatus && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                selectedEmailStatus === 'bounced' ? 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300' :
                selectedEmailStatus === 'unsubscribed' ? 'bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300' :
                selectedEmailStatus === 'invalid' ? 'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300' :
                'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300'
              }`}>1</span>
            )}
            <ChevronDown size={14} />
          </button>
          {emailStatusDropdownOpen && (
            <div className="absolute top-full mt-1 left-0 z-10 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-40">
              {[
                { value: '', label: 'ALL', dot: null },
                { value: 'ok', label: t('emailStatusOk'), dot: 'bg-green-500' },
                { value: 'bounced', label: t('emailStatusBounced'), dot: 'bg-red-500' },
                { value: 'invalid', label: t('emailStatusInvalid'), dot: 'bg-yellow-500' },
                { value: 'unsubscribed', label: t('emailStatusUnsubscribed'), dot: 'bg-orange-400' },
                { value: 'deferred', label: t('emailStatusDeferred'), dot: 'bg-yellow-400' },
                { value: 'mailbox_full', label: t('emailStatusMailboxFull'), dot: 'bg-yellow-500' },
                { value: 'sender_blocked', label: t('emailStatusSenderBlocked'), dot: 'bg-purple-500' },
                { value: 'recipient_blocked', label: t('emailStatusRecipientBlocked'), dot: 'bg-purple-400' },
              ].map(({ value, label, dot }) => (
                <button
                  key={value}
                  onClick={() => { setSelectedEmailStatus(value); setEmailStatusDropdownOpen(false); setPage(1) }}
                  className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-800 ${
                    selectedEmailStatus === value ? 'font-medium' : 'text-gray-700 dark:text-gray-300'
                  } ${value === 'ok' && selectedEmailStatus === value ? 'text-green-600 dark:text-green-400' : ''}
                  ${value === 'bounced' && selectedEmailStatus === value ? 'text-red-600 dark:text-red-400' : ''}
                  ${value === 'unsubscribed' && selectedEmailStatus === value ? 'text-orange-600 dark:text-orange-400' : ''}
                  ${value === 'invalid' && selectedEmailStatus === value ? 'text-yellow-600 dark:text-yellow-400' : ''}
                  ${(value === 'deferred' || value === 'mailbox_full') && selectedEmailStatus === value ? 'text-yellow-600 dark:text-yellow-400' : ''}
                  ${(value === 'sender_blocked' || value === 'recipient_blocked') && selectedEmailStatus === value ? 'text-purple-600 dark:text-purple-400' : ''}`}
                >
                  {dot && <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />}
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Creator filter dropdown */}
        <div className="relative">
          <button
            onClick={() => { setCreatorDropdownOpen((v) => !v); setTagDropdownOpen(false); setCountryDropdownOpen(false); setImportanceDropdownOpen(false); setLanguageDropdownOpen(false); setEmailStatusDropdownOpen(false); setMetDateDropdownOpen(false) }}
            className="flex items-center gap-2 text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            {t('creator')}
            {selectedCreators.length > 0 && (
              <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded-full">
                {selectedCreators.length}
              </span>
            )}
            <ChevronDown size={14} />
          </button>
          {creatorDropdownOpen && (
            <div className="absolute top-full mt-1 left-0 z-10 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-44 max-h-64 overflow-y-auto">
              {creators.map((u) => (
                <button
                  key={u.id}
                  onClick={() => {
                    setSelectedCreators((prev) =>
                      prev.includes(u.id) ? prev.filter((x) => x !== u.id) : [...prev, u.id]
                    )
                    setPage(1)
                  }}
                  className="w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <span className={`w-3 h-3 border rounded shrink-0 ${selectedCreators.includes(u.id) ? 'bg-blue-500 border-blue-500' : 'border-gray-300 dark:border-gray-600'}`} />
                  <span className="text-gray-700 dark:text-gray-300 truncate">{u.display_name || '—'}</span>
                </button>
              ))}
              {selectedCreators.length > 0 && (
                <button
                  onClick={() => { setSelectedCreators([]); setPage(1) }}
                  className="w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:text-gray-600 border-t border-gray-100 dark:border-gray-700 mt-1 pt-1"
                >
                  {tc('clear')}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Created-at date range filter */}
        <div className="relative">
          <button
            onClick={() => { setCreatedDateDropdownOpen((v) => !v); setTagDropdownOpen(false); setCountryDropdownOpen(false); setImportanceDropdownOpen(false); setLanguageDropdownOpen(false); setEmailStatusDropdownOpen(false); setCreatorDropdownOpen(false); setMetDateDropdownOpen(false) }}
            className="flex items-center gap-2 text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            {t('createdAt')}
            {(createdFrom || createdTo) && (
              <span className="bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-xs px-1.5 py-0.5 rounded-full">1</span>
            )}
            <ChevronDown size={14} />
          </button>
          {createdDateDropdownOpen && (
            <div className="absolute top-full mt-1 left-0 z-10 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 min-w-56">
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <span className="w-6 shrink-0">{t('createdFrom')}</span>
                  <input
                    type="date"
                    value={createdFrom}
                    onChange={(e) => { setCreatedFrom(e.target.value); setPage(1) }}
                    className="flex-1 px-2 py-1 text-sm border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <span className="w-6 shrink-0">{t('createdTo')}</span>
                  <input
                    type="date"
                    value={createdTo}
                    onChange={(e) => { setCreatedTo(e.target.value); setPage(1) }}
                    className="flex-1 px-2 py-1 text-sm border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </label>
                {(createdFrom || createdTo) && (
                  <button
                    onClick={() => { setCreatedFrom(''); setCreatedTo(''); setPage(1) }}
                    className="text-left text-xs text-gray-400 hover:text-gray-600 border-t border-gray-100 dark:border-gray-700 pt-2 mt-1"
                  >
                    {t('clearFilter')}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Met-date date range filter */}
        <div className="relative">
          <button
            onClick={() => { setMetDateDropdownOpen((v) => !v); setTagDropdownOpen(false); setCountryDropdownOpen(false); setImportanceDropdownOpen(false); setLanguageDropdownOpen(false); setEmailStatusDropdownOpen(false); setCreatorDropdownOpen(false); setCreatedDateDropdownOpen(false) }}
            className="flex items-center gap-2 text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            {t('metDate')}
            {(metDateFrom || metDateTo) && (
              <span className="bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-xs px-1.5 py-0.5 rounded-full">1</span>
            )}
            <ChevronDown size={14} />
          </button>
          {metDateDropdownOpen && (
            <div className="absolute top-full mt-1 left-0 z-10 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 min-w-56">
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <span className="w-6 shrink-0">{t('createdFrom')}</span>
                  <input
                    type="date"
                    value={metDateFrom}
                    onChange={(e) => { setMetDateFrom(e.target.value); setPage(1) }}
                    className="flex-1 px-2 py-1 text-sm border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <span className="w-6 shrink-0">{t('createdTo')}</span>
                  <input
                    type="date"
                    value={metDateTo}
                    onChange={(e) => { setMetDateTo(e.target.value); setPage(1) }}
                    className="flex-1 px-2 py-1 text-sm border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </label>
                {(metDateFrom || metDateTo) && (
                  <button
                    onClick={() => { setMetDateFrom(''); setMetDateTo(''); setPage(1) }}
                    className="text-left text-xs text-gray-400 hover:text-gray-600 border-t border-gray-100 dark:border-gray-700 pt-2 mt-1"
                  >
                    {t('clearFilter')}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Met-at filter — datalist 給 dropdown 建議 + free text */}
        <input
          type="text"
          list="met-at-options"
          placeholder={t('metFilter')}
          value={metQuery}
          onChange={(e) => { setMetQuery(e.target.value); setPage(1) }}
          className="px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 w-36"
        />
        <datalist id="met-at-options">
          {metAtOptions.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>

        {/* Column visibility toggle */}
        <div className="relative hidden sm:block">
          <button
            onClick={() => setColumnsDropdownOpen((v) => !v)}
            className="flex items-center gap-2 text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            title="顯示/隱藏欄位"
          >
            <SlidersHorizontal size={14} />
          </button>
          {columnsDropdownOpen && (
            <div className="absolute top-full mt-1 right-0 z-10 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-36">
              {([
                ['company', t('company')],
                ['job_title', t('jobTitle')],
                ['email', 'Email'],
                ['tags', 'Tags'],
                ['met_at', t('metAt')],
                ['creator', t('creator')],
                ['created_at', t('createdAt')],
              ] as [ColKey, string][]).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => toggleCol(key)}
                  className="w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <span className={`w-3 h-3 border rounded shrink-0 ${visibleCols[key] ? 'bg-blue-500 border-blue-500' : 'border-gray-300 dark:border-gray-600'}`} />
                  <span className="text-gray-700 dark:text-gray-300">{label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Mobile card list */}
      <div className="sm:hidden">
        {loading ? (
          <p className="text-center text-sm text-gray-400 py-10">{tc('loading')}</p>
        ) : sorted.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-10">{t('noResults')}</p>
        ) : (
          <div className="space-y-3">
            {/* Mobile select-all bar (shown only when there are rows) */}
            <label className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={paginated.length > 0 && selectedIds.size === paginated.length}
                onChange={toggleSelectAll}
                className="w-4 h-4 rounded"
              />
              <span>
                {selectedIds.size === 0
                  ? t('selectAll')
                  : t('selectedCount', { count: selectedIds.size })}
              </span>
            </label>
            {paginated.map((c) => (
              <div
                key={c.id}
                className={`bg-white dark:bg-gray-900 rounded-xl border p-4 ${
                  selectedIds.has(c.id)
                    ? 'border-amber-400 dark:border-amber-600 bg-amber-50/40 dark:bg-amber-950/20'
                    : 'border-gray-200 dark:border-gray-700'
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Select checkbox */}
                  <label className="shrink-0 pt-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(c.id)}
                      onChange={() => toggleSelect(c.id)}
                      className="w-4 h-4 rounded"
                    />
                  </label>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <ImportanceDots value={c.importance} />
                          <Link href={`/contacts/${c.id}`} className="text-blue-600 dark:text-blue-400 font-semibold text-base hover:underline">
                            {c.name || '—'}
                          </Link>
                        </div>
                        {c.company && <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">{c.company}</p>}
                        {c.job_title && <p className="text-xs text-gray-500 dark:text-gray-500">{c.job_title}</p>}
                      </div>
                      {c.contact_tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 justify-end shrink-0">
                          {c.contact_tags.map((ct) => ct.tags && (
                            <span key={ct.tags.id} className="text-xs bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">
                              {ct.tags.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="mt-3 space-y-1">
                      {c.email && (
                        <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                          <span className="truncate">{c.email}</span>
                          <button onClick={() => copyEmail(c.email!)} className="text-gray-400 hover:text-blue-500 shrink-0">
                            {copiedEmail === c.email ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
                          </button>
                          {c.email_status === 'bounced' && <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800 shrink-0">{t('emailStatusBounced')}</span>}
                          {c.email_status === 'unsubscribed' && <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-800 shrink-0">{t('emailStatusUnsubscribed')}</span>}
                          {c.email_status === 'invalid' && <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-yellow-100 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800 shrink-0">{t('emailStatusInvalid')}</span>}
                          {c.email_status === 'deferred' && <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-yellow-100 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800 shrink-0">{t('emailStatusDeferred')}</span>}
                          {c.email_status === 'mailbox_full' && <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-yellow-100 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800 shrink-0">{t('emailStatusMailboxFull')}</span>}
                          {c.email_status === 'sender_blocked' && <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-800 shrink-0">{t('emailStatusSenderBlocked')}</span>}
                          {c.email_status === 'recipient_blocked' && <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-800 shrink-0">{t('emailStatusRecipientBlocked')}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Table (desktop) */}
      <div className="hidden sm:block bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <tr>
              <th className="px-3 py-3 w-8">
                <input
                  type="checkbox"
                  checked={paginated.length > 0 && selectedIds.size === paginated.length}
                  onChange={toggleSelectAll}
                  className="rounded"
                />
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">
                <button onClick={() => handleSort('name')} className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-gray-100 transition-colors">
                  {t('name')}
                  {sortField !== 'name' && <ChevronsUpDown size={12} className="text-gray-400" />}
                  {sortField === 'name' && sortDir === 'asc' && <ChevronUp size={12} className="text-blue-500" />}
                  {sortField === 'name' && sortDir === 'desc' && <ChevronDown size={12} className="text-blue-500" />}
                </button>
              </th>
              {visibleCols.company && (
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">
                  <button onClick={() => handleSort('company')} className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-gray-100 transition-colors">
                    {t('company')}
                    {sortField !== 'company' && <ChevronsUpDown size={12} className="text-gray-400" />}
                    {sortField === 'company' && sortDir === 'asc' && <ChevronUp size={12} className="text-blue-500" />}
                    {sortField === 'company' && sortDir === 'desc' && <ChevronDown size={12} className="text-blue-500" />}
                  </button>
                </th>
              )}
              {visibleCols.job_title && (
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">
                  <button onClick={() => handleSort('job_title')} className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-gray-100 transition-colors">
                    {t('jobTitle')}
                    {sortField !== 'job_title' && <ChevronsUpDown size={12} className="text-gray-400" />}
                    {sortField === 'job_title' && sortDir === 'asc' && <ChevronUp size={12} className="text-blue-500" />}
                    {sortField === 'job_title' && sortDir === 'desc' && <ChevronDown size={12} className="text-blue-500" />}
                  </button>
                </th>
              )}
              {visibleCols.email && (
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">
                  <button onClick={() => handleSort('email')} className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-gray-100 transition-colors">
                    Email
                    {sortField !== 'email' && <ChevronsUpDown size={12} className="text-gray-400" />}
                    {sortField === 'email' && sortDir === 'asc' && <ChevronUp size={12} className="text-blue-500" />}
                    {sortField === 'email' && sortDir === 'desc' && <ChevronDown size={12} className="text-blue-500" />}
                  </button>
                </th>
              )}
              {visibleCols.tags && (
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">
                  <button onClick={() => handleSort('tag')} className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-gray-100 transition-colors">
                    Tags
                    {sortField !== 'tag' && <ChevronsUpDown size={12} className="text-gray-400" />}
                    {sortField === 'tag' && sortDir === 'asc' && <ChevronUp size={12} className="text-blue-500" />}
                    {sortField === 'tag' && sortDir === 'desc' && <ChevronDown size={12} className="text-blue-500" />}
                  </button>
                </th>
              )}
              {visibleCols.met_at && (
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">{t('metAt')}</th>
              )}
              {visibleCols.creator && (
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">{t('creator')}</th>
              )}
              {visibleCols.created_at && (
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">
                  <button onClick={() => handleSort('created_at')} className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-gray-100 transition-colors">
                    {t('createdAt')}
                    {sortField !== 'created_at' && <ChevronsUpDown size={12} className="text-gray-400" />}
                    {sortField === 'created_at' && sortDir === 'asc' && <ChevronUp size={12} className="text-blue-500" />}
                    {sortField === 'created_at' && sortDir === 'desc' && <ChevronDown size={12} className="text-blue-500" />}
                  </button>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={visibleColCount} className="px-4 py-8 text-center text-gray-400">{tc('loading')}</td>
              </tr>
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={visibleColCount} className="px-4 py-8 text-center text-gray-400">{t('noResults')}</td>
              </tr>
            ) : (
              paginated.map((c) => (
                <tr key={c.id} className={`border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 ${selectedIds.has(c.id) ? 'bg-amber-50 dark:bg-amber-950/20' : ''}`}>
                  <td className="px-3 py-3">
                    <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSelect(c.id)} className="rounded" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <ImportanceDots value={c.importance} />
                      <Link href={`/contacts/${c.id}`} className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
                        {c.name || '—'}
                      </Link>
                    </div>
                  </td>
                  {visibleCols.company && <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{c.company || '—'}</td>}
                  {visibleCols.job_title && <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{c.job_title || '—'}</td>}
                  {visibleCols.email && <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                    {c.email ? (
                      <div className="flex flex-col gap-0.5">
                        <span className="flex items-center gap-1.5">
                          <span>{c.email}</span>
                          <button
                            onClick={() => copyEmail(c.email!)}
                            className="text-gray-400 hover:text-blue-500 transition-colors flex-shrink-0"
                            title={t('copyEmail')}
                          >
                            {copiedEmail === c.email ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
                          </button>
                        </span>
                        {c.email_status === 'bounced' && (
                          <span className="inline-flex w-fit text-xs font-medium px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800">{t('emailStatusBounced')}</span>
                        )}
                        {c.email_status === 'unsubscribed' && (
                          <span className="inline-flex w-fit text-xs font-medium px-1.5 py-0.5 rounded bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-800">{t('emailStatusUnsubscribed')}</span>
                        )}
                        {c.email_status === 'invalid' && (
                          <span className="inline-flex w-fit text-xs font-medium px-1.5 py-0.5 rounded bg-yellow-100 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800">{t('emailStatusInvalid')}</span>
                        )}
                        {c.email_status === 'deferred' && (
                          <span className="inline-flex w-fit text-xs font-medium px-1.5 py-0.5 rounded bg-yellow-100 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800">{t('emailStatusDeferred')}</span>
                        )}
                        {c.email_status === 'mailbox_full' && (
                          <span className="inline-flex w-fit text-xs font-medium px-1.5 py-0.5 rounded bg-yellow-100 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800">{t('emailStatusMailboxFull')}</span>
                        )}
                        {c.email_status === 'sender_blocked' && (
                          <span className="inline-flex w-fit text-xs font-medium px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-800">{t('emailStatusSenderBlocked')}</span>
                        )}
                        {c.email_status === 'recipient_blocked' && (
                          <span className="inline-flex w-fit text-xs font-medium px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-800">{t('emailStatusRecipientBlocked')}</span>
                        )}
                      </div>
                    ) : '—'}
                  </td>}
                  {visibleCols.tags && (
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {c.contact_tags.map((ct) => ct.tags && (
                          <span key={ct.tags.id} className="text-xs bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">
                            {ct.tags.name}
                          </span>
                        ))}
                      </div>
                    </td>
                  )}
                  {visibleCols.met_at && (
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{c.met_at || '—'}</td>
                  )}
                  {visibleCols.creator && (
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{c.users?.display_name || '—'}</td>
                  )}
                  {visibleCols.created_at && (
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                      {new Date(c.created_at).toLocaleDateString()}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>{/* end desktop table */}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 mt-4">
          <button
            onClick={() => setPage(1)}
            disabled={page === 1}
            className="px-2 py-1 text-sm rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40"
          >
            «
          </button>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-2 py-1 text-sm rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40"
          >
            ‹
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
            .reduce<(number | '…')[]>((acc, p, idx, arr) => {
              if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('…')
              acc.push(p)
              return acc
            }, [])
            .map((p, i) =>
              p === '…' ? (
                <span key={`ellipsis-${i}`} className="px-2 py-1 text-sm text-gray-400">…</span>
              ) : (
                <button
                  key={p}
                  onClick={() => setPage(p as number)}
                  className={`px-3 py-1 text-sm rounded border transition-colors ${
                    page === p
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  {p}
                </button>
              )
            )}
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-2 py-1 text-sm rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40"
          >
            ›
          </button>
          <button
            onClick={() => setPage(totalPages)}
            disabled={page === totalPages}
            className="px-2 py-1 text-sm rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40"
          >
            »
          </button>
        </div>
      )}
      {/* Batch Edit Modal */}
      {batchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{t('batchEditTitle')}</h2>
              <button onClick={() => setBatchModalOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><X size={18} /></button>
            </div>
            <p className="text-xs text-amber-600 dark:text-amber-400 mb-4">{t('batchEditHint', { count: selectedIds.size })}</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('metAt')}</label>
                  <input type="text" value={batchForm.met_at} onChange={(e) => setBatchForm((p) => ({ ...p, met_at: e.target.value }))}
                    placeholder={t('metAtPlaceholder')}
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('metDate')}</label>
                  <input type="date" value={batchForm.met_date} onChange={(e) => setBatchForm((p) => ({ ...p, met_date: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('referredBy')}</label>
                <input type="text" value={batchForm.referred_by} onChange={(e) => setBatchForm((p) => ({ ...p, referred_by: e.target.value }))}
                  placeholder={t('referredByPlaceholder')}
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('company')}</label>
                <input type="text" value={batchForm.company} onChange={(e) => setBatchForm((p) => ({ ...p, company: e.target.value }))}
                  placeholder="公司名（空白 = 不修改）"
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('countryFilter')}</label>
                  <select value={batchForm.country_code} onChange={(e) => setBatchForm((p) => ({ ...p, country_code: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">— 不修改 —</option>
                    {allCountries.map((c) => (
                      <option key={c.code} value={c.code}>{c.emoji} {c.name_zh}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('languageFilter')}</label>
                  <select value={batchForm.language} onChange={(e) => setBatchForm((p) => ({ ...p, language: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">— 不修改 —</option>
                    <option value="chinese">{t('languageChinese')}</option>
                    <option value="english">English</option>
                    <option value="japanese">{t('languageJapanese')}</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Tags（加入，不移除現有）</label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {allTags.map((tag) => {
                    const selected = batchForm._tag_ids.includes(tag.id)
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => setBatchForm((p) => ({
                          ...p,
                          _tag_ids: selected ? p._tag_ids.filter((id) => id !== tag.id) : [...p._tag_ids, tag.id],
                        }))}
                        className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                          selected
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:border-blue-400'
                        }`}
                      >
                        {tag.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setBatchModalOpen(false)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">
                {tc('cancel')}
              </button>
              <button onClick={handleBatchSave} disabled={batchSaving}
                className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {batchSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                {t('batchEditApply')}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Create-list Modal */}
      {listModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => !listCreating && setListModalOpen(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{t('createListTitle')}</h2>
              <button onClick={() => !listCreating && setListModalOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><X size={18} /></button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              {selectedIds.size > 0
                ? t('createListHint', { selected: selectedIds.size, uniqueEmails: uniqueEmailCount })
                : t('createListHintFiltered', { filtered: sorted.length, uniqueEmails: uniqueEmailCount })}
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  {t('createListNameLabel')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  autoFocus
                  value={listForm.name}
                  onChange={(e) => setListForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder={t('createListNamePlaceholder')}
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('createListDescLabel')}</label>
                <textarea
                  value={listForm.description}
                  onChange={(e) => setListForm((p) => ({ ...p, description: e.target.value }))}
                  rows={2}
                  placeholder={t('createListDescPlaceholder')}
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
                />
              </div>
            </div>
            {listError && (
              <div className="mt-3 px-3 py-2 text-xs text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
                {listError}
              </div>
            )}
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setListModalOpen(false)} disabled={listCreating}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
                {tc('cancel')}
              </button>
              <button onClick={handleCreateList} disabled={listCreating || !listForm.name.trim()}
                className="flex items-center gap-1.5 px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50">
                {listCreating ? <Loader2 size={14} className="animate-spin" /> : <Users size={14} />}
                {t('createListSubmit')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
