'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { PermissionGate } from '@/components/PermissionGate'
import { Loader2, Plus, Trash2, X, Calendar, ChevronLeft, ChevronRight, Pencil, Download, Wand2, Check, GripVertical } from 'lucide-react'
import {
  DndContext, closestCorners, PointerSensor, TouchSensor, KeyboardSensor,
  useSensor, useSensors, useDroppable, type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, sortableKeyboardCoordinates, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

type Section = 'last_month' | 'next_month' | 'highlight'

interface AiPreviewData {
  'zh-TW': { html: string; subject: string; promo: string }
  en: { html: string; subject: string; promo: string }
  ja: { html: string; subject: string; promo: string }
  story_count: number
  from_cache?: boolean
  skipped?: Array<{ title: string | null; section: string }>
}

interface Draft {
  id: string
  period: string
  section: Section
  title: string | null
  content: string | null
  event_date: string | null
  event_date_end: string | null
  photo_urls: string[]
  links: Array<{ url: string; label?: string }>
  position: number
  status: 'draft' | 'approved' | 'used' | 'deleted'
  created_via: 'telegram' | 'web'
  created_at: string
  creator?: { id: string; email: string; display_name: string | null } | null
}

function shiftPeriod(period: string, delta: number): string {
  const [y, m] = period.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function NewsletterDraftPage() {
  return (
    <PermissionGate feature="newsletter">
      <Inner />
    </PermissionGate>
  )
}

function Inner() {
  const params = useParams<{ period: string }>()
  const router = useRouter()
  const t = useTranslations('newsletter')
  const tc = useTranslations('common')

  const period = params?.period ?? ''
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Draft | null>(null)
  const [composing, setComposing] = useState<{ section: Section } | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiPreview, setAiPreview] = useState<AiPreviewData | null>(null)
  const [editingPeriod, setEditingPeriod] = useState(false)
  const [periodInput, setPeriodInput] = useState(period)
  const [labelLast, setLabelLast] = useState<string>('')
  const [labelNext, setLabelNext] = useState<string>('')

  function commitPeriod() {
    const v = periodInput.trim()
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(v) && v !== period) {
      router.push(`/admin/newsletter/draft/${v}`)
    }
    setEditingPeriod(false)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [draftsRes, metaRes] = await Promise.all([
        fetch(`/api/newsletter/drafts?period=${period}`),
        fetch(`/api/newsletter/period-meta?period=${period}`),
      ])
      const draftsJ = await draftsRes.json()
      setDrafts(draftsJ.drafts ?? [])
      if (metaRes.ok) {
        const meta = await metaRes.json()
        setLabelLast(meta.label_last ?? '')
        setLabelNext(meta.label_next ?? '')
      }
    } finally { setLoading(false) }
  }, [period])

  useEffect(() => { if (period) load() }, [period, load])

  async function saveMeta(patch: { label_last?: string | null; label_next?: string | null }) {
    const r = await fetch('/api/newsletter/period-meta', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ period, ...patch }),
    })
    if (!r.ok) alert((await r.json()).error ?? t('errorSaveFailed'))
  }

  async function createDraft(section: Section, fields: { title: string; content: string; event_date: string; event_date_end: string }) {
    const r = await fetch('/api/newsletter/drafts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ period, section, title: fields.title, content: fields.content || null, event_date: fields.event_date || null, event_date_end: fields.event_date_end || null, created_via: 'web' }),
    })
    if (r.ok) { setComposing(null); await load() }
    else alert((await r.json()).error ?? t('errorCreateFailed'))
  }

  async function updateDraft(id: string, patch: Partial<Draft>) {
    const r = await fetch(`/api/newsletter/drafts/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    })
    if (r.ok) await load()
    else alert((await r.json()).error ?? t('errorUpdateFailed'))
  }

  async function deleteDraft(id: string, title: string | null) {
    if (!confirm(t('confirmDeleteStory', { title: title ?? t('untitled') }))) return
    const r = await fetch(`/api/newsletter/drafts/${id}`, { method: 'DELETE' })
    if (r.ok) await load()
  }

  async function uploadPhoto(id: string, file: File) {
    const fd = new FormData(); fd.set('file', file)
    const r = await fetch(`/api/newsletter/drafts/${id}/photo`, { method: 'POST', body: fd })
    if (r.ok) {
      const j = await r.json()
      setDrafts((prev) => prev.map((d) => d.id === id ? { ...d, photo_urls: j.photo_urls } : d))
      if (editing?.id === id) setEditing({ ...editing, photo_urls: j.photo_urls })
    } else alert((await r.json()).error ?? t('errorUploadFailed'))
  }

  async function removePhoto(id: string, url: string) {
    const r = await fetch(`/api/newsletter/drafts/${id}/photo?url=${encodeURIComponent(url)}`, { method: 'DELETE' })
    if (r.ok) {
      const j = await r.json()
      setDrafts((prev) => prev.map((d) => d.id === id ? { ...d, photo_urls: j.photo_urls } : d))
      if (editing?.id === id) setEditing({ ...editing, photo_urls: j.photo_urls })
    }
  }

  function exportJson() {
    window.location.href = `/api/newsletter/drafts/export?period=${period}`
  }

  async function aiCompose(force = false) {
    setAiBusy(true)
    try {
      const r = await fetch('/api/newsletter/compose-from-drafts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period, action: 'preview', force }),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        alert(j.error ?? t('errorAiComposeFailed'))
        return
      }
      const j = await r.json()
      setAiPreview({ ...j.preview, story_count: j.story_count, from_cache: !!j.from_cache, skipped: j.skipped ?? [] })
    } catch {
      alert(t('errorAiComposeFailed'))
    } finally { setAiBusy(false) }
  }

  async function aiCommit() {
    if (!confirm(t('confirmAiCommit', { count: aiPreview?.story_count ?? 0 }))) return
    setAiBusy(true)
    try {
      const r = await fetch('/api/newsletter/compose-from-drafts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period, action: 'commit' }),
      })
      const j = await r.json()
      if (!r.ok) { alert(j.error ?? t('errorCreateFailed')); return }
      setAiPreview(null)
      router.push('/admin/newsletter/campaigns')
    } catch {
      alert(t('errorCreateFailed'))
    } finally { setAiBusy(false) }
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // Drag to reorder within a section, move between sections, or drop into 本期重點 (highlight).
  async function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over) return
    const activeId = String(active.id)
    const overId = String(over.id)
    if (activeId === overId) return

    const activeDraft = drafts.find((d) => d.id === activeId)
    if (!activeDraft) return

    const containers: Section[] = ['highlight', 'last_month', 'next_month']
    const isContainer = containers.includes(overId as Section)
    const targetSection: Section = isContainer
      ? (overId as Section)
      : (drafts.find((d) => d.id === overId)?.section ?? activeDraft.section)

    const bySection: Record<Section, Draft[]> = {
      highlight: drafts.filter((d) => d.section === 'highlight'),
      last_month: drafts.filter((d) => d.section === 'last_month'),
      next_month: drafts.filter((d) => d.section === 'next_month'),
    }
    const srcSection = activeDraft.section

    if (srcSection === targetSection) {
      // reorder within the same column — arrayMove keeps drop direction correct
      const list = bySection[srcSection]
      const oldIndex = list.findIndex((d) => d.id === activeId)
      let newIndex = isContainer ? list.length - 1 : list.findIndex((d) => d.id === overId)
      if (newIndex < 0) newIndex = list.length - 1
      bySection[srcSection] = arrayMove(list, oldIndex, newIndex)
    } else {
      // move across columns: remove from source, insert before the hovered card (or append)
      bySection[srcSection] = bySection[srcSection].filter((d) => d.id !== activeId)
      let insertIndex = isContainer ? bySection[targetSection].length : bySection[targetSection].findIndex((d) => d.id === overId)
      if (insertIndex < 0) insertIndex = bySection[targetSection].length

      // 本期重點 holds a single story — demote any existing one back to 上月回顧
      if (targetSection === 'highlight' && bySection.highlight.length > 0) {
        bySection.last_month = [...bySection.last_month, ...bySection.highlight.map((d) => ({ ...d, section: 'last_month' as Section }))]
        bySection.highlight = []
        insertIndex = 0
      }

      bySection[targetSection] = [
        ...bySection[targetSection].slice(0, insertIndex),
        { ...activeDraft, section: targetSection },
        ...bySection[targetSection].slice(insertIndex),
      ]
    }

    // rebuild flat list with fresh positions; collect the rows that actually changed
    const rebuilt: Draft[] = []
    const changed: Array<{ id: string; section: Section; position: number }> = []
    ;(containers).forEach((sec) => {
      bySection[sec].forEach((d, i) => {
        rebuilt.push({ ...d, section: sec, position: i })
        const orig = drafts.find((o) => o.id === d.id)
        if (!orig || orig.section !== sec || orig.position !== i) changed.push({ id: d.id, section: sec, position: i })
      })
    })
    if (changed.length === 0) return

    setDrafts(rebuilt) // optimistic
    const r = await fetch('/api/newsletter/drafts/reorder', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ period, items: changed }),
    })
    if (!r.ok) { alert(t('errorSaveFailed')); await load() }
  }

  const highlightDraft = drafts.find((d) => d.section === 'highlight') ?? null
  const lastMonth = drafts.filter((d) => d.section === 'last_month')
  const nextMonth = drafts.filter((d) => d.section === 'next_month')

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <button onClick={() => router.push(`/admin/newsletter/draft/${shiftPeriod(period, -1)}`)}
            className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
            <ChevronLeft size={20} />
          </button>
          {editingPeriod ? (
            <div className="flex items-center gap-1">
              <input
                autoFocus
                value={periodInput}
                onChange={(e) => setPeriodInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); commitPeriod() }
                  if (e.key === 'Escape') { setEditingPeriod(false); setPeriodInput(period) }
                }}
                placeholder="YYYY-MM"
                pattern="^\d{4}-\d{2}$"
                className="text-2xl font-bold px-2 py-1 border border-blue-400 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-44 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={commitPeriod}
                disabled={!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodInput.trim()) || periodInput.trim() === period}
                title={t('jumpToPeriod')}
                className="p-2 rounded text-green-600 hover:bg-green-50 dark:hover:bg-green-950/30 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Check size={20} />
              </button>
              <button
                onClick={() => { setEditingPeriod(false); setPeriodInput(period) }}
                title={tc('cancel')}
                className="p-2 rounded text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X size={20} />
              </button>
            </div>
          ) : (
            <h1
              onClick={() => { setPeriodInput(period); setEditingPeriod(true) }}
              title={t('clickToEditPeriod')}
              className="text-2xl font-bold text-gray-900 dark:text-gray-100 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 px-2 py-1 rounded"
            >
              {t('draftTitle', { period })}
            </h1>
          )}
          <button onClick={() => router.push(`/admin/newsletter/draft/${shiftPeriod(period, +1)}`)}
            className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
            <ChevronRight size={20} />
          </button>
        </div>
        <div className="flex gap-2">
          <button onClick={exportJson}
            className="flex items-center gap-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded hover:bg-gray-50 dark:hover:bg-gray-800">
            <Download size={16} /> {t('exportJson')}
          </button>
          <button onClick={() => aiCompose(false)} disabled={aiBusy || drafts.length === 0}
            className="flex items-center gap-1 px-3 py-2 text-sm bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed">
            {aiBusy ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />} {t('aiCompose')}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-gray-400" /></div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
          {/* Period highlight — optional story rendered at top of every generated newsletter */}
          <HighlightSection
            draft={highlightDraft}
            onAdd={() => setComposing({ section: 'highlight' })}
            onEdit={setEditing}
            onDelete={deleteDraft}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Column section="last_month"
              label={labelLast || t('lastMonthSection')}
              defaultLabel={t('lastMonthSection')}
              labelValue={labelLast}
              onRename={(v) => { setLabelLast(v); saveMeta({ label_last: v.trim() || null }) }}
              drafts={lastMonth}
              onAdd={() => setComposing({ section: 'last_month' })} onEdit={setEditing} onDelete={deleteDraft} />
            <Column section="next_month"
              label={labelNext || t('nextMonthSection')}
              defaultLabel={t('nextMonthSection')}
              labelValue={labelNext}
              onRename={(v) => { setLabelNext(v); saveMeta({ label_next: v.trim() || null }) }}
              drafts={nextMonth}
              onAdd={() => setComposing({ section: 'next_month' })} onEdit={setEditing} onDelete={deleteDraft} />
          </div>
        </DndContext>
      )}

      {/* Compose new */}
      {composing && (
        <ComposeModal section={composing.section} period={period}
          onCancel={() => setComposing(null)}
          onSubmit={(fields) => createDraft(composing.section, fields)} />
      )}

      {/* Edit modal */}
      {editing && (
        <EditModal draft={editing} period={period}
          onClose={() => setEditing(null)}
          onSave={(patch) => updateDraft(editing.id, patch).then(() => setEditing(null))}
          onUploadPhoto={(file) => uploadPhoto(editing.id, file)}
          onRemovePhoto={(url) => removePhoto(editing.id, url)} />
      )}

      {/* AI preview modal */}
      {aiPreview && (
        <AiPreviewModal preview={aiPreview} busy={aiBusy}
          onClose={() => setAiPreview(null)} onCommit={aiCommit}
          onRegenerate={() => aiCompose(true)} />
      )}
    </div>
  )
}

function AiPreviewModal({ preview, busy, onClose, onCommit, onRegenerate }: {
  preview: AiPreviewData
  busy: boolean
  onClose: () => void
  onCommit: () => void
  onRegenerate: () => void
}) {
  const t = useTranslations('newsletter')
  const tc = useTranslations('common')
  const [tab, setTab] = useState<'zh-TW' | 'en' | 'ja'>('zh-TW')
  const current = preview[tab]
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-gray-900 rounded-lg max-w-5xl w-full p-6 max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">
            {t('aiPreviewTitle', { count: preview.story_count })}
            {preview.from_cache && <span className="ml-2 text-xs font-normal text-gray-500">{t('aiPreviewFromCache')}</span>}
          </h3>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        {preview.skipped && preview.skipped.length > 0 && (
          <div className="mb-3 text-sm bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 rounded px-3 py-2">
            {t('aiSkippedNotice', { count: preview.skipped.length })}
            <span className="text-amber-700 dark:text-amber-400">：{preview.skipped.map((s) => s.title || '—').join('、')}</span>
          </div>
        )}
        <div className="flex gap-2 mb-3 border-b border-gray-200 dark:border-gray-700">
          {(['zh-TW', 'en', 'ja'] as const).map((l) => (
            <button key={l} onClick={() => setTab(l)}
              className={`px-3 py-2 text-sm border-b-2 ${tab === l ? 'border-purple-500 text-purple-600' : 'border-transparent text-gray-500'}`}>
              {l === 'zh-TW' ? '繁中' : l === 'en' ? 'English' : '日本語'}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto space-y-3">
          <div className="text-xs text-gray-500">{t('subjectLabel')}</div>
          <div className="font-medium text-gray-900 dark:text-gray-100">{current.subject}</div>
          <div className="text-xs text-gray-500 mt-3">{t('promoTextLabel')}</div>
          <div className="text-sm bg-gray-50 dark:bg-gray-800 p-2 rounded">{current.promo}</div>
          <div className="text-xs text-gray-500 mt-3">{t('htmlPreview')}</div>
          <iframe srcDoc={current.html} className="w-full h-[55vh] border border-gray-200 dark:border-gray-700 rounded bg-white" />
        </div>
        <div className="flex justify-between gap-2 mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
          <button onClick={onRegenerate} disabled={busy}
            className="flex items-center gap-1 px-4 py-2 text-sm border border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300 rounded hover:bg-purple-50 dark:hover:bg-purple-950/30 disabled:opacity-50">
            {busy ? <Loader2 size={14} className="animate-spin" /> : '🔄'} {t('regenerate')}
          </button>
          <div className="flex gap-2">
            <button onClick={onClose}
              className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded">{tc('cancel')}</button>
            <button onClick={onCommit} disabled={busy}
              className="px-4 py-2 text-sm bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50">
              {busy ? t('creating') : t('createDraftCampaigns')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}


function HighlightSection({ draft, onAdd, onEdit, onDelete }: {
  draft: Draft | null
  onAdd: () => void
  onEdit: (d: Draft) => void
  onDelete: (id: string, title: string | null) => void
}) {
  const t = useTranslations('newsletter')
  const { setNodeRef, isOver } = useDroppable({ id: 'highlight' })
  return (
    <div
      ref={setNodeRef}
      className={`mb-6 bg-amber-50 dark:bg-amber-950/20 border rounded-lg p-4 transition-colors ${isOver ? 'border-amber-500 ring-2 ring-amber-400' : 'border-amber-300 dark:border-amber-800'}`}
    >
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-amber-800 dark:text-amber-300 text-sm">
          {t('highlightSection')}
          <span className="ml-2 text-xs font-normal text-amber-600 dark:text-amber-400">{t('highlightSectionHint')}</span>
        </h2>
      </div>
      <SortableContext items={draft ? [draft.id] : []} strategy={verticalListSortingStrategy}>
        {draft ? (
          <SortableCard draft={draft} onEdit={onEdit} onDelete={onDelete} />
        ) : (
          <button
            onClick={onAdd}
            className="w-full flex items-center justify-center gap-2 p-4 border-2 border-dashed border-amber-300 dark:border-amber-800 rounded-lg text-sm text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-950/30 transition-colors"
          >
            <Plus size={18} /> {t('addHighlightCta')}
          </button>
        )}
      </SortableContext>
    </div>
  )
}


function Column({ section, label, defaultLabel, labelValue, onRename, drafts, onAdd, onEdit, onDelete }: {
  section: Section
  label: string
  defaultLabel: string
  labelValue: string
  onRename: (v: string) => void
  drafts: Draft[]
  onAdd: () => void
  onEdit: (d: Draft) => void
  onDelete: (id: string, title: string | null) => void
}) {
  const t = useTranslations('newsletter')
  const tc = useTranslations('common')
  const [editing, setEditing] = useState(false)
  const [draftInput, setDraftInput] = useState(labelValue)
  const { setNodeRef, isOver } = useDroppable({ id: section })
  function commit() {
    onRename(draftInput.trim())
    setEditing(false)
  }
  return (
    <div ref={setNodeRef}
      className={`bg-gray-50 dark:bg-gray-900 rounded-lg p-4 transition-colors ${isOver ? 'ring-2 ring-blue-400' : ''}`}>
      <div className="flex items-center justify-between mb-3 group">
        {editing ? (
          <div className="flex items-center gap-1 flex-1">
            <span className="text-base">{section === 'last_month' ? '📜' : '🔮'}</span>
            <input
              autoFocus
              value={draftInput}
              onChange={(e) => setDraftInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commit() }
                if (e.key === 'Escape') { setEditing(false); setDraftInput(labelValue) }
              }}
              placeholder={defaultLabel}
              className="flex-1 px-2 py-1 text-sm border border-blue-400 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button onClick={commit} title={tc('save')} className="p-1 text-green-600 hover:text-green-700"><Check size={14} /></button>
            <button onClick={() => { setEditing(false); setDraftInput(labelValue) }} title={tc('cancel')} className="p-1 text-gray-400 hover:text-gray-600"><X size={14} /></button>
          </div>
        ) : (
          <h2
            onClick={() => { setDraftInput(labelValue); setEditing(true) }}
            title={t('clickToRename')}
            className="font-semibold text-gray-800 dark:text-gray-200 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 px-2 py-1 rounded -ml-2 inline-flex items-center gap-1"
          >
            {section === 'last_month' ? '📜' : '🔮'} {label}
            <span className="text-sm text-gray-500">({drafts.length})</span>
            <Pencil size={12} className="text-gray-300 opacity-0 group-hover:opacity-100" />
          </h2>
        )}
      </div>
      <SortableContext items={drafts.map((d) => d.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-3">
          {drafts.map((d) => (
            <SortableCard key={d.id} draft={d} onEdit={onEdit} onDelete={onDelete} />
          ))}
          <button onClick={onAdd}
            className="w-full flex items-center justify-center gap-1 p-3 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded text-sm text-gray-600 dark:text-gray-400 hover:border-blue-400 hover:text-blue-500">
            <Plus size={16} /> {t('addStory')}
          </button>
        </div>
      </SortableContext>
    </div>
  )
}

function SortableCard({ draft, onEdit, onDelete }: {
  draft: Draft
  onEdit: (d: Draft) => void
  onDelete: (id: string, title: string | null) => void
}) {
  const t = useTranslations('newsletter')
  const tc = useTranslations('common')
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: draft.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }
  return (
    <div ref={setNodeRef} style={style}
      className="bg-white dark:bg-gray-800 rounded p-3 border border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500">
      <div className="flex justify-between items-start gap-2">
        <button
          type="button"
          {...attributes} {...listeners}
          title={t('dragToReorder')} aria-label={t('dragToReorder')}
          className="touch-none cursor-grab active:cursor-grabbing p-1 -ml-1 mt-0.5 text-gray-300 hover:text-gray-500 shrink-0"
        >
          <GripVertical size={16} />
        </button>
        <div onClick={() => onEdit(draft)} className="flex-1 min-w-0 cursor-pointer">
          <div className="font-medium text-gray-900 dark:text-gray-100 truncate">
            {draft.title ?? <span className="text-gray-400">{t('noTitle')}</span>}
          </div>
          {draft.event_date && (
            <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
              <Calendar size={12} /> {draft.event_date}{draft.event_date_end && draft.event_date_end > draft.event_date ? ` – ${draft.event_date_end}` : ''}
            </div>
          )}
          {draft.content && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 line-clamp-2">{draft.content}</p>
          )}
          {draft.photo_urls.length > 0 && (
            <div className="flex gap-1 mt-2">
              {draft.photo_urls.slice(0, 4).map((u) => (
                <img key={u} src={u} alt="" className="w-12 h-12 object-cover rounded" />
              ))}
              {draft.photo_urls.length > 4 && (
                <div className="w-12 h-12 rounded bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs">
                  +{draft.photo_urls.length - 4}
                </div>
              )}
            </div>
          )}
          <div className="text-xs text-gray-400 mt-2 flex items-center gap-2">
            <span>{draft.creator?.display_name ?? draft.creator?.email ?? '?'}</span>
            <span>·</span>
            <span>{draft.created_via === 'telegram' ? '📱' : '💻'}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={(e) => { e.stopPropagation(); onEdit(draft) }}
            title={t('editTitleContent')}
            className="text-gray-400 hover:text-blue-500"><Pencil size={14} /></button>
          <button onClick={(e) => { e.stopPropagation(); onDelete(draft.id, draft.title) }}
            title={tc('delete')}
            className="text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
        </div>
      </div>
    </div>
  )
}

function ComposeModal({ section, period, onCancel, onSubmit }: {
  section: Section; period: string
  onCancel: () => void
  onSubmit: (fields: { title: string; content: string; event_date: string; event_date_end: string }) => void
}) {
  const t = useTranslations('newsletter')
  const tc = useTranslations('common')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [eventDateEnd, setEventDateEnd] = useState('')
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-gray-900 rounded-lg max-w-2xl w-full p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">
            {t('addStory')} · {period} · {section === 'last_month' ? t('sectionLastMonth') : section === 'next_month' ? t('sectionNextMonth') : t('sectionHighlight')}
          </h3>
          <button onClick={onCancel}><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('titlePlaceholder')}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400">{t('eventDateLabel')}</label>
              <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400">{t('eventDateEndLabel')}</label>
              <input type="date" value={eventDateEnd} min={eventDate || undefined} onChange={(e) => setEventDateEnd(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
            </div>
          </div>
          <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder={t('contentWithPhotoPlaceholder')} rows={6}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onCancel}
            className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded">{tc('cancel')}</button>
          <button onClick={() => title.trim() && onSubmit({ title: title.trim(), content: content.trim(), event_date: eventDate, event_date_end: eventDateEnd })}
            disabled={!title.trim()}
            className="px-4 py-2 text-sm bg-blue-500 text-white rounded disabled:opacity-50">{tc('add')}</button>
        </div>
      </div>
    </div>
  )
}

function EditModal({ draft, period: _period, onClose, onSave, onUploadPhoto, onRemovePhoto }: {
  draft: Draft; period: string
  onClose: () => void
  onSave: (patch: Partial<Draft>) => Promise<void>
  onUploadPhoto: (file: File) => Promise<void>
  onRemovePhoto: (url: string) => Promise<void>
}) {
  const t = useTranslations('newsletter')
  const tc = useTranslations('common')
  const [title, setTitle] = useState(draft.title ?? '')
  const [content, setContent] = useState(draft.content ?? '')
  const [eventDate, setEventDate] = useState(draft.event_date ?? '')
  const [eventDateEnd, setEventDateEnd] = useState(draft.event_date_end ?? '')
  const [section, setSection] = useState<Section>(draft.section)
  const [draftPeriod, setDraftPeriod] = useState(draft.period)
  const [saving, setSaving] = useState(false)

  const used = draft.status === 'used'

  async function save() {
    setSaving(true)
    await onSave({
      title: title.trim() || null,
      content: content.trim() || null,
      event_date: eventDate || null,
      event_date_end: eventDateEnd || null,
      section,
      period: draftPeriod,
    })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-gray-900 rounded-lg max-w-3xl w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">{t('editStory')}</h3>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        {used && (
          <div className="mb-3 p-2 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded text-sm">
            {t('usedStoryWarning')}
          </div>
        )}
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400">{t('titleLabel')}</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400">{t('periodLabel')}</label>
              <input value={draftPeriod} onChange={(e) => setDraftPeriod(e.target.value)} placeholder="YYYY-MM"
                pattern="^\d{4}-\d{2}$"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400">{t('sectionLabel')}</label>
              <select value={section} onChange={(e) => setSection(e.target.value as Section)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                <option value="last_month">{t('sectionLastMonth')}</option>
                <option value="next_month">{t('sectionNextMonth')}</option>
                <option value="highlight">{t('sectionHighlight')}</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400">{t('eventDateLabel')}</label>
              <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400">{t('eventDateEndLabel')}</label>
              <input type="date" value={eventDateEnd} min={eventDate || undefined} onChange={(e) => setEventDateEnd(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400">{t('contentLabel')}</label>
            <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={8}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">{t('photosLabel', { count: draft.photo_urls.length })}</label>
            <div className="grid grid-cols-4 gap-2">
              {draft.photo_urls.map((u) => (
                <div key={u} className="relative group">
                  <img src={u} alt="" className="w-full aspect-square object-cover rounded" />
                  <button onClick={() => onRemovePhoto(u)}
                    className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <X size={12} />
                  </button>
                </div>
              ))}
              <label className="aspect-square border-2 border-dashed border-gray-300 dark:border-gray-700 rounded flex items-center justify-center cursor-pointer hover:border-blue-400">
                <Plus size={20} className="text-gray-400" />
                <input type="file" accept="image/*" className="hidden"
                  onChange={(e) => e.target.files?.[0] && onUploadPhoto(e.target.files[0])} />
              </label>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded">{tc('cancel')}</button>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 text-sm bg-blue-500 text-white rounded disabled:opacity-50">
            {saving ? '...' : tc('save')}
          </button>
        </div>
      </div>
    </div>
  )
}
