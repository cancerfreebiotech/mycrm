'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Search, X, ZoomIn, ZoomOut, Maximize2, MapPin, Calendar, StickyNote, Users } from 'lucide-react'
import PhotoFaceTagger, { type PhotoFace } from '@/components/PhotoFaceTagger'

interface PhotoRow {
  id: string
  photo_url: string
  note: string | null
  taken_at: string | null
  location_name: string | null
  latitude: number | null
  longitude: number | null
  created_at: string
  faces: PhotoFace[]
}

type SortMode = 'created_at' | 'taken_at' | 'name'

function confirmedNames(p: PhotoRow): string[] {
  return p.faces.filter((f) => f.status === 'confirmed' && f.contact_name).map((f) => f.contact_name as string)
}

export default function PhotosPage() {
  const t = useTranslations('photos')
  const tc = useTranslations('common')
  const [photos, setPhotos] = useState<PhotoRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [keyword, setKeyword] = useState('')
  const [sort, setSort] = useState<SortMode>('created_at')
  const [lightboxId, setLightboxId] = useState<string | null>(null)
  const [lbScale, setLbScale] = useState(1)
  const [lbOffset, setLbOffset] = useState({ x: 0, y: 0 })
  const lbDragRef = useRef(false)
  const lbStartRef = useRef({ x: 0, y: 0 })
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const lightbox = photos.find((p) => p.id === lightboxId) ?? null

  const fetchPhotos = useCallback(async (q: string, s: SortMode) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (q) params.set('q', q)
      params.set('sort', s)
      const res = await fetch(`/api/photos?${params.toString()}`)
      const data = await res.json()
      setPhotos(data.photos ?? [])
      setTotal(data.total ?? 0)
    } finally {
      setLoading(false)
    }
  }, [])

  // 標記變更後重新載入（lightbox 以 id 追蹤，會自動反映最新 faces）
  const reload = useCallback(() => fetchPhotos(keyword, sort), [fetchPhotos, keyword, sort])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchPhotos(keyword, sort), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [keyword, sort, fetchPhotos])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeLightbox() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  function openLightbox(photo: PhotoRow) {
    setLightboxId(photo.id); setLbScale(1); setLbOffset({ x: 0, y: 0 })
  }
  function closeLightbox() { setLightboxId(null) }
  function lbZoom(delta: number) { setLbScale(s => Math.min(5, Math.max(0.5, s + delta))) }
  function lbReset() { setLbScale(1); setLbOffset({ x: 0, y: 0 }) }
  function lbOnWheel(e: React.WheelEvent) { e.preventDefault(); lbZoom(e.deltaY < 0 ? 0.2 : -0.2) }
  function lbOnDoubleClick() { if (lbScale > 1) lbReset(); else setLbScale(2) }
  function lbOnMouseDown(e: React.MouseEvent) {
    if (lbScale <= 1) return
    lbDragRef.current = true
    lbStartRef.current = { x: e.clientX - lbOffset.x, y: e.clientY - lbOffset.y }
  }
  function lbOnMouseMove(e: React.MouseEvent) {
    if (!lbDragRef.current) return
    setLbOffset({ x: e.clientX - lbStartRef.current.x, y: e.clientY - lbStartRef.current.y })
  }
  function lbOnMouseUp() { lbDragRef.current = false }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('title')}</h1>
        {!loading && (
          <span className="text-sm text-gray-500 dark:text-gray-400">{t('results', { n: total })}</span>
        )}
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
          placeholder={t('search')}
          className="w-full pl-9 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
        />
        {keyword && (
          <button onClick={() => setKeyword('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Sort */}
      <div className="flex flex-wrap items-center gap-2 mb-8 text-sm">
        <span className="text-gray-500 dark:text-gray-400">{t('sortBy')}</span>
        {(['created_at', 'taken_at', 'name'] as const).map(mode => {
          const active = sort === mode
          const label = mode === 'created_at' ? t('sortCreated') : mode === 'taken_at' ? t('sortTaken') : t('sortName')
          return (
            <button
              key={mode}
              onClick={() => setSort(mode)}
              className={`px-3 py-1.5 rounded-full border min-h-[36px] transition-colors ${
                active
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* Content — 以照片為主體的網格（一張照片可含多人） */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">{tc('loading')}</div>
      ) : photos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-2">
          <Search size={32} className="opacity-30" />
          <p>{keyword ? t('noResults') : t('noPhotos')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {photos.map(photo => {
            const names = confirmedNames(photo)
            return (
              <div key={photo.id} className="group cursor-pointer" onClick={() => openLightbox(photo)}>
                <div className="relative aspect-square rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.photo_url}
                    alt={names[0] ?? t('noPhotos')}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                    <ZoomIn size={20} className="text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
                  </div>
                  {names.length > 0 && (
                    <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs rounded-full px-2 py-0.5 flex items-center gap-1">
                      <Users size={11} /> {names.length}
                    </div>
                  )}
                </div>
                <div className="mt-1.5 px-0.5">
                  {names.length > 0 ? (
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                      {names.length <= 2 ? names.join('、') : t('namesPlus', { names: names.slice(0, 2).join('、'), n: names.length - 2 })}
                    </p>
                  ) : (
                    <span className="text-sm text-gray-400 truncate block">{t('unassigned')}</span>
                  )}
                  {photo.taken_at && (
                    <p className="text-xs text-gray-400 truncate">
                      {new Date(photo.taken_at).toLocaleDateString('zh-TW')}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 bg-black/90 flex z-50" onClick={closeLightbox}>
          {/* Toolbar */}
          <div className="absolute top-4 right-4 flex items-center gap-2 z-10" onClick={e => e.stopPropagation()}>
            <button className="text-white/80 hover:text-white bg-black/40 rounded-full p-2" onClick={() => lbZoom(0.25)}><ZoomIn size={18} /></button>
            <button className="text-white/80 hover:text-white bg-black/40 rounded-full p-2" onClick={() => lbZoom(-0.25)}><ZoomOut size={18} /></button>
            <button className="text-white/80 hover:text-white bg-black/40 rounded-full p-2" onClick={lbReset}><Maximize2 size={18} /></button>
            <button className="text-white/80 hover:text-white bg-black/40 rounded-full p-2" onClick={closeLightbox}><X size={18} /></button>
          </div>
          <div className="absolute top-4 left-4 text-white/50 text-xs bg-black/40 rounded px-2 py-1 z-10 select-none">
            {Math.round(lbScale * 100)}%
          </div>

          {/* Image */}
          <div className="flex-1 flex items-center justify-center overflow-hidden" onClick={closeLightbox}>
            <div
              className="select-none"
              style={{
                transform: `translate(${lbOffset.x}px, ${lbOffset.y}px) scale(${lbScale})`,
                transformOrigin: 'center center',
                cursor: lbScale > 1 ? 'grab' : 'default',
                transition: lbDragRef.current ? 'none' : 'transform 0.15s ease',
              }}
              onClick={e => e.stopPropagation()}
              onDoubleClick={lbOnDoubleClick}
              onWheel={lbOnWheel}
              onMouseDown={lbOnMouseDown}
              onMouseMove={lbOnMouseMove}
              onMouseUp={lbOnMouseUp}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={lightbox.photo_url}
                alt={confirmedNames(lightbox)[0] ?? t('noPhotos')}
                className="max-h-[85vh] max-w-[75vw] rounded-lg object-contain"
                draggable={false}
              />
            </div>
          </div>

          {/* Side panel */}
          <div className="w-72 shrink-0 bg-gray-900/95 border-l border-white/10 flex flex-col p-5 gap-4 overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* 照片中的人（多對多 + 標記） */}
            <PhotoFaceTagger
              photoId={lightbox.id}
              faces={lightbox.faces}
              onChanged={reload}
              onNavigate={closeLightbox}
            />

            {lightbox.taken_at && (
              <div className="flex items-start gap-2 pt-2 border-t border-white/10">
                <Calendar size={14} className="text-gray-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">{t('lbDate')}</p>
                  <p className="text-sm text-gray-200">{new Date(lightbox.taken_at).toLocaleDateString()}</p>
                </div>
              </div>
            )}
            {lightbox.location_name && (
              <div className="flex items-start gap-2">
                <MapPin size={14} className="text-gray-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">{t('lbLocation')}</p>
                  <p className="text-sm text-gray-200">{lightbox.location_name}</p>
                </div>
              </div>
            )}
            {lightbox.note && (
              <div className="flex items-start gap-2">
                <StickyNote size={14} className="text-gray-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">{t('lbNote')}</p>
                  <p className="text-sm text-gray-200 whitespace-pre-wrap">{lightbox.note}</p>
                </div>
              </div>
            )}
            <div className="mt-auto pt-4 border-t border-white/10">
              <p className="text-xs text-gray-600">{t('lbUploaded', { date: new Date(lightbox.created_at).toLocaleDateString() })}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
