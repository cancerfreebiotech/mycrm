'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { PermissionGate } from '@/components/PermissionGate'
import { Loader2, Plus, Trash2, X, Calendar, ChevronLeft, ChevronRight, Pencil, Download, Wand2, Check } from 'lucide-react'

type Section = 'last_month' | 'next_month'

interface AiPreviewData {
  'zh-TW': { html: string; subject: string; promo: string }
  en: { html: string; subject: string; promo: string }
  ja: { html: string; subject: string; promo: string }
  story_count: number
  from_cache?: boolean
}

interface Draft {
  id: string
  period: string
  section: Section
  title: string | null
  content: string | null
  event_date: string | null
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
      const r = await fetch(`/api/newsletter/drafts?period=${period}`)
      const j = await r.json()
      setDrafts(j.drafts ?? [])
    } finally { setLoading(false) }
  }, [period])

  useEffect(() => { if (period) load() }, [period, load])

  async function createDraft(section: Section, fields: { title: string; content: string; event_date: string }) {
    const r = await fetch('/api/newsletter/drafts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ period, section, title: fields.title, content: fields.content || null, event_date: fields.event_date || null, created_via: 'web' }),
    })
    if (r.ok) { setComposing(null); await load() }
    else alert((await r.json()).error ?? '建立失敗')
  }

  async function updateDraft(id: string, patch: Partial<Draft>) {
    const r = await fetch(`/api/newsletter/drafts/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    })
    if (r.ok) await load()
    else alert((await r.json()).error ?? '更新失敗')
  }

  async function deleteDraft(id: string, title: string | null) {
    if (!confirm(`確定刪除「${title ?? '未命名'}」?`)) return
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
    } else alert((await r.json()).error ?? '上傳失敗')
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
      const j = await r.json()
      if (!r.ok) { alert(j.error ?? 'AI 編寫失敗'); return }
      setAiPreview({ ...j.preview, story_count: j.story_count, from_cache: !!j.from_cache })
    } finally { setAiBusy(false) }
  }

  async function aiCommit() {
    if (!confirm(`確定建立 3 個 draft campaigns（zh/en/ja）？\n建立後 ${aiPreview?.story_count ?? 0} 個 stories 會標為 used`)) return
    setAiBusy(true)
    try {
      const r = await fetch('/api/newsletter/compose-from-drafts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period, action: 'commit' }),
      })
      const j = await r.json()
      if (!r.ok) { alert(j.error ?? '建立失敗'); return }
      setAiPreview(null)
      router.push('/admin/newsletter/campaigns')
    } finally { setAiBusy(false) }
  }

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
                title="跳到此期"
                className="p-2 rounded text-green-600 hover:bg-green-50 dark:hover:bg-green-950/30 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Check size={20} />
              </button>
              <button
                onClick={() => { setEditingPeriod(false); setPeriodInput(period) }}
                title="取消"
                className="p-2 rounded text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X size={20} />
              </button>
            </div>
          ) : (
            <h1
              onClick={() => { setPeriodInput(period); setEditingPeriod(true) }}
              title="點擊修改期數"
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Column section="last_month" title={t('lastMonthSection')} drafts={lastMonth}
            onAdd={() => setComposing({ section: 'last_month' })} onEdit={setEditing} onDelete={deleteDraft} />
          <Column section="next_month" title={t('nextMonthSection')} drafts={nextMonth}
            onAdd={() => setComposing({ section: 'next_month' })} onEdit={setEditing} onDelete={deleteDraft} />
        </div>
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
  const [tab, setTab] = useState<'zh-TW' | 'en' | 'ja'>('zh-TW')
  const current = preview[tab]
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-gray-900 rounded-lg max-w-5xl w-full p-6 max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">
            🤖 AI 編寫預覽（{preview.story_count} stories）
            {preview.from_cache && <span className="ml-2 text-xs font-normal text-gray-500">· 取自快取（按右下「重新生成」可重跑 AI）</span>}
          </h3>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="flex gap-2 mb-3 border-b border-gray-200 dark:border-gray-700">
          {(['zh-TW', 'en', 'ja'] as const).map((l) => (
            <button key={l} onClick={() => setTab(l)}
              className={`px-3 py-2 text-sm border-b-2 ${tab === l ? 'border-purple-500 text-purple-600' : 'border-transparent text-gray-500'}`}>
              {l === 'zh-TW' ? '繁中' : l === 'en' ? 'English' : '日本語'}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto space-y-3">
          <div className="text-xs text-gray-500">Subject</div>
          <div className="font-medium text-gray-900 dark:text-gray-100">{current.subject}</div>
          <div className="text-xs text-gray-500 mt-3">Promo text</div>
          <div className="text-sm bg-gray-50 dark:bg-gray-800 p-2 rounded">{current.promo}</div>
          <div className="text-xs text-gray-500 mt-3">HTML 預覽</div>
          <iframe srcDoc={current.html} className="w-full h-[55vh] border border-gray-200 dark:border-gray-700 rounded bg-white" />
        </div>
        <div className="flex justify-between gap-2 mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
          <button onClick={onRegenerate} disabled={busy}
            className="flex items-center gap-1 px-4 py-2 text-sm border border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300 rounded hover:bg-purple-50 dark:hover:bg-purple-950/30 disabled:opacity-50">
            {busy ? <Loader2 size={14} className="animate-spin" /> : '🔄'} 重新生成
          </button>
          <div className="flex gap-2">
            <button onClick={onClose}
              className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded">取消</button>
            <button onClick={onCommit} disabled={busy}
              className="px-4 py-2 text-sm bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50">
              {busy ? '建立中…' : '建立 3 個 draft campaigns'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}


function Column({ section, title, drafts, onAdd, onEdit, onDelete }: {
  section: Section; title: string; drafts: Draft[];
  onAdd: () => void; onEdit: (d: Draft) => void; onDelete: (id: string, title: string | null) => void
}) {
  return (
    <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-800 dark:text-gray-200">
          {section === 'last_month' ? '📜' : '🔮'} {title} <span className="text-sm text-gray-500">({drafts.length})</span>
        </h2>
      </div>
      <div className="space-y-3">
        {drafts.map((d) => (
          <div key={d.id} onClick={() => onEdit(d)}
            className="bg-white dark:bg-gray-800 rounded p-3 border border-gray-200 dark:border-gray-700 cursor-pointer hover:border-blue-400 dark:hover:border-blue-500">
            <div className="flex justify-between items-start gap-2">
              <div className="font-medium text-gray-900 dark:text-gray-100 truncate flex-1">
                {d.title ?? <span className="text-gray-400">(無標題)</span>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={(e) => { e.stopPropagation(); onEdit(d) }}
                  title="編輯標題與內容"
                  className="text-gray-400 hover:text-blue-500"><Pencil size={14} /></button>
                <button onClick={(e) => { e.stopPropagation(); onDelete(d.id, d.title) }}
                  title="刪除"
                  className="text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
              </div>
            </div>
            {d.event_date && (
              <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                <Calendar size={12} /> {d.event_date}
              </div>
            )}
            {d.content && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 line-clamp-2">{d.content}</p>
            )}
            {d.photo_urls.length > 0 && (
              <div className="flex gap-1 mt-2">
                {d.photo_urls.slice(0, 4).map((u) => (
                  <img key={u} src={u} alt="" className="w-12 h-12 object-cover rounded" />
                ))}
                {d.photo_urls.length > 4 && (
                  <div className="w-12 h-12 rounded bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs">
                    +{d.photo_urls.length - 4}
                  </div>
                )}
              </div>
            )}
            <div className="text-xs text-gray-400 mt-2 flex items-center gap-2">
              <span>{d.creator?.display_name ?? d.creator?.email ?? '?'}</span>
              <span>·</span>
              <span>{d.created_via === 'telegram' ? '📱' : '💻'}</span>
            </div>
          </div>
        ))}
        <button onClick={onAdd}
          className="w-full flex items-center justify-center gap-1 p-3 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded text-sm text-gray-600 dark:text-gray-400 hover:border-blue-400 hover:text-blue-500">
          <Plus size={16} /> 新增 Story
        </button>
      </div>
    </div>
  )
}

function ComposeModal({ section, period, onCancel, onSubmit }: {
  section: Section; period: string
  onCancel: () => void
  onSubmit: (fields: { title: string; content: string; event_date: string }) => void
}) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [eventDate, setEventDate] = useState('')
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-gray-900 rounded-lg max-w-2xl w-full p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">
            新增 Story · {period} · {section === 'last_month' ? '上月回顧' : '下月預告'}
          </h3>
          <button onClick={onCancel}><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="標題（例：AACR Taiwan Night）"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
          <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} placeholder="事件日期"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
          <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="內容（之後可以再加照片）" rows={6}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onCancel}
            className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded">取消</button>
          <button onClick={() => title.trim() && onSubmit({ title: title.trim(), content: content.trim(), event_date: eventDate })}
            disabled={!title.trim()}
            className="px-4 py-2 text-sm bg-blue-500 text-white rounded disabled:opacity-50">新增</button>
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
  const [title, setTitle] = useState(draft.title ?? '')
  const [content, setContent] = useState(draft.content ?? '')
  const [eventDate, setEventDate] = useState(draft.event_date ?? '')
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
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">編輯 Story</h3>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        {used && (
          <div className="mb-3 p-2 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded text-sm">
            此 story 已被用於 campaign，不建議再修改
          </div>
        )}
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400">標題</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400">期數</label>
              <input value={draftPeriod} onChange={(e) => setDraftPeriod(e.target.value)} placeholder="YYYY-MM"
                pattern="^\d{4}-\d{2}$"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400">段落</label>
              <select value={section} onChange={(e) => setSection(e.target.value as Section)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                <option value="last_month">📜 上月回顧</option>
                <option value="next_month">🔮 下月預告</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400">事件日期</label>
              <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400">內容</label>
            <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={8}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">照片 ({draft.photo_urls.length})</label>
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
            className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded">取消</button>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 text-sm bg-blue-500 text-white rounded disabled:opacity-50">
            {saving ? '...' : '儲存'}
          </button>
        </div>
      </div>
    </div>
  )
}
