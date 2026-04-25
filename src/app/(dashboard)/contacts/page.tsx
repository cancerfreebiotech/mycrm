'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { Search, Download, Plus, ChevronDown, ChevronUp, ChevronsUpDown, Copy, Check, Loader2, X, Linkedin, Mail } from 'lucide-react'
import * as XLSX from 'xlsx'

interface Tag {
  id: string
  name: string
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
  created_at: string
  last_activity_at: string
  importance: string
  language: string | null
  email_status: 'bounced' | 'unsubscribed' | 'invalid' | 'deferred' | 'mailbox_full' | 'sender_blocked' | 'recipient_blocked' | null
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
  const [batchForm, setBatchForm] = useState({ met_at: '', met_date: new Date().toISOString().slice(0, 10), referred_by: '' })
  const [batchSaving, setBatchSaving] = useState(false)
  const [canExport, setCanExport] = useState(false)

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

  const filtered = contacts.filter((c) => {
    const matchQuery =
      !query ||
      c.name?.toLowerCase().includes(query.toLowerCase()) ||
      c.company?.toLowerCase().includes(query.toLowerCase()) ||
      c.email?.toLowerCase().includes(query.toLowerCase())
    const matchMet =
      !metQuery || c.met_at?.toLowerCase().includes(metQuery.toLowerCase())
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
    return matchQuery && matchMet && matchTags && matchCountry && matchImportance && matchLanguage && matchEmailStatus && matchCreator
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

  const emailable = sorted.filter(c => c.email && !c.email_status)
  const hasFilter = !!(query || metQuery || selectedTags.length > 0 || selectedCountries.length > 0 || selectedImportance || selectedLanguage || selectedEmailStatus || selectedCreators.length > 0)
  const selectedEmailable = selectedIds.size > 0
    ? sorted.filter(c => selectedIds.has(c.id) && c.email && !c.email_status)
    : []
  const emailTargets = selectedIds.size > 0 ? selectedEmailable : emailable
  const showEmailBtn = emailTargets.length > 0 && (selectedIds.size > 0 || hasFilter)
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

  async function handleBatchSave() {
    setBatchSaving(true)
    const supabase = createBrowserSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase.from('users').select('id').eq('email', user!.email!).single()
    const ids = Array.from(selectedIds)
    await supabase.from('contacts').update({
      met_at: batchForm.met_at || null,
      met_date: batchForm.met_date || null,
      referred_by: batchForm.referred_by || null,
    }).in('id', ids)
    const logContent =
      t('batchLogMet', { at: batchForm.met_at || '—', date: batchForm.met_date }) +
      (batchForm.referred_by ? t('batchLogReferredBy', { name: batchForm.referred_by }) : '')
    await supabase.from('interaction_logs').insert(
      ids.map((contact_id) => ({ contact_id, type: 'meeting', content: logContent, created_by: profile!.id }))
    )
    setContacts((prev) => prev.map((c) =>
      ids.includes(c.id)
        ? { ...c, met_at: batchForm.met_at || null }
        : c
    ))
    setBatchSaving(false)
    setBatchModalOpen(false)
    setSelectedIds(new Set())
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
                sessionStorage.setItem('emailRecipients', JSON.stringify(emailTargets.map(c => c.id)))
                router.push('/email/compose')
              }}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              <Mail size={14} /> 寄信給 {emailTargets.length} 人
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
            onClick={() => { setEmailStatusDropdownOpen((v) => !v); setTagDropdownOpen(false); setCountryDropdownOpen(false); setImportanceDropdownOpen(false); setLanguageDropdownOpen(false); setCreatorDropdownOpen(false) }}
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
            onClick={() => { setCreatorDropdownOpen((v) => !v); setTagDropdownOpen(false); setCountryDropdownOpen(false); setImportanceDropdownOpen(false); setLanguageDropdownOpen(false); setEmailStatusDropdownOpen(false) }}
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

        {/* Met-at filter */}
        <input
          type="text"
          placeholder={t('metFilter')}
          value={metQuery}
          onChange={(e) => { setMetQuery(e.target.value); setPage(1) }}
          className="px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 w-36"
        />
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
              {([
                [t('name'), 'name'],
                [t('company'), 'company'],
                [t('jobTitle'), 'job_title'],
                ['Email', 'email'],
              ] as [string, SortField][]).map(([label, field]) => (
                <th key={field} className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">
                  <button
                    onClick={() => handleSort(field)}
                    className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                  >
                    {label}
                    {sortField !== field && <ChevronsUpDown size={12} className="text-gray-400" />}
                    {sortField === field && sortDir === 'asc' && <ChevronUp size={12} className="text-blue-500" />}
                    {sortField === field && sortDir === 'desc' && <ChevronDown size={12} className="text-blue-500" />}
                  </button>
                </th>
              ))}
              <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">
                <button
                  onClick={() => handleSort('tag')}
                  className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                >
                  Tags
                  {sortField !== 'tag' && <ChevronsUpDown size={12} className="text-gray-400" />}
                  {sortField === 'tag' && sortDir === 'asc' && <ChevronUp size={12} className="text-blue-500" />}
                  {sortField === 'tag' && sortDir === 'desc' && <ChevronDown size={12} className="text-blue-500" />}
                </button>
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">{t('creator')}</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">
                <button
                  onClick={() => handleSort('created_at')}
                  className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                >
                  {t('createdAt')}
                  {sortField !== 'created_at' && <ChevronsUpDown size={12} className="text-gray-400" />}
                  {sortField === 'created_at' && sortDir === 'asc' && <ChevronUp size={12} className="text-blue-500" />}
                  {sortField === 'created_at' && sortDir === 'desc' && <ChevronDown size={12} className="text-blue-500" />}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400">{tc('loading')}</td>
              </tr>
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400">{t('noResults')}</td>
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
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{c.company || '—'}</td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{c.job_title || '—'}</td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
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
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {c.contact_tags.map((ct) => ct.tags && (
                        <span key={ct.tags.id} className="text-xs bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">
                          {ct.tags.name}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{c.users?.display_name || '—'}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                    {new Date(c.created_at).toLocaleDateString()}
                  </td>
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
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('referredBy')}</label>
                <input type="text" value={batchForm.referred_by} onChange={(e) => setBatchForm((p) => ({ ...p, referred_by: e.target.value }))}
                  placeholder={t('referredByPlaceholder')}
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
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
    </div>
  )
}
