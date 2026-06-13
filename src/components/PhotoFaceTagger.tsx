'use client'

import { useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { X, UserPlus, Check, Sparkles } from 'lucide-react'

export interface PhotoFace {
  id: string
  contact_id: string | null
  contact_name: string | null
  status: 'confirmed' | 'suggested' | 'rejected'
  source: 'manual' | 'ai_detected'
  confidence: number | null
  bbox: { x: number; y: number; w: number; h: number } | null
}

interface SearchResult {
  id: string
  name: string | null
  name_en: string | null
  company: string | null
  email: string | null
}

// 相簿 lightbox 內的「照片中的人」管理面板：一張照片可標多位聯絡人。
// 手動標記（Phase 1）+ 接受/拒絕 AI 建議（Phase 2）。面板位於深色 lightbox 內。
export default function PhotoFaceTagger({
  photoId,
  faces,
  onChanged,
  onNavigate,
}: {
  photoId: string
  faces: PhotoFace[]
  onChanged: () => void
  onNavigate?: () => void
}) {
  const t = useTranslations('photos')
  const tCommon = useTranslations('common')
  const [adding, setAdding] = useState(false)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [busy, setBusy] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const confirmed = faces.filter((f) => f.status === 'confirmed')
  const suggested = faces.filter((f) => f.status === 'suggested')

  const search = useCallback((value: string) => {
    setQ(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!value.trim()) {
      setResults([])
      return
    }
    debounceRef.current = setTimeout(async () => {
      const res = await fetch(`/api/contacts/search?q=${encodeURIComponent(value.trim())}`)
      const data = await res.json()
      setResults(data.results ?? [])
    }, 250)
  }, [])

  async function tag(contactId: string) {
    setBusy(true)
    try {
      const res = await fetch('/api/photo-faces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo_id: photoId, contact_id: contactId }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        if (d.error === 'already_tagged') alert(t('alreadyTagged'))
      }
      setQ('')
      setResults([])
      setAdding(false)
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  async function untag(faceId: string) {
    setBusy(true)
    try {
      await fetch(`/api/photo-faces/${faceId}`, { method: 'DELETE' })
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  async function resolveSuggestion(faceId: string, action: 'accept' | 'reject') {
    setBusy(true)
    try {
      const res = await fetch(`/api/photo-faces/${faceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) {
        // 失敗時提示使用者（例如建議已被別人接受 → already_tagged 409），不靜默吞掉
        const d = await res.json().catch(() => ({}))
        if (d.error === 'already_tagged') alert(t('alreadyTagged'))
        else alert(tCommon('error'))
        return
      }
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">
        {t('peopleInPhoto', { n: confirmed.length })}
      </p>

      {/* 已確認的人 */}
      <div className="flex flex-col gap-1.5">
        {confirmed.map((f) => (
          <div key={f.id} className="flex items-center justify-between gap-2 bg-white/5 rounded-lg pl-3 pr-1 py-1">
            {f.contact_id ? (
              <Link
                href={`/contacts/${f.contact_id}`}
                className="text-sm text-blue-400 hover:text-blue-300 truncate"
                onClick={onNavigate}
              >
                {f.contact_name ?? t('unknownContact')}
              </Link>
            ) : (
              <span className="text-sm text-gray-300 truncate">{t('unknownContact')}</span>
            )}
            <button
              onClick={() => untag(f.id)}
              disabled={busy}
              aria-label={t('removeTag')}
              className="shrink-0 w-9 h-9 flex items-center justify-center text-gray-400 hover:text-red-400 rounded-lg disabled:opacity-50"
            >
              <X size={16} />
            </button>
          </div>
        ))}
        {confirmed.length === 0 && <p className="text-sm text-gray-500">{t('noPeople')}</p>}
      </div>

      {/* AI 建議（Phase 2） */}
      {suggested.length > 0 && (
        <div className="mt-3 flex flex-col gap-1.5">
          <p className="text-xs text-amber-400/80 uppercase tracking-wide flex items-center gap-1">
            <Sparkles size={12} /> {t('aiSuggested')}
          </p>
          {suggested.map((f) => (
            <div key={f.id} className="flex items-center justify-between gap-2 border border-dashed border-amber-500/50 rounded-lg pl-3 pr-1 py-1">
              <span className="text-sm text-amber-200 truncate">
                {f.contact_name ?? t('unknownContact')}
                {f.confidence != null && <span className="text-amber-400/60 ml-1">{Math.round(f.confidence * 100)}%</span>}
              </span>
              <div className="flex items-center shrink-0">
                <button
                  onClick={() => resolveSuggestion(f.id, 'accept')}
                  disabled={busy}
                  aria-label={t('acceptSuggestion')}
                  className="w-9 h-9 flex items-center justify-center text-green-400 hover:text-green-300 rounded-lg disabled:opacity-50"
                >
                  <Check size={16} />
                </button>
                <button
                  onClick={() => resolveSuggestion(f.id, 'reject')}
                  disabled={busy}
                  aria-label={t('rejectSuggestion')}
                  className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-red-400 rounded-lg disabled:opacity-50"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 新增標記 */}
      {adding ? (
        <div className="mt-3">
          <input
            autoFocus
            type="text"
            value={q}
            onChange={(e) => search(e.target.value)}
            placeholder={t('searchContact')}
            className="w-full px-3 py-2 text-base rounded-lg bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {results.length > 0 && (
            <div className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-gray-700 bg-gray-800 divide-y divide-gray-700">
              {results.map((r) => (
                <button
                  key={r.id}
                  onClick={() => tag(r.id)}
                  disabled={busy}
                  className="w-full text-left px-3 py-2 min-h-[44px] hover:bg-gray-700 disabled:opacity-50"
                >
                  <span className="text-sm text-gray-100">{r.name || r.name_en || t('unknownContact')}</span>
                  {r.company && <span className="block text-xs text-gray-500 truncate">{r.company}</span>}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => { setAdding(false); setQ(''); setResults([]) }}
            className="mt-2 text-xs text-gray-500 hover:text-gray-300 min-h-[44px]"
          >
            {t('cancelTag')}
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mt-3 flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 min-h-[44px]"
        >
          <UserPlus size={15} /> {t('addPerson')}
        </button>
      )}
    </div>
  )
}
