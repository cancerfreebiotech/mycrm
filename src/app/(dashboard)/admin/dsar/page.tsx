'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { FileSearch, Search, Loader2, CheckCircle2, XCircle, ExternalLink, Download } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'

type SourceKey = 'contact_opt_out' | 'contact_status' | 'blacklist' | 'unsubscribe' | 'subscriber_unsub'

const SOURCE_LABEL_KEY: Record<SourceKey, string> = {
  contact_opt_out: 'sourceContactOptOut',
  contact_status: 'sourceContactStatus',
  blacklist: 'sourceBlacklist',
  unsubscribe: 'sourceUnsubscribe',
  subscriber_unsub: 'sourceSubscriberUnsub',
}

interface Verdict {
  email: string
  canEmail: boolean
  reasons: { source: SourceKey; detail: string | null }[]
}

interface DsarContact {
  id: string
  name: string | null
  company: string | null
  created_at: string
  deleted: boolean
  creator: string | null
  counts: { interaction_logs: number; contact_cards: number; newsletter_recipients: number }
}

const VALID_EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

export default function DsarPage() {
  const t = useTranslations('dsar')
  const ts = useTranslations('suppressions')
  const [ready, setReady] = useState(false)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [input, setInput] = useState('')
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [contacts, setContacts] = useState<DsarContact[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createBrowserSupabaseClient()
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        const { data: profile } = await supabase.from('users').select('role').eq('email', session.user.email!).single()
        if (profile?.role === 'super_admin') setIsSuperAdmin(true)
      }
      setReady(true)
    })
  }, [])

  async function handleSearch(e?: React.FormEvent) {
    e?.preventDefault()
    const email = input.trim().toLowerCase()
    setError(null)
    setVerdict(null)
    setContacts([])
    setSearched(false)
    if (!VALID_EMAIL.test(email)) { setError(t('invalidEmail')); return }
    setSearching(true)
    try {
      const res = await fetch(`/api/admin/dsar?email=${encodeURIComponent(email)}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? t('searchFailed'))
      }
      const data = await res.json()
      setVerdict(data.verdict)
      setContacts(data.contacts ?? [])
      setSearched(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('searchFailed'))
    } finally {
      setSearching(false)
    }
  }

  if (!isSuperAdmin && ready) {
    return <div className="p-8 text-center text-gray-500 dark:text-gray-400">{t('noPermission')}</div>
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <FileSearch size={22} className="text-blue-500 shrink-0" />
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t('pageTitle')}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{t('pageSubtitle')}</p>
        </div>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="email"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="w-full pl-9 pr-3 py-2.5 text-base rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          type="submit"
          disabled={searching}
          className="flex items-center justify-center gap-2 px-5 py-2.5 min-h-11 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
        >
          {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
          {t('searchButton')}
        </button>
      </form>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Verdict card for the queried email */}
      {verdict && (
        <div className={`mb-4 flex items-start gap-3 px-4 py-4 rounded-xl border ${
          verdict.canEmail
            ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800'
            : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'
        }`}>
          {verdict.canEmail
            ? <CheckCircle2 size={22} className="text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
            : <XCircle size={22} className="text-red-600 dark:text-red-400 shrink-0 mt-0.5" />}
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">{t('verdictTitle')}</div>
            <div className={`font-semibold ${verdict.canEmail ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
              {verdict.canEmail ? t('verdictCanEmail') : t('verdictCannotEmail')}
            </div>
            {!verdict.canEmail && verdict.reasons.length > 0 && (
              <ul className="mt-2 text-sm text-gray-700 dark:text-gray-300 list-disc list-inside space-y-0.5">
                {verdict.reasons.map((r, i) => (
                  <li key={i}>{ts(SOURCE_LABEL_KEY[r.source])}{r.detail ? `：${r.detail}` : ''}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Results */}
      {searched && (
        contacts.length === 0 ? (
          <div className="text-center py-16 text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
            <FileSearch size={40} className="mx-auto mb-3 opacity-30" />
            <p>{t('empty')}</p>
          </div>
        ) : (
          <div>
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">{t('resultsTitle')}</h2>
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600 dark:text-gray-400">{t('colName')}</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600 dark:text-gray-400 hidden sm:table-cell">{t('colCompany')}</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600 dark:text-gray-400 hidden md:table-cell">{t('colCreator')}</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600 dark:text-gray-400 hidden lg:table-cell">{t('colCreatedAt')}</th>
                      <th className="text-right px-4 py-2.5 font-medium text-gray-600 dark:text-gray-400">{t('colInteractions')}</th>
                      <th className="text-right px-4 py-2.5 font-medium text-gray-600 dark:text-gray-400 hidden sm:table-cell">{t('colCards')}</th>
                      <th className="text-right px-4 py-2.5 font-medium text-gray-600 dark:text-gray-400 hidden sm:table-cell">{t('colRecipients')}</th>
                      <th className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {contacts.map((c) => (
                      <tr key={c.id} className="border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                        <td className="px-4 py-2.5">
                          <span className="text-gray-900 dark:text-gray-100">{c.name || t('unnamed')}</span>
                          {c.deleted && (
                            <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                              {t('deletedBadge')}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400 hidden sm:table-cell">{c.company ?? '—'}</td>
                        <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400 hidden md:table-cell">{c.creator ?? '—'}</td>
                        <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 text-xs whitespace-nowrap hidden lg:table-cell">{formatDate(c.created_at)}</td>
                        <td className="px-4 py-2.5 text-right text-gray-700 dark:text-gray-300">{c.counts.interaction_logs}</td>
                        <td className="px-4 py-2.5 text-right text-gray-700 dark:text-gray-300 hidden sm:table-cell">{c.counts.contact_cards}</td>
                        <td className="px-4 py-2.5 text-right text-gray-700 dark:text-gray-300 hidden sm:table-cell">{c.counts.newsletter_recipients}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-3 justify-end whitespace-nowrap">
                            <Link
                              href={`/contacts/${c.id}`}
                              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                            >
                              <ExternalLink size={13} /> {t('viewContact')}
                            </Link>
                            <a
                              href={`/api/contacts/${c.id}/export`}
                              className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:underline"
                            >
                              <Download size={13} /> {t('exportLink')}
                            </a>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      )}

      {/* Initial idle hint */}
      {!searched && !error && (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">
          <FileSearch size={40} className="mx-auto mb-3 opacity-30" />
          <p>{t('emptyHint')}</p>
        </div>
      )}
    </div>
  )
}
