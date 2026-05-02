'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Loader2, ArrowLeft, Mail, Users } from 'lucide-react'
import { PermissionGate } from '@/components/PermissionGate'

interface ContactRef {
  id: string
  name: string | null
  company: string | null
  job_title: string | null
}

interface SharedEmailGroup {
  email: string
  count: number
  contacts: ContactRef[]
}

interface ApiResponse {
  total_groups: number
  total_contacts_with_shared_email: number
  groups: SharedEmailGroup[]
}

export default function SharedEmailsPage() {
  const t = useTranslations('sharedEmails')
  const tc = useTranslations('common')
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/contacts/shared-emails')
        const body = await res.json()
        if (!res.ok) {
          setError(body.error ?? t('loadFailed'))
          return
        }
        setData(body as ApiResponse)
      } catch (e) {
        setError(e instanceof Error ? e.message : t('loadFailed'))
      } finally {
        setLoading(false)
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = data?.groups.filter((g) => {
    if (!query.trim()) return true
    const q = query.trim().toLowerCase()
    if (g.email.includes(q)) return true
    return g.contacts.some((c) =>
      (c.name?.toLowerCase().includes(q) ?? false) ||
      (c.company?.toLowerCase().includes(q) ?? false)
    )
  }) ?? []

  return (
    <PermissionGate feature="bulk_email">
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/admin" className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
            <ArrowLeft size={18} />
          </Link>
          <Mail size={22} className="text-amber-500" />
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t('title')}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{t('subtitle')}</p>
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
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t('totalGroups')}</div>
                <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{data.total_groups}</div>
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t('totalContacts')}</div>
                <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{data.total_contacts_with_shared_email}</div>
              </div>
            </div>

            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="w-full mb-4 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />

            {filtered.length === 0 ? (
              <div className="text-sm text-gray-400 text-center py-12">
                {query ? t('noMatch') : t('noShared')}
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
                      <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('colEmail')}</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('colCount')}</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('colContacts')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((g) => (
                      <tr key={g.email} className="border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                        <td className="px-4 py-3 font-mono text-xs text-gray-700 dark:text-gray-300 break-all">{g.email}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400">
                            <Users size={11} /> {g.count}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            {g.contacts.map((c) => (
                              <Link
                                key={c.id}
                                href={`/contacts/${c.id}`}
                                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                              >
                                {c.name || tc('unnamed')}
                                {c.company && <span className="text-gray-500 dark:text-gray-400 ml-1">· {c.company}</span>}
                                {c.job_title && <span className="text-gray-400 dark:text-gray-500 ml-1">· {c.job_title}</span>}
                              </Link>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : null}
      </div>
    </PermissionGate>
  )
}
