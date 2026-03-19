'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { sendMail } from '@/lib/graph'
import { ArrowLeft, ImageIcon, Mail, X, Pencil, Loader2, Plus, Upload, Trash2, Copy, Check, Sparkles, Paperclip, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'
import Image from 'next/image'

interface Tag { id: string; name: string }
interface Country { code: string; name_zh: string; emoji: string }
interface Contact {
  id: string
  name: string | null
  name_en: string | null
  name_local: string | null
  company: string | null
  company_en: string | null
  company_local: string | null
  job_title: string | null
  email: string | null
  second_email: string | null
  phone: string | null
  second_phone: string | null
  address: string | null
  website: string | null
  linkedin_url: string | null
  facebook_url: string | null
  notes: string | null
  country_code: string | null
  card_img_url: string | null
  card_img_back_url: string | null
  created_at: string
  created_by: string | null
  users: { display_name: string | null } | null
  contact_tags: { tags: Tag }[]
}
interface ContactCard { id: string; url: string; label: string | null; created_at: string }
interface Log {
  id: string
  content: string | null
  type: string
  meeting_date: string | null
  created_at: string
  users: { display_name: string | null } | null
}
interface TemplateAttachment { id: string; file_name: string; file_url: string; file_size: number }
interface EmailTemplate { id: string; title: string; subject: string | null; body_content: string | null; attachments: TemplateAttachment[] }
interface Recipient { email: string; label: string; contactId: string | null }
interface ContactOption { id: string; name: string; email: string }

const TYPE_COLOR: Record<string, string> = {
  note: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  meeting: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400',
  email: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400',
  system: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400',
}

const EMPTY_EDIT = {
  name: '', name_en: '', name_local: '',
  company: '', company_en: '', company_local: '',
  job_title: '',
  email: '', second_email: '',
  phone: '', second_phone: '',
  address: '', website: '',
  linkedin_url: '', facebook_url: '',
  notes: '',
  country_code: '',
}

const OCR_FIELD_LABELS: Record<string, string> = {
  name: '姓名', name_en: '英文姓名', name_local: '當地語言姓名',
  company: '公司', company_en: '英文公司', company_local: '當地語言公司',
  job_title: '職稱',
  email: 'Email', second_email: '第二 Email',
  phone: '電話', second_phone: '第二電話',
  address: '地址', website: '網站',
  linkedin_url: 'LinkedIn', facebook_url: 'Facebook',
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

function RecipientChipInput({
  recipients,
  onChange,
  contacts,
  placeholder,
}: {
  recipients: Recipient[]
  onChange: (r: Recipient[]) => void
  contacts: ContactOption[]
  placeholder: string
}) {
  const [input, setInput] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = input.trim().length >= 1
    ? contacts.filter(c =>
        (c.name.toLowerCase().includes(input.toLowerCase()) ||
         c.email.toLowerCase().includes(input.toLowerCase())) &&
        !recipients.some(r => r.email === c.email)
      ).slice(0, 8)
    : []

  function add(email: string, label: string, contactId: string | null) {
    const trimmed = email.trim()
    if (!trimmed || recipients.some(r => r.email === trimmed)) return
    onChange([...recipients, { email: trimmed, label: label || trimmed, contactId }])
    setInput('')
    setOpen(false)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if ((e.key === 'Enter' || e.key === ',') && input.trim()) {
      e.preventDefault()
      const email = input.trim().replace(/,+$/, '')
      if (email.includes('@')) add(email, email, null)
    }
    if (e.key === 'Backspace' && !input && recipients.length > 0) {
      onChange(recipients.slice(0, -1))
    }
    if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div
      className="flex flex-wrap gap-1.5 min-h-[38px] px-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 cursor-text focus-within:ring-2 focus-within:ring-blue-500 relative"
      onClick={() => inputRef.current?.focus()}
    >
      {recipients.map(r => (
        <span key={r.email} className="flex items-center gap-1 text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-0.5 rounded-full">
          {r.label !== r.email ? r.label : r.email}
          <button type="button" onClick={(e) => { e.stopPropagation(); onChange(recipients.filter(x => x.email !== r.email)) }} className="hover:text-red-500">
            <X size={10} />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        value={input}
        onChange={e => { setInput(e.target.value); setOpen(true) }}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={recipients.length === 0 ? placeholder : ''}
        className="flex-1 min-w-[140px] text-sm bg-transparent outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400"
      />
      {open && filtered.length > 0 && (
        <div className="absolute left-0 top-full mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20 max-h-48 overflow-y-auto">
          {filtered.map(c => (
            <button
              key={c.id}
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => add(c.email, c.name, c.id)}
              className="flex items-center justify-between w-full px-3 py-2 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/30 text-left"
            >
              <span className="font-medium text-gray-900 dark:text-gray-100">{c.name}</span>
              <span className="text-gray-400 text-xs ml-2">{c.email}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const t = useTranslations('contacts')
  const tm = useTranslations('mail')
  const tc = useTranslations('common')
  const supabase = createBrowserSupabaseClient()
  const editFileRef = useRef<HTMLInputElement>(null)
  const cardFilesRef = useRef<HTMLInputElement>(null)
  const tempAttachRef = useRef<HTMLInputElement>(null)

  const [contact, setContact] = useState<Contact | null>(null)
  const [contactCards, setContactCards] = useState<ContactCard[]>([])
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [allCountries, setAllCountries] = useState<Country[]>([])
  const [logs, setLogs] = useState<Log[]>([])
  const [hasMoreLogs, setHasMoreLogs] = useState(false)
  const [loadingMoreLogs, setLoadingMoreLogs] = useState(false)
  const logsOffsetRef = useRef(0)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null)
  const [aiModelId, setAiModelId] = useState<string | null>(null)
  const [msProviderToken, setMsProviderToken] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [lbScale, setLbScale] = useState(1)
  const [lbOffset, setLbOffset] = useState({ x: 0, y: 0 })
  const lbDragRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null)
  const lbPinchRef = useRef<{ dist: number; scale: number } | null>(null)

  function openLightbox(url: string) { setLightbox(url); setLbScale(1); setLbOffset({ x: 0, y: 0 }) }
  function closeLightbox() { setLightbox(null); setLbScale(1); setLbOffset({ x: 0, y: 0 }) }

  function lbZoom(delta: number) {
    setLbScale(s => Math.min(5, Math.max(0.5, s + delta)))
  }

  function lbReset() { setLbScale(1); setLbOffset({ x: 0, y: 0 }) }

  function lbOnWheel(e: React.WheelEvent) {
    e.preventDefault()
    lbZoom(e.deltaY < 0 ? 0.2 : -0.2)
  }

  function lbOnDoubleClick() {
    if (lbScale !== 1) { lbReset() } else { setLbScale(2) }
  }

  function lbOnMouseDown(e: React.MouseEvent) {
    e.preventDefault()
    lbDragRef.current = { startX: e.clientX, startY: e.clientY, ox: lbOffset.x, oy: lbOffset.y }
  }

  function lbOnMouseMove(e: React.MouseEvent) {
    if (!lbDragRef.current) return
    const { startX, startY, ox, oy } = lbDragRef.current
    setLbOffset({ x: ox + e.clientX - startX, y: oy + e.clientY - startY })
  }

  function lbOnMouseUp() { lbDragRef.current = null }

  function lbOnTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      lbPinchRef.current = { dist: Math.hypot(dx, dy), scale: lbScale }
    } else if (e.touches.length === 1) {
      lbDragRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY, ox: lbOffset.x, oy: lbOffset.y }
    }
  }

  function lbOnTouchMove(e: React.TouchEvent) {
    if (e.touches.length === 2 && lbPinchRef.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      const dist = Math.hypot(dx, dy)
      const newScale = Math.min(5, Math.max(0.5, lbPinchRef.current.scale * (dist / lbPinchRef.current.dist)))
      setLbScale(newScale)
    } else if (e.touches.length === 1 && lbDragRef.current) {
      const { startX, startY, ox, oy } = lbDragRef.current
      setLbOffset({ x: ox + e.touches[0].clientX - startX, y: oy + e.touches[0].clientY - startY })
    }
  }

  function lbOnTouchEnd() { lbDragRef.current = null; lbPinchRef.current = null }

  // Add log
  const [logContent, setLogContent] = useState('')
  const [logType, setLogType] = useState<'note' | 'meeting'>('note')
  const [logDate, setLogDate] = useState('')
  const [addingLog, setAddingLog] = useState(false)

  // Edit modal
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState(EMPTY_EDIT)
  const [editOcring, setEditOcring] = useState(false)
  const [editSaving, setEditSaving] = useState(false)

  // Multi-card staging
  const [stagedFiles, setStagedFiles] = useState<File[]>([])
  const [stagedPreviews, setStagedPreviews] = useState<string[]>([])
  const [cardOcring, setCardOcring] = useState(false)
  const [cardOcrDiff, setCardOcrDiff] = useState<Record<string, string> | null>(null)
  const [cardSaving, setCardSaving] = useState(false)

  // Tags
  const [tagInput, setTagInput] = useState('')
  const [tagDropOpen, setTagDropOpen] = useState(false)

  // Email copy
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null)

  // Mail modal
  const [mailOpen, setMailOpen] = useState(false)
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [contactOptions, setContactOptions] = useState<ContactOption[]>([])
  const [mailToList, setMailToList] = useState<Recipient[]>([])
  const [mailCcList, setMailCcList] = useState<Recipient[]>([])
  const [mailBccList, setMailBccList] = useState<Recipient[]>([])
  const [mailSubject, setMailSubject] = useState('')
  const [mailBody, setMailBody] = useState('')
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [templateAttachments, setTemplateAttachments] = useState<TemplateAttachment[]>([])
  const [tempAttaches, setTempAttaches] = useState<Array<{ name: string; base64: string; contentType: string; size: number }>>([])
  const [mailAiDesc, setMailAiDesc] = useState('')
  const [mailAiGenerating, setMailAiGenerating] = useState(false)
  const [mailSending, setMailSending] = useState(false)
  const [mailError, setMailError] = useState<string | null>(null)

  const LOG_PAGE = 20

  useEffect(() => { load() }, [id])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeLightbox() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (user?.email) {
      const { data: profile } = await supabase.from('users').select('id, ai_model_id, provider_token, role').eq('email', user.email).single()
      if (profile) { setCurrentUserId(profile.id); setAiModelId(profile.ai_model_id ?? null); setMsProviderToken(profile.provider_token ?? null); setCurrentUserRole(profile.role ?? null) }
    }
    const [{ data: c }, { data: l }, { data: tags }, { data: cards }, { data: countries }] = await Promise.all([
      supabase.from('contacts').select('*, users(display_name), contact_tags(tags(id, name))').eq('id', id).single(),
      supabase.from('interaction_logs').select('id, content, type, meeting_date, created_at, users(display_name)').eq('contact_id', id).order('created_at', { ascending: false }).range(0, LOG_PAGE - 1),
      supabase.from('tags').select('id, name').order('name'),
      supabase.from('contact_cards').select('id, url, label, created_at').eq('contact_id', id).order('created_at', { ascending: true }),
      supabase.from('countries').select('code, name_zh, emoji').eq('is_active', true).order('name_zh'),
    ])
    setContact(c as unknown as Contact)
    const initialLogs = (l as unknown as Log[]) ?? []
    setLogs(initialLogs)
    logsOffsetRef.current = initialLogs.length
    setHasMoreLogs(initialLogs.length === LOG_PAGE)
    setAllTags(tags ?? [])
    setContactCards(cards ?? [])
    setAllCountries(countries ?? [])
  }

  const loadMoreLogs = useCallback(async () => {
    if (loadingMoreLogs || !hasMoreLogs) return
    setLoadingMoreLogs(true)
    const from = logsOffsetRef.current
    const { data } = await supabase
      .from('interaction_logs')
      .select('id, content, type, meeting_date, created_at, users(display_name)')
      .eq('contact_id', id)
      .order('created_at', { ascending: false })
      .range(from, from + LOG_PAGE - 1)
    const more = (data as unknown as Log[]) ?? []
    setLogs((prev) => [...prev, ...more])
    logsOffsetRef.current = from + more.length
    setHasMoreLogs(more.length === LOG_PAGE)
    setLoadingMoreLogs(false)
  }, [loadingMoreLogs, hasMoreLogs, id])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMoreLogs() },
      { threshold: 0.1 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [loadMoreLogs])

  // ── Edit ────────────────────────────────────────────────────────────────────

  function openEdit() {
    if (!contact) return
    setEditForm({
      name: contact.name ?? '',
      name_en: contact.name_en ?? '',
      name_local: contact.name_local ?? '',
      company: contact.company ?? '',
      company_en: contact.company_en ?? '',
      company_local: contact.company_local ?? '',
      job_title: contact.job_title ?? '',
      email: contact.email ?? '',
      second_email: contact.second_email ?? '',
      phone: contact.phone ?? '',
      second_phone: contact.second_phone ?? '',
      address: contact.address ?? '',
      website: contact.website ?? '',
      linkedin_url: contact.linkedin_url ?? '',
      facebook_url: contact.facebook_url ?? '',
      notes: contact.notes ?? '',
      country_code: contact.country_code ?? '',
    })
    setEditOpen(true)
  }

  function compressImage(file: File, maxSide = 1024, quality = 0.85): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new window.Image()
      const url = URL.createObjectURL(file)
      img.onload = () => {
        URL.revokeObjectURL(url)
        let { width, height } = img
        if (width > maxSide || height > maxSide) {
          if (width >= height) { height = Math.round((height * maxSide) / width); width = maxSide }
          else { width = Math.round((width * maxSide) / height); height = maxSide }
        }
        const canvas = document.createElement('canvas')
        canvas.width = width; canvas.height = height
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', quality).split(',')[1])
      }
      img.onerror = reject
      img.src = url
    })
  }

  async function handleEditImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setEditOcring(true)
    try {
      const base64 = await compressImage(file)
      const res = await fetch('/api/ocr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: base64, model: aiModelId }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setEditForm((prev) => ({
        ...prev,
        name: data.name || prev.name,
        name_en: data.name_en || prev.name_en,
        name_local: data.name_local || prev.name_local,
        company: data.company || prev.company,
        company_en: data.company_en || prev.company_en,
        company_local: data.company_local || prev.company_local,
        job_title: data.job_title || prev.job_title,
        email: data.email || prev.email,
        second_email: data.second_email || prev.second_email,
        phone: data.phone || prev.phone,
        second_phone: data.second_phone || prev.second_phone,
        address: data.address || prev.address,
        website: data.website || prev.website,
        linkedin_url: data.linkedin_url || prev.linkedin_url,
        facebook_url: data.facebook_url || prev.facebook_url,
      }))
    } finally { setEditOcring(false) }
  }

  async function saveEdit() {
    setEditSaving(true)
    try {
      const payload = Object.fromEntries(
        Object.entries(editForm).map(([k, v]) => [k, v.trim() || null])
      )
      await supabase.from('contacts').update(payload).eq('id', id)
      setEditOpen(false)
      load()
    } finally { setEditSaving(false) }
  }

  // ── Contact Cards (multi-stage) ────────────────────────────────────────────

  function handleCardFilesAdd(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    setStagedFiles((prev) => {
      const maxNew = 6 - allCards.length - prev.length
      return [...prev, ...files].slice(0, prev.length + maxNew)
    })
    const newPreviews = files.map((f) => URL.createObjectURL(f))
    setStagedPreviews((prev) => {
      const maxNew = 6 - allCards.length - prev.length
      return [...prev, ...newPreviews].slice(0, prev.length + maxNew)
    })
    setCardOcrDiff(null)
    if (e.target) e.target.value = ''
  }

  async function handleCardOcr() {
    if (stagedFiles.length === 0 || !contact) return
    setCardOcring(true)
    try {
      const bases = await Promise.all(stagedFiles.map((f) => compressImage(f)))
      const res = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: bases, model: aiModelId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      const diff: Record<string, string> = {}
      for (const field of Object.keys(OCR_FIELD_LABELS)) {
        const ocrVal = data[field] as string | undefined
        const contactVal = contact[field as keyof Contact] as string | null
        if (ocrVal && !contactVal) {
          diff[field] = ocrVal
        }
      }
      setCardOcrDiff(diff)
    } catch {
      setCardOcrDiff({})
    } finally {
      setCardOcring(false)
    }
  }

  async function confirmCardSave() {
    if (stagedFiles.length === 0) return
    setCardSaving(true)
    try {
      await Promise.all(
        stagedFiles.map(async (file, i) => {
          const base64 = await compressImage(file)
          const uint8 = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
          const filename = `cards/${id}_${Date.now()}_${i}.jpg`
          const { error: uploadErr } = await supabase.storage.from('cards').upload(filename, uint8, { contentType: 'image/jpeg' })
          if (uploadErr) throw uploadErr
          const { data: urlData } = supabase.storage.from('cards').getPublicUrl(filename)
          await supabase.from('contact_cards').insert({ contact_id: id, url: urlData.publicUrl, storage_path: filename, label: null })
        })
      )
      if (cardOcrDiff && Object.keys(cardOcrDiff).length > 0) {
        await supabase.from('contacts').update(cardOcrDiff).eq('id', id)
      }
      cancelCardUpload()
      load()
    } finally {
      setCardSaving(false)
    }
  }

  function cancelCardUpload() {
    stagedPreviews.forEach((url) => URL.revokeObjectURL(url))
    setStagedFiles([])
    setStagedPreviews([])
    setCardOcrDiff(null)
  }

  async function deleteCard(cardId: string) {
    if (!confirm('確定要刪除此名片圖？')) return
    await supabase.from('contact_cards').delete().eq('id', cardId)
    load()
  }

  // ── Tags ────────────────────────────────────────────────────────────────────

  async function addTag(tag: Tag) {
    await supabase.from('contact_tags').upsert({ contact_id: id, tag_id: tag.id })
    setTagDropOpen(false); setTagInput(''); load()
  }

  async function removeTag(tagId: string) {
    await supabase.from('contact_tags').delete().eq('contact_id', id).eq('tag_id', tagId)
    load()
  }

  const contactTagIds = contact?.contact_tags.map((ct) => ct.tags?.id) ?? []
  const filteredTags = allTags.filter((t) => !contactTagIds.includes(t.id) && t.name.toLowerCase().includes(tagInput.toLowerCase()))

  // ── Interaction Logs ─────────────────────────────────────────────────────────

  async function handleAddLog() {
    if (!logContent.trim()) return
    setAddingLog(true)
    const { data } = await supabase.from('interaction_logs')
      .insert({ contact_id: id, content: logContent.trim(), type: logType, meeting_date: logType === 'meeting' && logDate ? logDate : null, created_by: currentUserId })
      .select('id, content, type, meeting_date, created_at, users(display_name)').single()
    if (data) {
      setLogs((prev) => [data as unknown as Log, ...prev])
      logsOffsetRef.current += 1
    }
    setLogContent(''); setLogDate(''); setAddingLog(false)
  }

  // ── Email copy ────────────────────────────────────────────────────────────────

  function copyEmail(email: string) {
    navigator.clipboard.writeText(email)
    setCopiedEmail(email)
    setTimeout(() => setCopiedEmail(null), 1500)
  }

  // ── Mail ─────────────────────────────────────────────────────────────────────

  async function openMailModal() {
    const [{ data: tplData }, { data: cData }] = await Promise.all([
      supabase.from('email_templates').select('id, title, subject, body_content, template_attachments(id, file_name, file_url, file_size)').order('title'),
      supabase.from('contacts').select('id, name, name_en, email').not('email', 'is', null).order('name'),
    ])
    const tplList = (tplData ?? []).map((t: Record<string, unknown>) => ({
      id: t.id as string,
      title: t.title as string,
      subject: t.subject as string | null,
      body_content: t.body_content as string | null,
      attachments: (t.template_attachments as TemplateAttachment[]) ?? [],
    }))
    setTemplates(tplList)
    setContactOptions((cData ?? []).map((c: Record<string, unknown>) => ({
      id: c.id as string,
      name: (c.name || c.name_en || c.email) as string,
      email: c.email as string,
    })))
    const defaultTo: Recipient[] = contact?.email
      ? [{ email: contact.email, label: contact.name || contact.name_en || contact.email, contactId: id as string }]
      : []
    setMailToList(defaultTo)
    setMailCcList([])
    setMailBccList([])
    setMailSubject('')
    setMailBody('')
    setSelectedTemplateId('')
    setTemplateAttachments([])
    setTempAttaches([])
    setMailAiDesc('')
    setMailError(null)
    setMailOpen(true)
  }

  function handleTemplateChange(templateId: string) {
    setSelectedTemplateId(templateId)
    if (!templateId) {
      setTemplateAttachments([])
      return
    }
    const tpl = templates.find((t) => t.id === templateId)
    if (tpl) {
      setMailSubject(tpl.subject ?? '')
      setMailBody(tpl.body_content ?? '')
      setTemplateAttachments(tpl.attachments)
    }
  }

  async function handleAiGenerateMail() {
    if (!mailAiDesc.trim()) return
    setMailAiGenerating(true)
    setMailError(null)
    try {
      // Ignore Telegram scan logs ("透過 Telegram Bot 新增名片")
      const lastLog = logs.find(l => l.type !== 'scan' && !l.content?.includes('新增名片'))?.content ?? ''
      const description = lastLog ? `${mailAiDesc}\n\n最近互動：${lastLog}` : mailAiDesc
      const tpl = selectedTemplateId ? templates.find((t) => t.id === selectedTemplateId) : null
      const res = await fetch('/api/ai-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, templateContent: tpl?.body_content ?? undefined, model: aiModelId, generateSubject: true }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setMailBody(data.html)
      if (data.subject) setMailSubject(data.subject)
    } catch (e) {
      setMailError(e instanceof Error ? e.message : 'AI 生成失敗')
    } finally {
      setMailAiGenerating(false)
    }
  }

  async function handleAddTempAttach(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    const MAX = 5 * 1024 * 1024
    setMailError(null)
    for (const file of files) {
      if (file.size > MAX) {
        setMailError(`「${file.name}」超過 5MB 限制`)
        continue
      }
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.readAsDataURL(file)
      })
      setTempAttaches((prev) => [...prev, { name: file.name, base64, contentType: file.type || 'application/octet-stream', size: file.size }])
    }
    if (e.target) e.target.value = ''
  }

  async function urlToBase64(url: string): Promise<string> {
    const res = await fetch(url)
    const buf = await res.arrayBuffer()
    const bytes = new Uint8Array(buf)
    let binary = ''
    bytes.forEach((b) => { binary += String.fromCharCode(b) })
    return btoa(binary)
  }

  async function handleSendMail() {
    if (mailToList.length === 0 || !mailSubject.trim()) return
    setMailSending(true); setMailError(null)
    try {
      const tokenRes = await fetch('/api/provider-token')
      if (!tokenRes.ok) {
        const err = await tokenRes.json().catch(() => ({}))
        throw new Error(err?.error ?? '找不到 Microsoft 存取權限，請重新登入')
      }
      const { token: accessToken } = await tokenRes.json()

      const attachments: { name: string; contentType: string; contentBytes: string }[] = []

      for (const a of templateAttachments) {
        try {
          const contentBytes = await urlToBase64(a.file_url)
          const ext = a.file_name.split('.').pop()?.toLowerCase() ?? ''
          const contentType = ext === 'pdf' ? 'application/pdf'
            : ['xlsx', 'xls'].includes(ext) ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            : ext === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            : 'application/octet-stream'
          attachments.push({ name: a.file_name, contentType, contentBytes })
        } catch { /* skip failed fetch */ }
      }

      for (const a of tempAttaches) {
        attachments.push({ name: a.name, contentType: a.contentType, contentBytes: a.base64 })
      }

      const toStr = mailToList.map(r => r.email).join(', ')
      const ccStr = mailCcList.map(r => r.email).join(', ')
      const bccStr = mailBccList.map(r => r.email).join(', ')

      await sendMail({ accessToken, to: toStr, cc: ccStr || undefined, bcc: bccStr || undefined, subject: mailSubject, body: mailBody, attachments: attachments.length > 0 ? attachments : undefined })

      // Add interaction log for every selected CRM contact
      const allRecipients = [...mailToList, ...mailCcList, ...mailBccList]
      const uniqueContactIds = [...new Set(allRecipients.filter(r => r.contactId).map(r => r.contactId!))]
      const logContent = `寄送郵件：${mailSubject}`
      if (uniqueContactIds.length > 0) {
        const inserts = uniqueContactIds.map(cid => ({ contact_id: cid, content: logContent, type: 'email', created_by: currentUserId }))
        const { data: logRows } = await supabase.from('interaction_logs')
          .insert(inserts)
          .select('id, content, type, meeting_date, created_at, users(display_name)')
        // Update UI only for the current contact's log
        const currentLog = (logRows ?? []).find((r: Record<string, unknown>) => r.contact_id === id || uniqueContactIds[0] === id)
        if (currentLog) setLogs((prev) => [currentLog as unknown as Log, ...prev])
        else if (logRows && logRows.length > 0) setLogs((prev) => [logRows[0] as unknown as Log, ...prev])
      }

      setMailOpen(false)
    } catch (e) {
      setMailError(e instanceof Error ? e.message : '寄送失敗，請稍後再試')
    } finally { setMailSending(false) }
  }

  async function handleDelete() {
    if (!confirm(`確定要刪除「${contact?.name || contact?.name_en || '此聯絡人'}」？此操作無法復原。`)) return
    setDeleting(true)
    try {
      // Delete storage files
      const { data: cards } = await supabase.from('contact_cards').select('storage_path').eq('contact_id', id)
      const paths = (cards ?? []).map((c: { storage_path: string }) => c.storage_path).filter(Boolean)
      if (paths.length > 0) await supabase.storage.from('cards').remove(paths)
      // Delete contact (cascades to contact_cards, contact_tags, interaction_logs)
      await supabase.from('contacts').delete().eq('id', id)
      router.push('/contacts')
    } catch (e) {
      alert(e instanceof Error ? e.message : '刪除失敗')
      setDeleting(false)
    }
  }

  const canDelete = currentUserRole === 'super_admin' || contact?.created_by === currentUserId

  if (!contact) return <div className="text-gray-400 text-sm">{tc('loading')}</div>

  const inputClass = 'w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500'
  const labelClass = 'block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1'

  function InfoRow({ label, value, href, copyable }: { label: string; value: string | null | undefined; href?: string; copyable?: boolean }) {
    if (!value) return null
    return (
      <div className="flex gap-3 text-sm">
        <span className="w-24 text-gray-400 dark:text-gray-500 shrink-0">{label}</span>
        <span className="flex items-center gap-1.5 min-w-0">
          {href ? (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline truncate">{value}</a>
          ) : (
            <span className="text-gray-900 dark:text-gray-100 truncate">{value}</span>
          )}
          {copyable && (
            <button
              onClick={() => copyEmail(value)}
              className="text-gray-400 hover:text-blue-500 transition-colors flex-shrink-0"
              title="複製"
            >
              {copiedEmail === value ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
            </button>
          )}
        </span>
      </div>
    )
  }

  // All card images: from contact_cards table + legacy fields
  const legacyCards: ContactCard[] = []
  if (contact.card_img_url && contactCards.length === 0) {
    legacyCards.push({ id: 'legacy-front', url: contact.card_img_url, label: '正面', created_at: contact.created_at })
  }
  if (contact.card_img_back_url && contactCards.length === 0) {
    legacyCards.push({ id: 'legacy-back', url: contact.card_img_back_url, label: '反面', created_at: contact.created_at })
  }
  const allCards = contactCards.length > 0 ? contactCards : legacyCards

  return (
    <div className="max-w-2xl mx-auto">
      <button onClick={() => router.push('/contacts')} className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 mb-5">
        <ArrowLeft size={16} /> {t('backToList')}
      </button>

      {/* Basic Info */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-4">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex-1 min-w-0 space-y-1.5">
            <InfoRow label={t('name')} value={contact.name} />
            <InfoRow label={t('nameEn')} value={contact.name_en} />
            <InfoRow label={t('nameLocal')} value={contact.name_local} />
            <InfoRow label={t('company')} value={contact.company} />
            <InfoRow label={t('companyEn')} value={contact.company_en} />
            <InfoRow label={t('companyLocal')} value={contact.company_local} />
            <InfoRow label={t('jobTitle')} value={contact.job_title} />
            <InfoRow label="Email" value={contact.email} href={contact.email ? `mailto:${contact.email}` : undefined} copyable />
            <InfoRow label={t('secondEmail')} value={contact.second_email} href={contact.second_email ? `mailto:${contact.second_email}` : undefined} copyable />
            <InfoRow label={t('phone')} value={contact.phone} href={contact.phone ? `tel:${contact.phone}` : undefined} />
            <InfoRow label={t('secondPhone')} value={contact.second_phone} href={contact.second_phone ? `tel:${contact.second_phone}` : undefined} />
            <InfoRow label={t('address')} value={contact.address} />
            <InfoRow label={t('website')} value={contact.website} href={contact.website ?? undefined} />
            {contact.country_code && (() => {
              const c = allCountries.find((c) => c.code === contact.country_code)
              return <InfoRow label={t('country')} value={c ? `${c.emoji} ${c.name_zh}` : contact.country_code} />
            })()}
            <InfoRow label="LinkedIn" value={contact.linkedin_url} href={contact.linkedin_url ?? undefined} />
            <InfoRow label="Facebook" value={contact.facebook_url} href={contact.facebook_url ?? undefined} />
            <InfoRow label={t('creator')} value={contact.users?.display_name} />
            {contact.notes && (
              <div className="flex gap-3 text-sm mt-2">
                <span className="w-24 text-gray-400 dark:text-gray-500 shrink-0">{t('notes')}</span>
                <span className="text-gray-700 dark:text-gray-300 whitespace-pre-line">{contact.notes}</span>
              </div>
            )}
          </div>
        </div>

        {/* Tags */}
        <div className="mb-4">
          <div className="flex flex-wrap gap-1.5 items-center">
            {contact.contact_tags.map((ct) => ct.tags && (
              <span key={ct.tags.id} className="flex items-center gap-1 text-xs bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">
                {ct.tags.name}
                <button onClick={() => removeTag(ct.tags!.id)} className="hover:text-red-500"><X size={10} /></button>
              </span>
            ))}
            <div className="relative">
              <button onClick={() => setTagDropOpen((v) => !v)} className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 hover:text-blue-600 px-2 py-0.5 rounded-full border border-dashed border-gray-300 dark:border-gray-600">
                <Plus size={10} /> {t('addTag')}
              </button>
              {tagDropOpen && (
                <div className="absolute top-full mt-1 left-0 z-10 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-2 min-w-40">
                  <input autoFocus value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="搜尋 tag..." className="w-full text-xs px-2 py-1 border border-gray-200 dark:border-gray-700 rounded mb-1 bg-white dark:bg-gray-800" />
                  {filteredTags.map((tag) => (
                    <button key={tag.id} onClick={() => addTag(tag)} className="w-full text-left text-xs px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800 rounded text-gray-700 dark:text-gray-300">{tag.name}</button>
                  ))}
                  {filteredTags.length === 0 && <p className="text-xs text-gray-400 px-2 py-1">{t('noTagsMatch')}</p>}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-4 border-t border-gray-100 dark:border-gray-800 flex-wrap">
          <button onClick={openEdit} className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
            <Pencil size={14} /> {tc('edit')}
          </button>
          {contact.email && (
            <button onClick={openMailModal} className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              <Mail size={14} /> {t('sendMail')}
            </button>
          )}
          {canDelete && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 disabled:opacity-50 ml-auto"
            >
              {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              {tc('delete')}
            </button>
          )}
        </div>
      </div>

      {/* Contact Cards */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-4">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">{t('cardImages')}</h2>

        {/* Saved cards gallery */}
        {allCards.length > 0 && (
          <div className="flex flex-wrap gap-3 mb-4">
            {allCards.map((card) => (
              <div key={card.id} className="relative group">
                <div className="w-36 h-24 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 cursor-pointer relative" onClick={() => openLightbox(card.url)}>
                  <Image src={card.url} alt={card.label ?? '名片'} width={144} height={96} className="object-cover w-full h-full" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                    <ZoomIn size={20} className="text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
                  </div>
                </div>
                {card.label && <p className="text-xs text-center text-gray-500 dark:text-gray-400 mt-1">{card.label}</p>}
                {!card.id.startsWith('legacy') && (
                  <button
                    onClick={() => deleteCard(card.id)}
                    className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 size={10} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* No cards placeholder */}
        {allCards.length === 0 && stagedFiles.length === 0 && (
          <div className="flex items-center justify-center w-36 h-24 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 mb-4">
            <ImageIcon size={24} className="text-gray-300 dark:text-gray-600" />
          </div>
        )}

        {/* Staged files preview + actions */}
        {stagedFiles.length > 0 && (
          <div className="mb-4">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">待上傳（{stagedFiles.length} 張）</p>
            <div className="flex flex-wrap gap-3 mb-3">
              {stagedPreviews.map((src, i) => (
                <div key={i} className="relative group">
                  <div className="w-36 h-24 rounded-lg overflow-hidden border-2 border-dashed border-blue-400">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={`待上傳-${i + 1}`} className="object-cover w-full h-full" />
                  </div>
                  <button
                    onClick={() => {
                      URL.revokeObjectURL(stagedPreviews[i])
                      setStagedFiles((prev) => prev.filter((_, idx) => idx !== i))
                      setStagedPreviews((prev) => prev.filter((_, idx) => idx !== i))
                      setCardOcrDiff(null)
                    }}
                    className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>

            {/* OCR diff */}
            {cardOcrDiff !== null && (
              <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg text-sm mb-3">
                {Object.keys(cardOcrDiff).length > 0 ? (
                  <>
                    <p className="text-xs font-medium text-blue-700 dark:text-blue-400 mb-2">以下空白欄位將補上 OCR 識別結果：</p>
                    <div className="space-y-1">
                      {Object.entries(cardOcrDiff).map(([field, value]) => (
                        <div key={field} className="flex gap-2 text-xs">
                          <span className="text-gray-500 dark:text-gray-400 w-28 shrink-0">{OCR_FIELD_LABELS[field] ?? field}</span>
                          <span className="text-gray-900 dark:text-gray-100">{value}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-gray-500 dark:text-gray-400">OCR 未找到可補充的空白欄位，仍可儲存名片圖</p>
                )}
              </div>
            )}

            {/* Card staging actions */}
            <div className="flex gap-2">
              {!cardOcring && cardOcrDiff === null && (
                <button
                  onClick={handleCardOcr}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  <Sparkles size={14} /> OCR 辨識
                </button>
              )}
              {cardOcring && (
                <span className="flex items-center gap-1.5 text-sm text-blue-500 px-1">
                  <Loader2 size={14} className="animate-spin" /> 辨識中...
                </span>
              )}
              {cardOcrDiff !== null && (
                <button
                  onClick={confirmCardSave}
                  disabled={cardSaving}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {cardSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  確認儲存
                </button>
              )}
              <button
                onClick={cancelCardUpload}
                className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                取消
              </button>
            </div>
          </div>
        )}

        {/* Add card button */}
        {stagedFiles.length === 0 && allCards.length < 6 && (
          <div>
            <button
              onClick={() => cardFilesRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <Upload size={14} /> {t('uploadCard')}
            </button>
            <input ref={cardFilesRef} type="file" accept="image/*" multiple className="hidden" onChange={handleCardFilesAdd} />
          </div>
        )}
      </div>

      {/* Interaction Logs */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">{t('interactionLogs')}</h2>
        {/* Add Log */}
        <div className="space-y-2 mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <div className="flex gap-2">
            <select value={logType} onChange={(e) => setLogType(e.target.value as 'note' | 'meeting')}
              className="text-sm px-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
              <option value="note">{t('logTypes.note')}</option>
              <option value="meeting">{t('logTypes.meeting')}</option>
            </select>
            {logType === 'meeting' && (
              <input type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)}
                className="text-sm px-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100" />
            )}
          </div>
          <div className="flex gap-2">
            <input type="text" value={logContent} onChange={(e) => setLogContent(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddLog()}
              placeholder={t('logPlaceholder')} className="flex-1 text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <button onClick={handleAddLog} disabled={addingLog || !logContent.trim()}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">{tc('add')}</button>
          </div>
        </div>
        {/* Timeline */}
        {logs.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">{t('noLogs')}</p>
        ) : (
          <ol className="relative border-l border-gray-200 dark:border-gray-700 space-y-5 pl-5">
            {logs.map((log) => (
              <li key={log.id} className="relative">
                <div className="absolute -left-[21px] top-1 w-3 h-3 rounded-full bg-blue-500 border-2 border-white dark:border-gray-900" />
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs px-2 py-0.5 rounded ${TYPE_COLOR[log.type] ?? TYPE_COLOR.note}`}>
                    {t(`logTypes.${log.type as 'note' | 'meeting' | 'email' | 'system'}`)}
                  </span>
                  {log.meeting_date && <span className="text-xs text-gray-500 dark:text-gray-400">📅 {log.meeting_date}</span>}
                </div>
                <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-line">{log.content}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {log.users?.display_name && <span className="text-xs text-gray-500 dark:text-gray-400">{log.users.display_name}</span>}
                  <time className="text-xs text-gray-400 dark:text-gray-500">{new Date(log.created_at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}</time>
                </div>
              </li>
            ))}
          </ol>
        )}
        {/* Infinite scroll sentinel */}
        {hasMoreLogs && (
          <div ref={sentinelRef} className="pt-4 text-center">
            {loadingMoreLogs && (
              <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                <Loader2 size={12} className="animate-spin" /> {t('loadMore')}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 bg-black/85 flex items-center justify-center z-50 overflow-hidden"
          onClick={closeLightbox}
        >
          {/* Toolbar */}
          <div className="absolute top-4 right-4 flex items-center gap-2 z-10" onClick={(e) => e.stopPropagation()}>
            <button
              className="text-white/80 hover:text-white bg-black/40 rounded-full p-2 transition-colors"
              onClick={() => lbZoom(0.25)}
              title="放大"
            ><ZoomIn size={18} /></button>
            <button
              className="text-white/80 hover:text-white bg-black/40 rounded-full p-2 transition-colors"
              onClick={() => lbZoom(-0.25)}
              title="縮小"
            ><ZoomOut size={18} /></button>
            <button
              className="text-white/80 hover:text-white bg-black/40 rounded-full p-2 transition-colors"
              onClick={lbReset}
              title="重置"
            ><Maximize2 size={18} /></button>
            <button
              className="text-white/80 hover:text-white bg-black/40 rounded-full p-2 transition-colors"
              onClick={closeLightbox}
              title="關閉"
            ><X size={18} /></button>
          </div>

          {/* Scale indicator */}
          <div className="absolute top-4 left-4 text-white/60 text-xs bg-black/40 rounded px-2 py-1 z-10 select-none">
            {Math.round(lbScale * 100)}%
          </div>

          {/* Image */}
          <div
            className="select-none"
            style={{
              transform: `translate(${lbOffset.x}px, ${lbOffset.y}px) scale(${lbScale})`,
              transformOrigin: 'center center',
              cursor: lbScale > 1 ? 'grab' : 'default',
              transition: lbDragRef.current ? 'none' : 'transform 0.1s ease',
            }}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={lbOnDoubleClick}
            onWheel={lbOnWheel}
            onMouseDown={lbOnMouseDown}
            onMouseMove={lbOnMouseMove}
            onMouseUp={lbOnMouseUp}
            onMouseLeave={lbOnMouseUp}
            onTouchStart={lbOnTouchStart}
            onTouchMove={lbOnTouchMove}
            onTouchEnd={lbOnTouchEnd}
          >
            <Image
              src={lightbox}
              alt="名片大圖"
              width={1200}
              height={800}
              className="max-w-[92vw] max-h-[88vh] object-contain rounded-lg shadow-2xl pointer-events-none"
              draggable={false}
            />
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-900 z-10">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">{t('editContact')}</h3>
              <button onClick={() => setEditOpen(false)} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"><X size={18} /></button>
            </div>
            <div className="px-6 py-5 space-y-5">
              {/* OCR scan */}
              <div onClick={() => editFileRef.current?.click()} className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-4 text-center cursor-pointer hover:border-blue-400 relative">
                <input ref={editFileRef} type="file" accept="image/*" className="hidden" onChange={handleEditImage} />
                {editOcring ? (
                  <div className="flex items-center justify-center gap-2 py-3 text-sm text-blue-500">
                    <Loader2 size={16} className="animate-spin" /> AI 辨識中...
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 py-2">{t('scanCard')}</p>
                )}
              </div>

              {/* Name section */}
              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">{t('name')}</p>
                <div className="grid grid-cols-1 gap-3">
                  {([[t('name'), 'name'], [t('nameEn'), 'name_en'], [t('nameLocal'), 'name_local']] as [string, string][]).map(([label, field]) => (
                    <div key={field}>
                      <label className={labelClass}>{label}</label>
                      <input type="text" value={editForm[field as keyof typeof editForm]}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, [field]: e.target.value }))}
                        className={inputClass} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Company section */}
              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">{t('sectionCompany')}</p>
                <div className="grid grid-cols-1 gap-3">
                  {([[t('company'), 'company'], [t('companyEn'), 'company_en'], [t('companyLocal'), 'company_local'], [t('jobTitle'), 'job_title']] as [string, string][]).map(([label, field]) => (
                    <div key={field}>
                      <label className={labelClass}>{label}</label>
                      <input type="text" value={editForm[field as keyof typeof editForm]}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, [field]: e.target.value }))}
                        className={inputClass} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Contact section */}
              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">{t('sectionContact')}</p>
                <div className="grid grid-cols-1 gap-3">
                  {([['Email', 'email', 'email'], [t('secondEmail'), 'second_email', 'email'], [t('phone'), 'phone', 'tel'], [t('secondPhone'), 'second_phone', 'tel'], [t('address'), 'address', 'text'], [t('website'), 'website', 'url']] as [string, string, string][]).map(([label, field, type]) => (
                    <div key={field}>
                      <label className={labelClass}>{label}</label>
                      <input type={type} value={editForm[field as keyof typeof editForm]}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, [field]: e.target.value }))}
                        className={inputClass} />
                    </div>
                  ))}
                  <div>
                    <label className={labelClass}>{t('country')}</label>
                    <select
                      value={editForm.country_code}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, country_code: e.target.value }))}
                      className={inputClass}
                    >
                      <option value="">—</option>
                      {allCountries.map((c) => (
                        <option key={c.code} value={c.code}>{c.emoji} {c.name_zh}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Social section */}
              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">{t('sectionSocial')}</p>
                <div className="grid grid-cols-1 gap-3">
                  {([['LinkedIn', 'linkedin_url'], ['Facebook', 'facebook_url']] as [string, string][]).map(([label, field]) => (
                    <div key={field}>
                      <label className={labelClass}>{label}</label>
                      <input type="url" value={editForm[field as keyof typeof editForm]}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, [field]: e.target.value }))}
                        className={inputClass} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className={labelClass}>{t('notes')}</label>
                <textarea value={editForm.notes} onChange={(e) => setEditForm((prev) => ({ ...prev, notes: e.target.value }))}
                  rows={3} className={inputClass + ' resize-none'} />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 sticky bottom-0 bg-white dark:bg-gray-900">
              <button onClick={() => setEditOpen(false)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900">{tc('cancel')}</button>
              <button onClick={saveEdit} disabled={editSaving || editOcring}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {editSaving && <Loader2 size={14} className="animate-spin" />} {tc('save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mail Modal */}
      {mailOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">{tm('title')}</h3>
              <button onClick={() => setMailOpen(false)} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"><X size={18} /></button>
            </div>
            <div className="px-6 py-5 space-y-4 overflow-y-auto">
              {/* To / CC / BCC */}
              <div className="space-y-2">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{tm('recipient')} <span className="text-gray-400 font-normal">（打名字或 email 搜尋聯絡人，或直接輸入 email 後按 Enter）</span></label>
                  <RecipientChipInput recipients={mailToList} onChange={setMailToList} contacts={contactOptions} placeholder="搜尋聯絡人或輸入 email…" />
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-500 mb-1">CC <span className="text-gray-400 font-normal">（副本）</span></label>
                    <RecipientChipInput recipients={mailCcList} onChange={setMailCcList} contacts={contactOptions} placeholder="搜尋或輸入 email…" />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-500 mb-1">BCC <span className="text-gray-400 font-normal">（密件副本）</span></label>
                    <RecipientChipInput recipients={mailBccList} onChange={setMailBccList} contacts={contactOptions} placeholder="搜尋或輸入 email…" />
                  </div>
                </div>
              </div>

              {/* Template */}
              {templates.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{tm('template')}</label>
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => handleTemplateChange(e.target.value)}
                    className="w-full text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  >
                    <option value="">{tm('selectTemplate')}</option>
                    {templates.map((tpl) => <option key={tpl.id} value={tpl.id}>{tpl.title}</option>)}
                  </select>
                </div>
              )}

              {/* Template attachments (read-only) */}
              {templateAttachments.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1.5">範本附件</p>
                  <div className="flex flex-wrap gap-1.5">
                    {templateAttachments.map((a) => (
                      <span key={a.id} className="flex items-center gap-1 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-2 py-1 rounded-lg">
                        <Paperclip size={11} /> {a.file_name} <span className="text-gray-400">({formatFileSize(a.file_size)})</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* AI generate */}
              <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-2">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">AI 生成信件內文</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={mailAiDesc}
                    onChange={(e) => setMailAiDesc(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAiGenerateMail()}
                    placeholder="描述信件目的（如：感謝上次會面，介紹新產品）"
                    className="flex-1 text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={handleAiGenerateMail}
                    disabled={mailAiGenerating || !mailAiDesc.trim()}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-40"
                  >
                    {mailAiGenerating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    生成
                  </button>
                </div>
              </div>

              {/* Subject */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{tm('subject')}</label>
                <input type="text" value={mailSubject} onChange={(e) => setMailSubject(e.target.value)} placeholder={tm('subjectPlaceholder')}
                  className="w-full text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              {/* Body */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{tm('body')}</label>
                <textarea value={mailBody} onChange={(e) => setMailBody(e.target.value)} rows={7} placeholder={tm('bodyPlaceholder')}
                  className="w-full text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              {/* Temp attachments */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-gray-500">額外附件（最大 5MB）</label>
                  <button
                    onClick={() => tempAttachRef.current?.click()}
                    className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    <Paperclip size={11} /> 新增
                  </button>
                  <input ref={tempAttachRef} type="file" multiple className="hidden" onChange={handleAddTempAttach} />
                </div>
                {tempAttaches.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {tempAttaches.map((a, i) => (
                      <span key={i} className="flex items-center gap-1 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-2 py-1 rounded-lg">
                        <Paperclip size={11} /> {a.name} <span className="text-gray-400">({formatFileSize(a.size)})</span>
                        <button onClick={() => setTempAttaches((prev) => prev.filter((_, idx) => idx !== i))} className="hover:text-red-500 ml-0.5">
                          <X size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {mailError && <p className="text-sm text-red-600 dark:text-red-400">{mailError}</p>}
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 shrink-0">
              <button onClick={() => setMailOpen(false)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900">{tc('cancel')}</button>
              <button onClick={handleSendMail} disabled={mailSending || mailToList.length === 0 || !mailSubject.trim()}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">
                <Mail size={14} /> {mailSending ? tm('sending') : tm('send')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
