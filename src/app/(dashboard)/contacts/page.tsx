'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { Search, Download, Plus, ChevronDown } from 'lucide-react'
import * as XLSX from 'xlsx'

interface Tag {
  id: string
  name: string
}

interface Contact {
  id: string
  name: string | null
  company: string | null
  job_title: string | null
  email: string | null
  phone: string | null
  created_at: string
  users: { display_name: string | null } | null
  contact_tags: { tags: Tag }[]
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [query, setQuery] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAll()
  }, [])

  async function fetchAll() {
    const supabase = createBrowserSupabaseClient()
    const [{ data: contactData }, { data: tagData }] = await Promise.all([
      supabase
        .from('contacts')
        .select('id, name, company, job_title, email, phone, created_at, users(display_name), contact_tags(tags(id, name))')
        .order('created_at', { ascending: false }),
      supabase.from('tags').select('id, name').order('name'),
    ])
    setContacts((contactData as Contact[]) ?? [])
    setAllTags(tagData ?? [])
    setLoading(false)
  }

  function toggleTag(tagId: string) {
    setSelectedTags((prev) =>
      prev.includes(tagId) ? prev.filter((t) => t !== tagId) : [...prev, tagId]
    )
  }

  const filtered = contacts.filter((c) => {
    const matchQuery =
      !query ||
      c.name?.toLowerCase().includes(query.toLowerCase()) ||
      c.company?.toLowerCase().includes(query.toLowerCase())
    const matchTags =
      selectedTags.length === 0 ||
      selectedTags.every((tid) => c.contact_tags.some((ct) => ct.tags?.id === tid))
    return matchQuery && matchTags
  })

  function exportData(format: 'xlsx' | 'csv') {
    const rows = filtered.map((c) => ({
      姓名: c.name ?? '',
      公司: c.company ?? '',
      職稱: c.job_title ?? '',
      Email: c.email ?? '',
      電話: c.phone ?? '',
      Tags: c.contact_tags.map((ct) => ct.tags?.name).filter(Boolean).join(', '),
      建立者: c.users?.display_name ?? '',
      建立時間: new Date(c.created_at).toLocaleDateString('zh-TW'),
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '聯絡人')
    XLSX.writeFile(wb, `contacts.${format}`)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">聯絡人</h1>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500 dark:text-gray-400">共 {filtered.length} 筆</span>
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
            <Plus size={14} /> 批次上傳
          </Link>
          <Link
            href="/contacts/new"
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus size={14} /> 新增聯絡人
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            placeholder="搜尋姓名或公司..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Tag filter dropdown */}
        <div className="relative">
          <button
            onClick={() => setTagDropdownOpen((v) => !v)}
            className="flex items-center gap-2 text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Tags 篩選
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
                <p className="px-3 py-2 text-xs text-gray-400">尚無 Tags</p>
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
                  清除篩選
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
              {['姓名', '公司', '職稱', 'Email', '電話', 'Tags', '建立者', '建立時間'].map((h) => (
                <th key={h} className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400">載入中...</td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400">無符合結果</td>
              </tr>
            ) : (
              filtered.map((c) => (
                <tr key={c.id} className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3">
                    <Link href={`/contacts/${c.id}`} className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
                      {c.name || '—'}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{c.company || '—'}</td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{c.job_title || '—'}</td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{c.email || '—'}</td>
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
                    {new Date(c.created_at).toLocaleDateString('zh-TW')}
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
