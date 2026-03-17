'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { Search, Download, Plus, ChevronDown, ChevronUp, ChevronsUpDown, Copy, Check } from 'lucide-react'
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
  created_at: string
  users: { display_name: string | null } | null
  contact_tags: { tags: Tag }[]
}

const PAGE_SIZE = 20

export default function ContactsPage() {
  const t = useTranslations('contacts')
  const tc = useTranslations('common')
  const searchParams = useSearchParams()

  const [contacts, setContacts] = useState<Contact[]>([])
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [allCountries, setAllCountries] = useState<Country[]>([])
  const [query, setQuery] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false)
  const [selectedCountries, setSelectedCountries] = useState<string[]>([])
  const [countryDropdownOpen, setCountryDropdownOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null)
  const [sortField, setSortField] = useState<'job_title' | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

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
    const [{ data: contactData }, { data: tagData }, { data: countryData }] = await Promise.all([
      supabase
        .from('contacts')
        .select('id, name, company, job_title, email, phone, country_code, created_at, users(display_name), contact_tags(tags(id, name))')
        .order('created_at', { ascending: false }),
      supabase.from('tags').select('id, name').order('name'),
      supabase.from('countries').select('code, name_zh, emoji').eq('is_active', true).order('name_zh'),
    ])
    const tags = tagData ?? []
    setContacts((contactData as Contact[]) ?? [])
    setAllTags(tags)
    setAllCountries(countryData ?? [])
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

  function handleJobTitleSort() {
    if (sortField !== 'job_title') {
      setSortField('job_title')
      setSortDir('asc')
    } else if (sortDir === 'asc') {
      setSortDir('desc')
    } else {
      setSortField(null)
    }
  }

  const filtered = contacts.filter((c) => {
    const matchQuery =
      !query ||
      c.name?.toLowerCase().includes(query.toLowerCase()) ||
      c.company?.toLowerCase().includes(query.toLowerCase())
    const matchTags =
      selectedTags.length === 0 ||
      selectedTags.every((tid) => c.contact_tags.some((ct) => ct.tags?.id === tid))
    const matchCountry =
      selectedCountries.length === 0 ||
      selectedCountries.some((code) =>
        code === '__other__' ? !c.country_code : c.country_code === code
      )
    return matchQuery && matchTags && matchCountry
  })

  const sorted = sortField
    ? [...filtered].sort((a, b) => {
        const va = a.job_title ?? ''
        const vb = b.job_title ?? ''
        if (!va && !vb) return 0
        if (!va) return 1
        if (!vb) return -1
        return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
      })
    : filtered

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('title')}</h1>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500 dark:text-gray-400">{tc('total', { count: sorted.length })}</span>
          <span className="text-sm text-gray-400 dark:text-gray-500">{tc('page', { page, total: totalPages })}</span>
          <button
            onClick={() => exportData('xlsx')}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <Download size={14} /> Excel
          </button>
          <button
            onClick={() => exportData('csv')}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <Download size={14} /> CSV
          </button>
          <Link
            href="/contacts/batch-upload"
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <Plus size={14} /> {t('batchUpload')}
          </Link>
          <Link
            href="/contacts/new"
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus size={14} /> {t('new')}
          </Link>
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
                {t('countryOther')}
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
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <tr>
              {[t('name'), t('company')].map((h) => (
                <th key={h} className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">{h}</th>
              ))}
              <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">
                <button
                  onClick={handleJobTitleSort}
                  className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                >
                  {t('jobTitle')}
                  {sortField !== 'job_title' && <ChevronsUpDown size={12} className="text-gray-400" />}
                  {sortField === 'job_title' && sortDir === 'asc' && <ChevronUp size={12} className="text-blue-500" />}
                  {sortField === 'job_title' && sortDir === 'desc' && <ChevronDown size={12} className="text-blue-500" />}
                </button>
              </th>
              {['Email', t('phone'), 'Tags', t('creator'), t('createdAt')].map((h) => (
                <th key={h} className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">{h}</th>
              ))}
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
                <tr key={c.id} className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3">
                    <Link href={`/contacts/${c.id}`} className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
                      {c.name || '—'}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{c.company || '—'}</td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{c.job_title || '—'}</td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                    {c.email ? (
                      <span className="flex items-center gap-1.5">
                        <span>{c.email}</span>
                        <button
                          onClick={() => copyEmail(c.email!)}
                          className="text-gray-400 hover:text-blue-500 transition-colors flex-shrink-0"
                          title="複製 Email"
                        >
                          {copiedEmail === c.email ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
                        </button>
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{c.phone || '—'}</td>
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
      </div>

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
    </div>
  )
}
