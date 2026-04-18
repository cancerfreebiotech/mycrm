'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { ScanSearch, Loader2, Merge, X, ExternalLink } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { PermissionGate } from '@/components/PermissionGate'

interface DupContact {
  id: string
  name: string | null
  name_en: string | null
  company: string | null
  email: string | null
  created_at: string
  source: string | null
}

interface DupPair {
  id: string
  contact_id_a: string
  contact_id_b: string
  match_type: 'exact_email' | 'similar_name'
  similarity_score: number | null
  is_ignored: boolean
  scanned_at: string
  contact_a: DupContact
  contact_b: DupContact
}

type MergeAction = { pairId: string; keepId: string; sourceId: string } | null

export default function DuplicatesPage() {
  const t = useTranslations('duplicates')
  const tc = useTranslations('common')
  const supabase = createBrowserSupabaseClient()

  const [pairs, setPairs] = useState<DupPair[]>([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [lastScanned, setLastScanned] = useState<string | null>(null)
  const [mergeAction, setMergeAction] = useState<MergeAction>(null)
  const [mergeSaving, setMergeSaving] = useState(false)
  const [ignoring, setIgnoring] = useState<string | null>(null)

  useEffect(() => { fetchPairs() }, [])

  async function fetchPairs() {
    setLoading(true)
    const { data } = await supabase
      .from('duplicate_pairs')
      .select(`
        id, contact_id_a, contact_id_b, match_type, similarity_score, is_ignored, scanned_at,
        contact_a:contacts!contact_id_a(id, name, name_en, company, email, created_at, source),
        contact_b:contacts!contact_id_b(id, name, name_en, company, email, created_at, source)
      `)
      .eq('is_ignored', false)
      .order('match_type')
      .order('scanned_at', { ascending: false })
    setPairs((data ?? []) as unknown as DupPair[])
    if (data && data.length > 0) {
      setLastScanned((data[0] as unknown as DupPair).scanned_at)
    }
    setLoading(false)
  }

  async function handleScan() {
    setScanning(true)
    try {
      const res = await fetch('/api/contacts/scan-duplicates', { method: 'POST' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(`掃描失敗：${err.error ?? res.status}`)
        return
      }
      const { found } = await res.json()
      await fetchPairs()
      if (found === 0) alert(t('noDuplicates'))
    } catch (e) {
      alert(`掃描失敗：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setScanning(false)
    }
  }

  async function handleIgnore(pairId: string) {
    setIgnoring(pairId)
    await supabase.from('duplicate_pairs').update({ is_ignored: true }).eq('id', pairId)
    setPairs((prev) => prev.filter((p) => p.id !== pairId))
    setIgnoring(null)
  }

  async function handleMerge() {
    if (!mergeAction) return
    setMergeSaving(true)
    try {
      const res = await fetch(`/api/contacts/${mergeAction.keepId}/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId: mergeAction.sourceId }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      // Remove this pair and any pair involving the deleted source
      setPairs((prev) => prev.filter((p) =>
        p.id !== mergeAction.pairId &&
        p.contact_id_a !== mergeAction.sourceId &&
        p.contact_id_b !== mergeAction.sourceId
      ))
      setMergeAction(null)
    } catch (e) {
      alert(e instanceof Error ? e.message : t('mergeFailed'))
    } finally {
      setMergeSaving(false)
    }
  }

  const emailPairs = pairs.filter((p) => p.match_type === 'exact_email')
  const namePairs = pairs.filter((p) => p.match_type === 'similar_name')

  function ContactCard({ c, role }: { c: DupContact; role: 'keep' | 'source' }) {
    const borderColor = role === 'keep'
      ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20'
      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900'
    return (
      <div className={`rounded-lg border p-3 ${borderColor}`}>
        {role === 'keep' && <p className="text-xs font-semibold text-green-600 dark:text-green-400 mb-1.5">{t('keepLabel')}</p>}
        <p className="font-medium text-sm text-gray-900 dark:text-gray-100">{c.name || c.name_en || t('noName')}</p>
        {c.company && <p className="text-xs text-gray-500 mt-0.5">{c.company}</p>}
        {c.email && <p className="text-xs text-gray-400 mt-0.5">{c.email}</p>}
        <p className="text-xs text-gray-300 dark:text-gray-600 mt-1">
          {c.source ?? 'web'} · {new Date(c.created_at).toLocaleDateString('zh-TW')}
        </p>
        <Link href={`/contacts/${c.id}`} target="_blank" className="inline-flex items-center gap-1 text-xs text-blue-500 hover:underline mt-1">
          <ExternalLink size={10} /> {t('view')}
        </Link>
      </div>
    )
  }

  function PairRow({ pair }: { pair: DupPair }) {
    const a = pair.contact_a
    const b = pair.contact_b
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-start gap-3">
          <div className="flex-1 grid grid-cols-2 gap-3">
            <ContactCard c={a} role="keep" />
            <ContactCard c={b} role="source" />
          </div>
          <div className="flex flex-col gap-2 shrink-0 mt-1">
            <button
              onClick={() => setMergeAction({ pairId: pair.id, keepId: a.id, sourceId: b.id })}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-orange-600 text-white rounded-lg hover:bg-orange-700"
            >
              <Merge size={12} /> {t('keepLeft')}
            </button>
            <button
              onClick={() => setMergeAction({ pairId: pair.id, keepId: b.id, sourceId: a.id })}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-orange-600 text-white rounded-lg hover:bg-orange-700"
            >
              <Merge size={12} /> {t('keepRight')}
            </button>
            <button
              onClick={() => handleIgnore(pair.id)}
              disabled={ignoring === pair.id}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40"
            >
              {ignoring === pair.id ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
              {t('notDuplicate')}
            </button>
          </div>
        </div>
        {pair.match_type === 'similar_name' && pair.similarity_score != null && (
          <p className="text-xs text-gray-400 mt-2">{t('similarity', { pct: (pair.similarity_score * 100).toFixed(0) })}</p>
        )}
      </div>
    )
  }

  return (
    <PermissionGate feature="duplicates">
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('title')}</h1>
          {lastScanned && (
            <p className="text-sm text-gray-400 mt-1">{t('lastScanned', { time: new Date(lastScanned).toLocaleString() })}</p>
          )}
        </div>
        <button
          onClick={handleScan}
          disabled={scanning}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {scanning ? <Loader2 size={15} className="animate-spin" /> : <ScanSearch size={15} />}
          {scanning ? t('scanning') : t('scan')}
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-gray-400 text-center py-12"><Loader2 size={20} className="animate-spin mx-auto mb-2" />{tc('loading')}</div>
      ) : pairs.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center">
          <ScanSearch size={32} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">{t('empty')}</p>
          <p className="text-gray-300 text-xs mt-1">{t('emptyHint')}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {emailPairs.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
                {t('exactEmail', { count: emailPairs.length })}
              </h2>
              <div className="space-y-3">
                {emailPairs.map((p) => <PairRow key={p.id} pair={p} />)}
              </div>
            </section>
          )}
          {namePairs.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" />
                {t('similarName', { count: namePairs.length })}
              </h2>
              <div className="space-y-3">
                {namePairs.map((p) => <PairRow key={p.id} pair={p} />)}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Merge confirm modal */}
      {mergeAction && (() => {
        const pair = pairs.find((p) => p.id === mergeAction.pairId)
        if (!pair) return null
        const keep = mergeAction.keepId === pair.contact_id_a ? pair.contact_a : pair.contact_b
        const source = mergeAction.sourceId === pair.contact_id_a ? pair.contact_a : pair.contact_b
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-lg">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <Merge size={16} /> {t('mergeTitle')}
                </h2>
                <button onClick={() => setMergeAction(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-4">
                    <p className="text-xs font-semibold text-green-700 dark:text-green-400 mb-2">{t('keepLabel')}</p>
                    <p className="font-medium text-gray-900 dark:text-gray-100">{keep.name || keep.name_en || t('noName')}</p>
                    <p className="text-sm text-gray-500">{keep.company}</p>
                    <p className="text-xs text-gray-400">{keep.email}</p>
                  </div>
                  <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-4">
                    <p className="text-xs font-semibold text-red-700 dark:text-red-400 mb-2">{t('deleteLabel')}</p>
                    <p className="font-medium text-gray-900 dark:text-gray-100">{source.name || source.name_en || t('noName')}</p>
                    <p className="text-sm text-gray-500">{source.company}</p>
                    <p className="text-xs text-gray-400">{source.email}</p>
                  </div>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-xs text-gray-500 space-y-1">
                  <p>• {t('mergeKeep')}</p>
                  <p>• {t('mergeAll')}</p>
                  <p>• {t('mergeIrreversible')}</p>
                </div>
              </div>
              <div className="flex justify-between gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
                <button onClick={() => setMergeAction(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">{tc('cancel')}</button>
                <button
                  onClick={handleMerge}
                  disabled={mergeSaving}
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50"
                >
                  {mergeSaving ? <Loader2 size={14} className="animate-spin" /> : <Merge size={14} />}
                  {t('confirmMerge')}
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
    </PermissionGate>
  )
}
