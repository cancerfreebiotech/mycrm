'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { sendMail } from '@/lib/graph'
import { ArrowLeft, ImageIcon, Mail, X, Pencil, Loader2, Plus, Upload, Trash2, Copy, Check, Sparkles, Paperclip, ZoomIn, ZoomOut, Maximize2, ChevronDown, Merge, Search, RotateCw } from 'lucide-react'
import Image from 'next/image'
import TipTapEditor from '@/components/TipTapEditor'

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
  address_en: string | null
  fax: string | null
  hospital: string | null
  department: string | null
  website: string | null
  linkedin_url: string | null
  facebook_url: string | null
  notes: string | null
  extra_data: Record<string, string> | null
  country_code: string | null
  met_at: string | null
  met_date: string | null
  referred_by: string | null
  importance: string
  language: string
  card_img_url: string | null
  card_img_back_url: string | null
  created_at: string
  created_by: string | null
  email_status: 'bounced' | 'unsubscribed' | 'invalid' | 'deferred' | 'mailbox_full' | 'sender_blocked' | 'recipient_blocked' | null
  users: { display_name: string | null } | null
  contact_tags: { tags: Tag }[]
}
interface ContactCard { id: string; card_img_url: string; card_img_back_url: string | null; label: string | null; created_at: string }
interface ContactPhoto { id: string; photo_url: string; storage_path: string | null; taken_at: string | null; latitude: number | null; longitude: number | null; location_name: string | null; note: string | null; created_at: string }
interface Log {
  id: string
  content: string | null
  type: string
  meeting_date: string | null
  meeting_time: string | null
  meeting_location: string | null
  created_at: string
  email_subject: string | null
  email_body: string | null
  email_attachments: string[] | null
  campaign_id: string | null
  users: { display_name: string | null } | null
}

// Email tracking event aggregation per campaign (from SendGrid webhook events)
interface CampaignEmailStatus {
  delivered: boolean
  opened: boolean
  openedAt: string | null
  clicked: boolean
  clickedAt: string | null
  bounced: boolean
  spam: boolean
  unsubscribed: boolean
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
  address: '', address_en: '', fax: '', hospital: '', department: '',
  website: '',
  linkedin_url: '', facebook_url: '',
  notes: '',
  country_code: '',
  met_at: '',
  met_date: '',
  referred_by: '',
  importance: 'medium',
  language: 'english',
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
        onBlur={(e) => {
        const val = e.target.value.trim().replace(/,+$/, '')
        if (val.includes('@')) add(val, val, null)
        setTimeout(() => setOpen(false), 150)
      }}
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
  const tt = useTranslations('interactionLogs')
  const OCR_FIELD_LABELS: Record<string, string> = {
    name: t('name'), name_en: t('nameEn'), name_local: t('nameLocal'),
    company: t('company'), company_en: t('companyEn'), company_local: t('companyLocal'),
    job_title: t('jobTitle'),
    email: t('email'), second_email: t('secondEmail'),
    phone: t('phone'), second_phone: t('secondPhone'),
    address: t('address'), address_en: t('addressEn'), fax: t('fax'), hospital: t('hospital'), department: t('department'),
    website: t('website'),
    linkedin_url: t('linkedin'), facebook_url: t('facebook'),
  }
  const supabase = createBrowserSupabaseClient()
  const editFileRef = useRef<HTMLInputElement>(null)
  const cardFilesRef = useRef<HTMLInputElement>(null)
  const photoFilesRef = useRef<HTMLInputElement>(null)
  const tempAttachRef = useRef<HTMLInputElement>(null)

  const [contact, setContact] = useState<Contact | null>(null)
  const [contactCards, setContactCards] = useState<ContactCard[]>([])
  const [rotatingCard, setRotatingCard] = useState<string | null>(null)
  const [contactPhotos, setContactPhotos] = useState<ContactPhoto[]>([])
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [allCountries, setAllCountries] = useState<Country[]>([])
  const [logs, setLogs] = useState<Log[]>([])
  const [hasMoreLogs, setHasMoreLogs] = useState(false)
  // Map from campaign_id → aggregated email tracking status (from SendGrid events)
  const [emailStatus, setEmailStatus] = useState<Record<string, CampaignEmailStatus>>({})
  const [loadingMoreLogs, setLoadingMoreLogs] = useState(false)
  const logsOffsetRef = useRef(0)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null)
  const [aiModelId, setAiModelId] = useState<string | null>(null)
  const [msProviderToken, setMsProviderToken] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Merge modal
  const [mergeSearchOpen, setMergeSearchOpen] = useState(false)
  const [mergeQuery, setMergeQuery] = useState('')
  const [mergeResults, setMergeResults] = useState<Array<{ id: string; name: string | null; name_en: string | null; company: string | null; email: string | null }>>([])
  const [mergeSearching, setMergeSearching] = useState(false)
  const [mergeTarget, setMergeTarget] = useState<{ id: string; name: string | null; name_en: string | null; company: string | null; company_en: string | null; email: string | null } | null>(null)
  const [mergeSaving, setMergeSaving] = useState(false)
  const [expandedLogIds, setExpandedLogIds] = useState<Set<string>>(new Set())
  const [editingLogId, setEditingLogId] = useState<string | null>(null)
  const [editingLogContent, setEditingLogContent] = useState('')
  const [editingLogMeetingDate, setEditingLogMeetingDate] = useState('')
  const [editingLogMeetingTime, setEditingLogMeetingTime] = useState('')
  const [editingLogMeetingLocation, setEditingLogMeetingLocation] = useState('')
  const [savingLogId, setSavingLogId] = useState<string | null>(null)
  const [deletingLogId, setDeletingLogId] = useState<string | null>(null)
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
  const [logTime, setLogTime] = useState('')
  const [logLocation, setLogLocation] = useState('')
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
  const [cardOcrConflicts, setCardOcrConflicts] = useState<Record<string, { newVal: string; oldVal: string }>>({})
  const [cardSaving, setCardSaving] = useState(false)

  // Photos
  const [photoSaving, setPhotoSaving] = useState(false)
  const [photoExifPreview, setPhotoExifPreview] = useState<{ date: string | null; location: string | null } | null>(null)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editingNoteText, setEditingNoteText] = useState('')

  // Tags
  const [tagInput, setTagInput] = useState('')
  const [tagDropOpen, setTagDropOpen] = useState(false)

  // Email copy
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null)

  // Newsletter suppression status per email
  const [emailSuppressions, setEmailSuppressions] = useState<Record<string, { blacklisted: boolean; unsubscribed: boolean }>>({})


  // Mail modal
  const [mailOpen, setMailOpen] = useState(false)
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [contactOptions, setContactOptions] = useState<ContactOption[]>([])
  const [mailToList, setMailToList] = useState<Recipient[]>([])
  const [mailCcList, setMailCcList] = useState<Recipient[]>([])
  const [mailBccList, setMailBccList] = useState<Recipient[]>([])
  const [mailSubject, setMailSubject] = useState('')
  const [mailBody, setMailBody] = useState('')
  const [mailEditorKey, setMailEditorKey] = useState(0)
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [templateAttachments, setTemplateAttachments] = useState<TemplateAttachment[]>([])
  const [tempAttaches, setTempAttaches] = useState<Array<{ name: string; base64: string; contentType: string; size: number; photoId?: string }>>([])
  const [photoAttaching, setPhotoAttaching] = useState<string | null>(null)
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
    // Use /api/me (service role, email lookup) because auth.users.id !== public.users.id
    // in this project — client-side .eq('id', ...) silently returns null
    const meRes = await fetch('/api/me').catch(() => null)
    if (meRes?.ok) {
      const me = await meRes.json() as { id: string; role: string; ai_model_id: string | null }
      setCurrentUserId(me.id)
      setCurrentUserRole(me.role || null)
      setAiModelId(me.ai_model_id ?? null)
      // provider_token is a separate concern; fetch via existing client path
      const { data: { user } } = await supabase.auth.getUser()
      if (user?.email) {
        const { data: tokenRow } = await supabase.from('users').select('provider_token').ilike('email', user.email).maybeSingle()
        if (tokenRow) setMsProviderToken(tokenRow.provider_token ?? null)
      }
    } else {
      console.warn('[contact-detail] /api/me failed', meRes?.status)
    }
    const [{ data: c }, { data: l }, { data: tags }, { data: cards }, { data: countries }, { data: photos }] = await Promise.all([
      supabase.from('contacts').select('*, users!created_by(display_name), contact_tags(tags(id, name))').eq('id', id).is('deleted_at', null).single(),
      supabase.from('interaction_logs').select('id, content, type, meeting_date, meeting_time, meeting_location, created_at, email_subject, email_body, email_attachments, campaign_id, users(display_name)').eq('contact_id', id).order('created_at', { ascending: false }).range(0, LOG_PAGE - 1),
      supabase.from('tags').select('id, name').order('name'),
      supabase.from('contact_cards').select('id, card_img_url, card_img_back_url, label, created_at').eq('contact_id', id).order('created_at', { ascending: true }),
      supabase.from('countries').select('code, name_zh, emoji').eq('is_active', true).order('name_zh'),
      supabase.from('contact_photos').select('id, photo_url, storage_path, taken_at, latitude, longitude, location_name, note, created_at').eq('contact_id', id).order('created_at', { ascending: false }),
    ])
    setContact(c as unknown as Contact)

    // Check newsletter suppression status for email fields
    const contact_ = c as unknown as Contact
    const emails = [contact_?.email, contact_?.second_email].filter(Boolean) as string[]
    if (emails.length > 0) {
      const [{ data: bl }, { data: unsub }] = await Promise.all([
        supabase.from('newsletter_blacklist').select('email').in('email', emails),
        supabase.from('newsletter_unsubscribes').select('email').in('email', emails),
      ])
      const sups: Record<string, { blacklisted: boolean; unsubscribed: boolean }> = {}
      for (const e of emails) {
        sups[e] = {
          blacklisted: (bl ?? []).some((r: { email: string }) => r.email === e),
          unsubscribed: (unsub ?? []).some((r: { email: string }) => r.email === e),
        }
      }
      setEmailSuppressions(sups)
    }

    const initialLogs = (l as unknown as Log[]) ?? []
    setLogs(initialLogs)
    logsOffsetRef.current = initialLogs.length
    setHasMoreLogs(initialLogs.length === LOG_PAGE)
    setAllTags(tags ?? [])
    setContactCards(cards ?? [])
    setContactPhotos((photos as unknown as ContactPhoto[]) ?? [])
    setAllCountries(countries ?? [])

    // Fetch SendGrid email tracking events for this contact (grouped by campaign)
    // Used to render open/click/bounce badges next to email interaction_logs.
    const { data: events } = await supabase
      .from('email_events')
      .select('campaign_id, event, occurred_at')
      .eq('contact_id', id)
      .not('campaign_id', 'is', null)
      .order('occurred_at', { ascending: true })
    const statusMap: Record<string, CampaignEmailStatus> = {}
    for (const e of (events ?? []) as Array<{ campaign_id: string; event: string; occurred_at: string }>) {
      const cur = statusMap[e.campaign_id] ?? {
        delivered: false, opened: false, openedAt: null, clicked: false, clickedAt: null,
        bounced: false, spam: false, unsubscribed: false,
      }
      switch (e.event) {
        case 'delivered': cur.delivered = true; break
        case 'open': cur.opened = true; cur.openedAt = cur.openedAt ?? e.occurred_at; break
        case 'click': cur.clicked = true; cur.clickedAt = cur.clickedAt ?? e.occurred_at; break
        case 'bounce': case 'dropped': cur.bounced = true; break
        case 'spamreport': cur.spam = true; break
        case 'unsubscribe': cur.unsubscribed = true; break
      }
      statusMap[e.campaign_id] = cur
    }
    setEmailStatus(statusMap)
  }

  const loadMoreLogs = useCallback(async () => {
    if (loadingMoreLogs || !hasMoreLogs) return
    setLoadingMoreLogs(true)
    const from = logsOffsetRef.current
    const { data } = await supabase
      .from('interaction_logs')
      .select('id, content, type, meeting_date, meeting_time, meeting_location, created_at, email_subject, email_body, email_attachments, campaign_id, users(display_name)')
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
      address_en: contact.address_en ?? '',
      fax: contact.fax ?? '',
      hospital: contact.hospital ?? '',
      department: contact.department ?? '',
      website: contact.website ?? '',
      linkedin_url: contact.linkedin_url ?? '',
      facebook_url: contact.facebook_url ?? '',
      notes: contact.notes ?? '',
      country_code: contact.country_code ?? '',
      met_at: contact.met_at ?? '',
      met_date: contact.met_date ?? '',
      referred_by: contact.referred_by ?? '',
      importance: contact.importance ?? 'medium',
      language: contact.language ?? 'english',
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
        address_en: data.address_en || prev.address_en,
        fax: data.fax || prev.fax,
        hospital: data.hospital || prev.hospital,
        department: data.department || prev.department,
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
      ) as Record<string, string | null>

      // Detect whether this edit added info that could unlock Hunter lookup
      // (company was empty → now filled, OR name_en was empty → now filled),
      // while email is still empty. If so, reset hunter_searched_at so the
      // cron or next enrich call will retry with the new data.
      const companyAdded = !contact?.company && !!payload.company
      const nameEnAdded  = !contact?.name_en && !!payload.name_en
      const emailStillEmpty = !payload.email && !contact?.email
      const shouldRetry = emailStillEmpty && (companyAdded || nameEnAdded)

      if (shouldRetry) {
        await supabase.from('contacts').update({ ...payload, hunter_searched_at: null }).eq('id', id)
      } else {
        await supabase.from('contacts').update(payload).eq('id', id)
      }
      setEditOpen(false)

      // Fire Hunter enrich in background if conditions met — toast on result
      if (shouldRetry) {
        fetch('/api/hunter/enrich', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contactId: id }),
        }).then(async (res) => {
          if (!res.ok) return
          const data = await res.json() as { status?: string; email?: string | null }
          if (data.status === 'found' && data.email) {
            alert(t('hunterFoundEmail', { email: data.email }))
            load()
          }
        }).catch(() => { /* non-fatal */ })
      }

      load()
    } finally { setEditSaving(false) }
  }

  async function patchImportance(value: string) {
    await supabase.from('contacts').update({ importance: value }).eq('id', id)
    load()
  }

  async function patchEmailStatus(value: 'bounced' | 'invalid' | null) {
    await supabase.from('contacts').update({ email_status: value }).eq('id', id)
    load()
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
      const conflicts: Record<string, { newVal: string; oldVal: string }> = {}
      for (const field of Object.keys(OCR_FIELD_LABELS)) {
        const ocrVal = data[field] as string | undefined
        const contactVal = contact[field as keyof Contact] as string | null
        if (ocrVal && !contactVal) {
          diff[field] = ocrVal
        } else if (ocrVal && contactVal && ocrVal !== contactVal) {
          conflicts[field] = { newVal: ocrVal, oldVal: contactVal }
        }
      }
      setCardOcrDiff(diff)
      setCardOcrConflicts(conflicts)
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
          await supabase.from('contact_cards').insert({ contact_id: id, card_img_url: urlData.publicUrl, storage_path: filename, label: null })
        })
      )
      if (cardOcrDiff && Object.keys(cardOcrDiff).length > 0) {
        await supabase.from('contacts').update(cardOcrDiff).eq('id', id)
      }
      if (cardOcrConflicts && Object.keys(cardOcrConflicts).length > 0) {
        const noteLines = Object.entries(cardOcrConflicts)
          .map(([k, v]) => `${OCR_FIELD_LABELS[k] ?? k}：${v.newVal}`)
          .join('\n')
        await supabase.from('interaction_logs').insert({
          contact_id: id,
          type: 'system',
          content: t('logCardUpdated', { content: noteLines }),
        })
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
    setCardOcrConflicts({})
  }

  // ── Photos ─────────────────────────────────────────────────────────────────

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    if (e.target) e.target.value = ''
    setPhotoSaving(true)
    try {
      for (const file of files) {
        let takenAt: string | null = null
        let latitude: number | null = null
        let longitude: number | null = null
        let locationName: string | null = null

        try {
          const exifr = (await import('exifr')).default
          const exif = await exifr.parse(file, {
            pick: ['DateTimeOriginal', 'CreateDate', 'latitude', 'longitude'],
          })
          if (exif) {
            const dt: Date | null = exif.DateTimeOriginal ?? exif.CreateDate ?? null
            takenAt = dt ? dt.toISOString() : null
            latitude = exif.latitude ?? null
            longitude = exif.longitude ?? null
            if (latitude !== null && longitude !== null) {
              const geoRes = await fetch(`/api/geocode?lat=${latitude}&lon=${longitude}`)
              if (geoRes.ok) {
                const geoData = await geoRes.json() as { location: string | null }
                locationName = geoData.location
              }
            }
          }
          setPhotoExifPreview({
            date: takenAt ? new Date(takenAt).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' }) : null,
            location: locationName,
          })
        } catch { /* EXIF not available */ }

        const base64 = await compressImage(file, 2048, 0.85)
        const uint8 = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
        const filename = `photos/${id}_${Date.now()}.jpg`
        const { error: uploadErr } = await supabase.storage.from('cards').upload(filename, uint8, { contentType: 'image/jpeg' })
        if (uploadErr) throw uploadErr
        const { data: urlData } = supabase.storage.from('cards').getPublicUrl(filename)

        await supabase.from('contact_photos').insert({
          contact_id: id,
          photo_url: urlData.publicUrl,
          storage_path: filename,
          taken_at: takenAt,
          latitude,
          longitude,
          location_name: locationName,
        })
      }
      load()
    } catch (err) {
      console.error('Photo upload error:', err)
    } finally {
      setPhotoSaving(false)
      setPhotoExifPreview(null)
    }
  }

  async function deletePhoto(photoId: string) {
    if (!confirm(t('confirmDeletePhoto'))) return
    // Find the photo to get its storage_path before deleting the row
    const target = contactPhotos.find((p) => p.id === photoId)
    const { error: delErr } = await supabase.from('contact_photos').delete().eq('id', photoId)
    if (delErr) {
      alert(delErr.message || t('deleteFailed'))
      return
    }
    // Best-effort storage cleanup (non-fatal if it fails)
    if (target?.storage_path) {
      await supabase.storage.from('cards').remove([target.storage_path])
    }
    load()
  }

  async function savePhotoNote(photoId: string, note: string) {
    const trimmed = note.trim()
    await supabase.from('contact_photos').update({ note: trimmed || null }).eq('id', photoId)
    if (trimmed) {
      await supabase.from('interaction_logs').insert({
        contact_id: id,
        type: 'system',
        content: t('logPhotoNote', { content: trimmed }),
      })
    }
    setEditingNoteId(null)
    load()
  }

  async function deleteCard(cardId: string) {
    if (!confirm(t('confirmDeleteCard'))) return
    await supabase.from('contact_cards').delete().eq('id', cardId)
    load()
  }

  async function rotateCard(cardId: string, deg: 90 | 180 | 270, side: 'front' | 'back' = 'front') {
    setRotatingCard(`${cardId}-${side}`)
    try {
      const res = await fetch(`/api/cards/${cardId}/rotate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deg, side }),
      })
      if (!res.ok) throw new Error(t('rotateFailed'))
      const { url } = await res.json()
      setContactCards((prev) => prev.map((c) => {
        if (c.id !== cardId) return c
        return side === 'front' ? { ...c, card_img_url: url } : { ...c, card_img_back_url: url }
      }))
    } catch (e) {
      alert(e instanceof Error ? e.message : t('rotateFailed'))
    } finally {
      setRotatingCard(null)
    }
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
      .insert({ contact_id: id, content: logContent.trim(), type: logType, meeting_date: logType === 'meeting' && logDate ? logDate : null, meeting_time: logType === 'meeting' && logTime ? logTime : null, meeting_location: logType === 'meeting' && logLocation.trim() ? logLocation.trim() : null, created_by: currentUserId })
      .select('id, content, type, meeting_date, meeting_time, meeting_location, created_at, email_subject, email_body, email_attachments, campaign_id, users(display_name)').single()
    if (data) {
      setLogs((prev) => [data as unknown as Log, ...prev])
      logsOffsetRef.current += 1
    }
    setLogContent(''); setLogDate(''); setLogTime(''); setLogLocation(''); setAddingLog(false)
  }

  async function deleteLog(logId: string) {
    if (!confirm(t('confirmDeleteLog'))) return
    setDeletingLogId(logId)
    await supabase.from('interaction_logs').delete().eq('id', logId)
    setLogs((prev) => prev.filter((l) => l.id !== logId))
    logsOffsetRef.current = Math.max(0, logsOffsetRef.current - 1)
    setDeletingLogId(null)
  }

  async function saveLogEdit(logId: string) {
    setSavingLogId(logId)
    await supabase.from('interaction_logs').update({
      content: editingLogContent,
      meeting_date: editingLogMeetingDate || null,
      meeting_time: editingLogMeetingTime || null,
      meeting_location: editingLogMeetingLocation.trim() || null,
    }).eq('id', logId)
    setLogs((prev) => prev.map((l) => l.id === logId
      ? { ...l, content: editingLogContent, meeting_date: editingLogMeetingDate || null, meeting_time: editingLogMeetingTime || null, meeting_location: editingLogMeetingLocation.trim() || null }
      : l
    ))
    setEditingLogId(null)
    setSavingLogId(null)
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
      supabase.from('contacts').select('id, name, name_en, email').is('deleted_at', null).not('email', 'is', null).order('name'),
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
      setMailEditorKey((k) => k + 1)
    }
  }

  async function handleAiGenerateMail() {
    if (!mailAiDesc.trim()) return
    setMailAiGenerating(true)
    setMailError(null)
    try {
      // i18n: '新增名片' literal is a DB filter matching system-generated Chinese log content
      // saved by bot/route.ts and batch-upload/page.tsx. Cannot be translated here without
      // coordinating with the log creators. Tracked as a refactor to use a log `type` field.
      const lastLog = logs.find(l => l.type !== 'scan' && !l.content?.includes('新增名片'))?.content ?? ''
      const description = lastLog ? `${mailAiDesc}\n\n${t('aiRecentInteractionPrefix')}${lastLog}` : mailAiDesc
      // Pass current body (template or manually typed) as reference content
      const existingBody = mailBody.trim() || undefined
      const res = await fetch('/api/ai-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, templateContent: existingBody, model: aiModelId, generateSubject: true, returnHtml: true }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setMailBody(data.text ?? data.html ?? '')
      if (data.subject) setMailSubject(data.subject)
      setMailEditorKey((k) => k + 1)
    } catch (e) {
      setMailError(e instanceof Error ? e.message : t('aiGenerateFailed'))
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
        setMailError(t('fileTooLarge5mb', { name: file.name }))
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

  async function toggleContactPhotoAttach(photo: ContactPhoto) {
    // If already attached, just remove it
    if (tempAttaches.some((a) => a.photoId === photo.id)) {
      setTempAttaches((prev) => prev.filter((a) => a.photoId !== photo.id))
      return
    }
    setPhotoAttaching(photo.id)
    setMailError(null)
    try {
      const res = await fetch(photo.photo_url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const MAX = 5 * 1024 * 1024
      if (blob.size > MAX) {
        setMailError(t('fileTooLarge5mb', { name: photo.storage_path?.split('/').pop() || 'photo.jpg' }))
        return
      }
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.readAsDataURL(blob)
      })
      const filename = photo.storage_path?.split('/').pop() || `photo-${photo.id.slice(0, 8)}.jpg`
      const contentType = blob.type || 'image/jpeg'
      setTempAttaches((prev) => [...prev, { name: filename, base64, contentType, size: blob.size, photoId: photo.id }])
    } catch (e) {
      setMailError(e instanceof Error ? e.message : t('attachPhotoFailed'))
    } finally {
      setPhotoAttaching(null)
    }
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
        throw new Error(err?.error ?? t('noMicrosoftAuth'))
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
      const attachmentNames = attachments.map(a => a.name)
      const logContent = t('logSentEmail', { subject: mailSubject })
      if (uniqueContactIds.length > 0) {
        const inserts = uniqueContactIds.map(cid => ({
          contact_id: cid, content: logContent, type: 'email', created_by: currentUserId,
          email_subject: mailSubject,
          email_body: mailBody || null,
          email_attachments: attachmentNames.length > 0 ? attachmentNames : null,
          send_method: 'outlook',
        }))
        const { data: logRows } = await supabase.from('interaction_logs')
          .insert(inserts)
          .select('id, content, type, meeting_date, meeting_time, meeting_location, created_at, email_subject, email_body, email_attachments, campaign_id, users(display_name)')
        // Update UI only for the current contact's log
        const currentLog = (logRows ?? []).find((r: Record<string, unknown>) => r.contact_id === id || uniqueContactIds[0] === id)
        if (currentLog) setLogs((prev) => [currentLog as unknown as Log, ...prev])
        else if (logRows && logRows.length > 0) setLogs((prev) => [logRows[0] as unknown as Log, ...prev])
      }

      setMailOpen(false)
    } catch (e) {
      setMailError(e instanceof Error ? e.message : t('sendFailed'))
    } finally { setMailSending(false) }
  }

  // ── Merge ─────────────────────────────────────────────────────────────────

  async function searchMergeContacts(q: string) {
    setMergeQuery(q)
    if (q.trim().length < 1) { setMergeResults([]); return }
    setMergeSearching(true)
    const { data } = await supabase
      .from('contacts')
      .select('id, name, name_en, company, email')
      .is('deleted_at', null)
      .neq('id', id)
      .or(`name.ilike.%${q}%,name_en.ilike.%${q}%,company.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(8)
    setMergeResults(data ?? [])
    setMergeSearching(false)
  }

  async function handleMerge() {
    if (!mergeTarget) return
    if (!confirm(t('confirmMergeContact', {
      source: mergeTarget.name || mergeTarget.name_en || '',
      target: contact?.name || contact?.name_en || '',
    }))) return
    setMergeSaving(true)
    try {
      const res = await fetch(`/api/contacts/${id}/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId: mergeTarget.id }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setMergeSearchOpen(false)
      setMergeTarget(null)
      setMergeQuery('')
      setMergeResults([])
      load()
    } catch (e) {
      alert(e instanceof Error ? e.message : t('mergeFailed'))
    } finally {
      setMergeSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm(t('confirmMoveToTrash', { name: contact?.name || contact?.name_en || t('unnamedContact') }))) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/contacts/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error ?? t('deleteFailed'))
      }
      router.push('/contacts')
    } catch (e) {
      alert(e instanceof Error ? e.message : t('deleteFailed'))
      setDeleting(false)
    }
  }

  const canDelete = currentUserRole === 'super_admin' || (contact?.created_by != null && contact.created_by === currentUserId)

  if (!contact) return <div className="text-gray-400 text-sm">{tc('loading')}</div>

  const inputClass = 'w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500'
  const labelClass = 'block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1'

  function ensureHttp(url: string) {
    return /^https?:\/\//i.test(url) ? url : `https://${url}`
  }

  function InfoRow({ label, value, href, copyable, suffix }: { label: string; value: string | null | undefined; href?: string; copyable?: boolean; suffix?: React.ReactNode }) {
    if (!value) return null
    return (
      <div className="flex gap-3 text-sm">
        <span className="w-24 text-gray-400 dark:text-gray-500 shrink-0">{label}</span>
        <span className="flex items-center gap-1.5 min-w-0 flex-wrap">
          {href ? (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline truncate">{value}</a>
          ) : (
            <span className="text-gray-900 dark:text-gray-100 truncate">{value}</span>
          )}
          {copyable && (
            <button
              onClick={() => copyEmail(value)}
              className="text-gray-400 hover:text-blue-500 transition-colors flex-shrink-0"
              title={tc('copy')}
            >
              {copiedEmail === value ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
            </button>
          )}
          {suffix}
        </span>
      </div>
    )
  }

  function EmailSuppressionBadges({ email }: { email: string | null | undefined }) {
    if (!email) return null
    const sup = emailSuppressions[email]
    if (!sup) return null
    return (
      <>
        {sup.blacklisted && (
          <span className="inline-flex items-center text-xs font-medium px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800" title={t('emailBounceBadgeTitle')}>
            {t('emailBlacklistBadge')}
          </span>
        )}
        {sup.unsubscribed && (
          <span className="inline-flex items-center text-xs font-medium px-1.5 py-0.5 rounded bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-800" title={t('emailUnsubBadgeTitle')}>
            {t('emailStatusUnsubscribed')}
          </span>
        )}
      </>
    )
  }

  // All card images: from contact_cards table + legacy fields
  const legacyCards: ContactCard[] = []
  if (contact.card_img_url && contactCards.length === 0) {
    legacyCards.push({ id: 'legacy-front', card_img_url: contact.card_img_url, card_img_back_url: contact.card_img_back_url ?? null, label: t('legacyCardFront'), created_at: contact.created_at })
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
            <InfoRow label={t('language')} value={contact.language === 'chinese' ? t('languageChinese') : contact.language === 'japanese' ? t('languageJapanese') : t('languageEnglish')} />
            <div className="flex gap-3 text-sm items-center">
              <span className="w-24 text-gray-400 dark:text-gray-500 shrink-0">{t('importance')}</span>
              <div className="flex gap-1">
                {(['high', 'medium', 'low'] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => patchImportance(v)}
                    className={`w-7 h-6 text-xs rounded border transition-colors ${
                      contact.importance === v
                        ? 'bg-green-500 border-green-500 text-white'
                        : 'border-gray-200 dark:border-gray-700 text-gray-400 hover:border-green-400 hover:text-green-500'
                    }`}
                  >
                    {v === 'high' ? 'H' : v === 'low' ? 'L' : 'M'}
                  </button>
                ))}
              </div>
            </div>
            <InfoRow label="Email" value={contact.email} href={contact.email ? `mailto:${contact.email}` : undefined} copyable suffix={<EmailSuppressionBadges email={contact.email} />} />
            <InfoRow label={t('secondEmail')} value={contact.second_email} href={contact.second_email ? `mailto:${contact.second_email}` : undefined} copyable suffix={<EmailSuppressionBadges email={contact.second_email} />} />
            <InfoRow label={t('phone')} value={contact.phone} href={contact.phone ? `tel:${contact.phone}` : undefined} />
            <InfoRow label={t('secondPhone')} value={contact.second_phone} href={contact.second_phone ? `tel:${contact.second_phone}` : undefined} />
            <InfoRow label={t('address')} value={contact.address} />
            <InfoRow label={t('addressEn')} value={contact.address_en} />
            <InfoRow label={t('fax')} value={contact.fax} />
            <InfoRow label={t('hospital')} value={contact.hospital} />
            <InfoRow label={t('department')} value={contact.department} />
            <InfoRow label={t('website')} value={contact.website} href={contact.website ? ensureHttp(contact.website) : undefined} />
            {contact.country_code && (() => {
              const c = allCountries.find((c) => c.code === contact.country_code)
              return <InfoRow label={t('country')} value={c ? `${c.emoji} ${c.name_zh}` : contact.country_code} />
            })()}
            <InfoRow label="LinkedIn" value={contact.linkedin_url} href={contact.linkedin_url ? ensureHttp(contact.linkedin_url) : undefined} />
            <InfoRow label="Facebook" value={contact.facebook_url} href={contact.facebook_url ? ensureHttp(contact.facebook_url) : undefined} />
            <InfoRow label={t('creator')} value={contact.users?.display_name} />
            {contact.notes && (
              <div className="flex gap-3 text-sm mt-2">
                <span className="w-24 text-gray-400 dark:text-gray-500 shrink-0">{t('notes')}</span>
                <span className="text-gray-700 dark:text-gray-300 whitespace-pre-line">{contact.notes}</span>
              </div>
            )}
            {contact.extra_data && Object.keys(contact.extra_data).length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">{t('extraData')}</p>
                {Object.entries(contact.extra_data).map(([k, v]) => v ? (
                  <div key={k} className="flex gap-3 text-sm mb-1">
                    <span className="w-24 text-gray-400 dark:text-gray-500 shrink-0 capitalize">{k.replace(/_/g, ' ')}</span>
                    <span className="text-gray-700 dark:text-gray-300 break-words">{typeof v === 'object' ? JSON.stringify(v) : v}</span>
                  </div>
                ) : null)}
              </div>
            )}
            {(contact.met_at || contact.met_date || contact.referred_by) && (
              <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">{t('sectionMet')}</p>
                <InfoRow label={t('metAt')} value={contact.met_at} />
                <InfoRow label={t('metDate')} value={contact.met_date ? new Date(contact.met_date).toLocaleDateString('zh-TW') : null} />
                <InfoRow label={t('referredBy')} value={contact.referred_by} />
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
                  <input autoFocus value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder={t('searchTagPlaceholder')} className="w-full text-xs px-2 py-1 border border-gray-200 dark:border-gray-700 rounded mb-1 bg-white dark:bg-gray-800" />
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
          <button
            onClick={() => { setMergeSearchOpen(true); setMergeQuery(''); setMergeResults([]); setMergeTarget(null) }}
            className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <Merge size={14} /> 合併聯絡人
          </button>
          {canDelete && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 disabled:opacity-50"
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
                <div className="flex gap-1">
                  {/* Front */}
                  <div className="relative">
                    <div className="w-36 h-24 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 cursor-pointer relative" onClick={() => openLightbox(card.card_img_url)}>
                      <Image src={card.card_img_url} alt={card.label ?? t('cardFront')} width={144} height={96} className="object-cover w-full h-full" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                        <ZoomIn size={20} className="text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); rotateCard(card.id, 90, 'front') }}
                      disabled={rotatingCard === `${card.id}-front`}
                      title={t('rotate90cw')}
                      className="absolute bottom-1 left-1 bg-black/60 text-white rounded p-0.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80 disabled:opacity-50"
                    >
                      {rotatingCard === `${card.id}-front` ? <Loader2 size={12} className="animate-spin" /> : <RotateCw size={12} />}
                    </button>
                  </div>
                  {/* Back (if exists) */}
                  {card.card_img_back_url && (
                    <div className="relative">
                      <div className="w-36 h-24 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 cursor-pointer relative" onClick={() => openLightbox(card.card_img_back_url!)}>
                        <Image src={card.card_img_back_url} alt={card.label ? `${card.label} ${t('backSuffix')}` : t('cardBack')} width={144} height={96} className="object-cover w-full h-full" />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                          <ZoomIn size={20} className="text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
                        </div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); rotateCard(card.id, 90, 'back') }}
                        disabled={rotatingCard === `${card.id}-back`}
                        title={t('rotate90cw')}
                        className="absolute bottom-1 left-1 bg-black/60 text-white rounded p-0.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80 disabled:opacity-50"
                      >
                        {rotatingCard === `${card.id}-back` ? <Loader2 size={12} className="animate-spin" /> : <RotateCw size={12} />}
                      </button>
                    </div>
                  )}
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
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{t('pendingUploadCount', { count: stagedFiles.length })}</p>
            <div className="flex flex-wrap gap-3 mb-3">
              {stagedPreviews.map((src, i) => (
                <div key={i} className="relative group">
                  <div className="w-36 h-24 rounded-lg overflow-hidden border-2 border-dashed border-blue-400">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={t('stagedPreviewAlt', { index: i + 1 })} className="object-cover w-full h-full" />
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
                    <p className="text-xs font-medium text-blue-700 dark:text-blue-400 mb-2">{t('ocrFillHint')}</p>
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
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('ocrNoFill')}</p>
                )}
                {Object.keys(cardOcrConflicts).length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs font-medium text-amber-600 dark:text-amber-400 mb-1">{t('ocrDiffWarn')}</p>
                    <div className="space-y-1">
                      {Object.entries(cardOcrConflicts).map(([field, v]) => (
                        <div key={field} className="flex gap-2 text-xs">
                          <span className="text-gray-500 dark:text-gray-400 w-28 shrink-0">{OCR_FIELD_LABELS[field] ?? field}</span>
                          <span className="text-amber-700 dark:text-amber-300">{v.newVal}</span>
                          <span className="text-gray-400">{t('ocrExistingValue', { value: v.oldVal })}</span>
                        </div>
                      ))}
                    </div>
                  </div>
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

      {/* Photos */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-4">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">{t('groupPhoto')}</h2>

        {/* Photos gallery */}
        {contactPhotos.length > 0 && (
          <div className="flex flex-wrap gap-3 mb-4">
            {contactPhotos.map((photo) => (
              <div key={photo.id} className="relative group">
                <div
                  className="w-36 h-24 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 cursor-pointer relative"
                  onClick={() => openLightbox(photo.photo_url)}
                >
                  <Image src={photo.photo_url} alt={t('groupPhoto')} width={144} height={96} className="object-cover w-full h-full" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                    <ZoomIn size={20} className="text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
                  </div>
                </div>
                <div className="mt-1 max-w-36">
                  {photo.taken_at && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      📅 {new Date(photo.taken_at).toLocaleDateString('zh-TW')}
                    </p>
                  )}
                  {photo.location_name && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate" title={photo.location_name}>
                      📍 {photo.location_name}
                    </p>
                  )}
                  {editingNoteId === photo.id ? (
                    <div className="mt-1 flex flex-col gap-1">
                      <input
                        autoFocus
                        type="text"
                        value={editingNoteText}
                        onChange={(e) => setEditingNoteText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') savePhotoNote(photo.id, editingNoteText)
                          if (e.key === 'Escape') setEditingNoteId(null)
                        }}
                        className="text-xs px-1.5 py-0.5 border border-blue-400 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-full"
                        placeholder={t('photoNotePlaceholder')}
                      />
                      <div className="flex gap-1">
                        <button onClick={() => savePhotoNote(photo.id, editingNoteText)} className="text-xs text-blue-600 hover:underline">{tc('save')}</button>
                        <button onClick={() => setEditingNoteId(null)} className="text-xs text-gray-400 hover:underline">{tc('cancel')}</button>
                      </div>
                    </div>
                  ) : (
                    <p
                      className="text-xs text-gray-500 dark:text-gray-400 mt-1 cursor-pointer hover:text-blue-500 truncate"
                      title={photo.note ?? t('clickToAddNote')}
                      onClick={() => { setEditingNoteId(photo.id); setEditingNoteText(photo.note ?? '') }}
                    >
                      {photo.note ? `📝 ${photo.note}` : <span className="opacity-40">{t('addNote')}</span>}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => deletePhoto(photo.id)}
                  className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 size={10} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* No photos placeholder */}
        {contactPhotos.length === 0 && (
          <div className="flex items-center justify-center w-36 h-24 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 mb-4">
            <ImageIcon size={24} className="text-gray-300 dark:text-gray-600" />
          </div>
        )}

        {/* Upload button */}
        <div>
          <button
            onClick={() => photoFilesRef.current?.click()}
            disabled={photoSaving}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
          >
            {photoSaving ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {photoSaving ? t('uploading') : t('addGroupPhoto')}
          </button>
          {photoSaving && photoExifPreview && (photoExifPreview.date || photoExifPreview.location) && (
            <div className="mt-1.5 text-xs text-gray-500 dark:text-gray-400 space-y-0.5">
              {photoExifPreview.date && <p>{t('photoCaptureDate', { date: photoExifPreview.date })}</p>}
              {photoExifPreview.location && <p>{t('photoLocation', { location: photoExifPreview.location })}</p>}
            </div>
          )}
          <input ref={photoFilesRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload} />
        </div>
      </div>

      {/* Interaction Logs */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">{t('interactionLogs')}</h2>

        {/* Email status banner — interactive */}
        {contact.email_status ? (
          <div className={`flex items-center justify-between mb-4 px-3 py-2.5 rounded-lg border text-sm ${
            contact.email_status === 'bounced'
              ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
              : contact.email_status === 'unsubscribed'
              ? 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800 text-orange-700 dark:text-orange-400'
              : contact.email_status === 'sender_blocked' || contact.email_status === 'recipient_blocked'
              ? 'bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-400'
              : 'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800 text-yellow-700 dark:text-yellow-400'
          }`}>
            <div className="flex items-start gap-2">
              <span className="font-semibold shrink-0">
                {contact.email_status === 'bounced' && t('emailStatusBounced')}
                {contact.email_status === 'unsubscribed' && t('emailStatusUnsubscribed')}
                {contact.email_status === 'invalid' && t('emailStatusInvalid')}
                {contact.email_status === 'deferred' && t('emailStatusDeferred')}
                {contact.email_status === 'mailbox_full' && t('emailStatusMailboxFull')}
                {contact.email_status === 'sender_blocked' && t('emailStatusSenderBlocked')}
                {contact.email_status === 'recipient_blocked' && t('emailStatusRecipientBlocked')}
              </span>
              <span className="text-xs opacity-75">
                {contact.email_status === 'bounced' && t('emailStatusBouncedDesc')}
                {contact.email_status === 'unsubscribed' && t('emailStatusUnsubscribedDesc')}
                {contact.email_status === 'invalid' && t('emailStatusInvalidDesc')}
                {contact.email_status === 'deferred' && t('emailStatusDeferredDesc')}
                {contact.email_status === 'mailbox_full' && t('emailStatusMailboxFullDesc')}
                {contact.email_status === 'sender_blocked' && t('emailStatusSenderBlockedDesc')}
                {contact.email_status === 'recipient_blocked' && t('emailStatusRecipientBlockedDesc')}
              </span>
            </div>
            <button
              onClick={() => patchEmailStatus(null)}
              className="text-xs px-2 py-1 rounded border border-current opacity-60 hover:opacity-100 shrink-0"
            >
              {t('clearStatusBadge')}
            </button>
          </div>
        ) : contact.email && (
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={() => patchEmailStatus('bounced')}
              className="text-xs px-2 py-1 rounded border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
            >
              {t('markAsBounced')}
            </button>
            <button
              onClick={() => patchEmailStatus('invalid')}
              className="text-xs px-2 py-1 rounded border border-yellow-300 dark:border-yellow-700 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-50 dark:hover:bg-yellow-950/30"
            >
              {t('markAsInvalid')}
            </button>
          </div>
        )}

        {/* Add Log */}
        <div className="space-y-2 mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <div className="flex gap-2">
            <select value={logType} onChange={(e) => setLogType(e.target.value as 'note' | 'meeting')}
              className="text-sm px-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
              <option value="note">{t('logTypes.note')}</option>
              <option value="meeting">{t('logTypes.meeting')}</option>
            </select>
            {logType === 'meeting' && (
              <>
                <input type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)}
                  className="text-sm px-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100" />
                <input type="time" value={logTime} onChange={(e) => setLogTime(e.target.value)}
                  className="text-sm px-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 w-28" />
                <input type="text" value={logLocation} onChange={(e) => setLogLocation(e.target.value)}
                  placeholder={t('meetingLocationPlaceholder')} className="text-sm px-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 flex-1" />
              </>
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
            {logs.map((log) => {
              const isEmailLog = log.type === 'email' && (log.email_subject || log.email_body || log.email_attachments?.length)
              const expanded = expandedLogIds.has(log.id)
              return (
                <li key={log.id} className="relative">
                  <div className="absolute -left-[21px] top-1 w-3 h-3 rounded-full bg-blue-500 border-2 border-white dark:border-gray-900" />
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded ${TYPE_COLOR[log.type] ?? TYPE_COLOR.note}`}>
                      {t(`logTypes.${log.type as 'note' | 'meeting' | 'email' | 'system'}`)}
                    </span>
                    {log.meeting_date && <span className="text-xs text-gray-500 dark:text-gray-400">📅 {log.meeting_date}{log.meeting_time ? ` ${log.meeting_time.slice(0, 5)}` : ''}</span>}
                    {log.meeting_location && <span className="text-xs text-gray-500 dark:text-gray-400">📍 {log.meeting_location}</span>}
                    {/* Email tracking badges — only for emails with campaign_id (SendGrid events flow in via webhook) */}
                    {log.type === 'email' && log.campaign_id && emailStatus[log.campaign_id] && (() => {
                      const s = emailStatus[log.campaign_id]
                      return (
                        <>
                          {s.delivered && !s.opened && !s.clicked && !s.bounced && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400" title="已寄達但尚未開啟">✉ 已寄達</span>
                          )}
                          {s.opened && !s.clicked && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400" title={`開啟時間：${s.openedAt ? new Date(s.openedAt).toLocaleString('zh-TW') : ''}`}>👁 已開啟</span>
                          )}
                          {s.clicked && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400" title={`點擊時間：${s.clickedAt ? new Date(s.clickedAt).toLocaleString('zh-TW') : ''}`}>🖱 已點擊</span>
                          )}
                          {s.bounced && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400" title="退信或 dropped">⚠ 彈信</span>
                          )}
                          {s.spam && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400" title="被標示為垃圾信">🚫 垃圾信</span>
                          )}
                          {s.unsubscribed && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400" title="此收件人已退訂">取消訂閱</span>
                          )}
                        </>
                      )
                    })()}
                    {isEmailLog && (
                      <button
                        type="button"
                        onClick={() => setExpandedLogIds(prev => {
                          const next = new Set(prev)
                          expanded ? next.delete(log.id) : next.add(log.id)
                          return next
                        })}
                        className="flex items-center gap-0.5 text-xs text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                      >
                        <ChevronDown size={13} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
                        {expanded ? t('collapse') : t('expand')}
                      </button>
                    )}
                  </div>
                  {editingLogId === log.id ? (
                    <div className="mt-1 space-y-2">
                      <textarea
                        value={editingLogContent}
                        onChange={(e) => setEditingLogContent(e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 text-sm border border-blue-300 dark:border-blue-700 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                      />
                      {log.type === 'meeting' && (
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-gray-500 dark:text-gray-400 shrink-0">📅 {t('meetingDateShort')}</label>
                            <input type="date" value={editingLogMeetingDate} onChange={(e) => setEditingLogMeetingDate(e.target.value)}
                              className="px-2 py-1 text-sm border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800" />
                            <label className="text-xs text-gray-500 dark:text-gray-400 shrink-0">{tt('meetingTime')}</label>
                            <input type="time" value={editingLogMeetingTime} onChange={(e) => setEditingLogMeetingTime(e.target.value)}
                              className="px-2 py-1 text-sm border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 w-28" />
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-gray-500 dark:text-gray-400 shrink-0">📍 {tt('meetingLocation')}</label>
                            <input type="text" value={editingLogMeetingLocation} onChange={(e) => setEditingLogMeetingLocation(e.target.value)}
                              placeholder={tt('meetingLocation')} className="flex-1 px-2 py-1 text-sm border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800" />
                          </div>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <button
                          onClick={() => saveLogEdit(log.id)}
                          disabled={savingLogId === log.id}
                          className="flex items-center gap-1 px-3 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        >
                          {savingLogId === log.id ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                          {tc('save')}
                        </button>
                        <button onClick={() => setEditingLogId(null)} className="px-3 py-1 text-xs text-gray-500 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">
                          {tc('cancel')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-line">{log.content}</p>
                  )}
                  {isEmailLog && expanded && (
                    <div className="mt-2 ml-0.5 space-y-2 border-l-2 border-green-200 dark:border-green-800 pl-3">
                      {log.email_subject && (
                        <div>
                          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{t('subject')}</span>
                          <p className="text-sm text-gray-800 dark:text-gray-200">{log.email_subject}</p>
                        </div>
                      )}
                      {log.email_body && (
                        <div>
                          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{t('content')}</span>
                          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">{log.email_body}</p>
                        </div>
                      )}
                      {log.email_attachments && log.email_attachments.length > 0 && (
                        <div>
                          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{tt('emailAttachments')}</span>
                          <ul className="mt-0.5 space-y-0.5">
                            {log.email_attachments.map((name, i) => (
                              <li key={i} className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
                                <Paperclip size={11} /> {name}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-0.5">
                    {log.users?.display_name && <span className="text-xs text-gray-500 dark:text-gray-400">{log.users.display_name}</span>}
                    <time className="text-xs text-gray-400 dark:text-gray-500">{new Date(log.created_at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}</time>
                    {log.type !== 'system' && editingLogId !== log.id && (
                      <>
                        {!isEmailLog && (
                          <button
                            onClick={() => {
                              setEditingLogId(log.id)
                              setEditingLogContent(log.content ?? '')
                              setEditingLogMeetingDate(log.meeting_date ?? '')
                              setEditingLogMeetingTime(log.meeting_time ?? '')
                              setEditingLogMeetingLocation(log.meeting_location ?? '')
                            }}
                            className="text-gray-300 hover:text-gray-500 dark:hover:text-gray-400 ml-1"
                            title={tc('edit')}
                          >
                            <Pencil size={11} />
                          </button>
                        )}
                        <button
                          onClick={() => deleteLog(log.id)}
                          disabled={deletingLogId === log.id}
                          className="text-gray-300 hover:text-red-500 dark:hover:text-red-400 disabled:opacity-40"
                          title={tc('delete')}
                        >
                          {deletingLogId === log.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                        </button>
                      </>
                    )}
                  </div>
                </li>
              )
            })}
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
              title={t('zoomIn')}
            ><ZoomIn size={18} /></button>
            <button
              className="text-white/80 hover:text-white bg-black/40 rounded-full p-2 transition-colors"
              onClick={() => lbZoom(-0.25)}
              title={t('zoomOut')}
            ><ZoomOut size={18} /></button>
            <button
              className="text-white/80 hover:text-white bg-black/40 rounded-full p-2 transition-colors"
              onClick={lbReset}
              title={t('zoomReset')}
            ><Maximize2 size={18} /></button>
            <button
              className="text-white/80 hover:text-white bg-black/40 rounded-full p-2 transition-colors"
              onClick={closeLightbox}
              title={t('close')}
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
              alt={t('cardLargeAlt')}
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
                    <Loader2 size={16} className="animate-spin" /> {t('recognizing')}
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

              {/* Importance section */}
              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">{t('importance')}</p>
                <div className="flex gap-2">
                  {(['high', 'medium', 'low'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setEditForm((prev) => ({ ...prev, importance: v }))}
                      className={`flex-1 py-1.5 text-sm rounded-lg border transition-colors ${
                        editForm.importance === v
                          ? 'bg-green-500 border-green-500 text-white'
                          : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                    >
                      {v === 'high' ? 'H' : v === 'low' ? 'L' : 'M'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Language section */}
              <div>
                <label className={labelClass}>{t('language')}</label>
                <select
                  value={editForm.language}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, language: e.target.value }))}
                  className={inputClass}
                >
                  <option value="chinese">{t('languageChinese')}</option>
                  <option value="english">{t('languageEnglish')}</option>
                  <option value="japanese">{t('languageJapanese')}</option>
                </select>
              </div>

              {/* Contact section */}
              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">{t('sectionContact')}</p>
                <div className="grid grid-cols-1 gap-3">
                  {([['Email', 'email', 'email'], [t('secondEmail'), 'second_email', 'email'], [t('phone'), 'phone', 'tel'], [t('secondPhone'), 'second_phone', 'tel'], [t('fax'), 'fax', 'tel'], [t('address'), 'address', 'text'], [t('addressEn'), 'address_en', 'text'], [t('hospital'), 'hospital', 'text'], [t('department'), 'department', 'text'], [t('website'), 'website', 'text']] as [string, string, string][]).map(([label, field, type]) => (
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
                      <input type="text" value={editForm[field as keyof typeof editForm]}
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

              {/* Met section */}
              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">{t('sectionMet')}</p>
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className={labelClass}>{t('metAt')}</label>
                    <input type="text" value={editForm.met_at} onChange={(e) => setEditForm((prev) => ({ ...prev, met_at: e.target.value }))}
                      placeholder={t('metAtPlaceholder')} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>{t('metDate')}</label>
                    <input type="date" value={editForm.met_date} onChange={(e) => setEditForm((prev) => ({ ...prev, met_date: e.target.value }))}
                      className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>{t('referredBy')}</label>
                    <input type="text" value={editForm.referred_by} onChange={(e) => setEditForm((prev) => ({ ...prev, referred_by: e.target.value }))}
                      placeholder={t('referredByPlaceholder')} className={inputClass} />
                  </div>
                </div>
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
                  <label className="block text-xs font-medium text-gray-500 mb-1">{tm('recipient')} <span className="text-gray-400 font-normal">{tm('recipientHint')}</span></label>
                  <RecipientChipInput recipients={mailToList} onChange={setMailToList} contacts={contactOptions} placeholder={tm('searchContactPlaceholder')} />
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-500 mb-1">CC <span className="text-gray-400 font-normal">{tm('ccHint')}</span></label>
                    <RecipientChipInput recipients={mailCcList} onChange={setMailCcList} contacts={contactOptions} placeholder={tm('searchOrEmailPlaceholder')} />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-500 mb-1">BCC <span className="text-gray-400 font-normal">{tm('bccHint')}</span></label>
                    <RecipientChipInput recipients={mailBccList} onChange={setMailBccList} contacts={contactOptions} placeholder={tm('searchOrEmailPlaceholder')} />
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
                  <p className="text-xs font-medium text-gray-500 mb-1.5">{tm('templateAttachments')}</p>
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
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">{tm('aiGeneratedBody')}</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={mailAiDesc}
                    onChange={(e) => setMailAiDesc(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAiGenerateMail()}
                    placeholder={tm('aiPromptPlaceholder')}
                    className="flex-1 text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={handleAiGenerateMail}
                    disabled={mailAiGenerating || !mailAiDesc.trim()}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-40"
                  >
                    {mailAiGenerating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    {t('generate')}
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
                <TipTapEditor
                  key={mailEditorKey}
                  content={mailBody}
                  onChange={(html) => setMailBody(html)}
                  placeholder={tm('bodyPlaceholder')}
                />
              </div>

              {/* Contact photos — click to attach */}
              {contactPhotos.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">{tm('contactPhotos')}</label>
                  <div className="flex flex-wrap gap-2">
                    {contactPhotos.map((photo) => {
                      const attached = tempAttaches.some((a) => a.photoId === photo.id)
                      const loading = photoAttaching === photo.id
                      return (
                        <button
                          key={photo.id}
                          onClick={() => toggleContactPhotoAttach(photo)}
                          disabled={loading}
                          className={`relative w-20 h-20 rounded-lg overflow-hidden border-2 transition-all ${
                            attached
                              ? 'border-blue-500 ring-2 ring-blue-200 dark:ring-blue-900'
                              : 'border-gray-200 dark:border-gray-700 hover:border-blue-400'
                          } disabled:opacity-50`}
                          title={attached ? tm('photoAttached') : tm('attachPhoto')}
                        >
                          <Image src={photo.photo_url} alt="" width={80} height={80} className="w-full h-full object-cover" unoptimized />
                          {loading && (
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                              <Loader2 size={16} className="animate-spin text-white" />
                            </div>
                          )}
                          {attached && !loading && (
                            <div className="absolute top-0.5 right-0.5 bg-blue-500 rounded-full p-0.5">
                              <Check size={10} className="text-white" />
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Temp attachments */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-gray-500">{tm('extraAttachments')}</label>
                  <button
                    onClick={() => tempAttachRef.current?.click()}
                    className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    <Paperclip size={11} /> {tc('add')}
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

      {/* Merge Search Modal */}
      {mergeSearchOpen && !mergeTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <Merge size={16} /> {t('selectMergeContact')}
              </h2>
              <button onClick={() => setMergeSearchOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t.rich('mergeSearchDesc', {
                  name: contact?.name || contact?.name_en || '',
                  strong: (chunks) => <strong>{chunks}</strong>,
                })}
              </p>
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  autoFocus
                  type="text"
                  value={mergeQuery}
                  onChange={(e) => searchMergeContacts(e.target.value)}
                  placeholder={tm('searchContactsPlaceholder')}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {mergeSearching && <p className="text-sm text-gray-400 text-center py-2">{tc('loading')}</p>}
              {!mergeSearching && mergeResults.length > 0 && (
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {mergeResults.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => setMergeTarget({ id: r.id, name: r.name, name_en: r.name_en, company: r.company, company_en: null, email: r.email })}
                      className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 border border-gray-100 dark:border-gray-800 transition-colors"
                    >
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{r.name || r.name_en || t('noName')}</p>
                      <p className="text-xs text-gray-400">{[r.company, r.email].filter(Boolean).join(' · ')}</p>
                    </button>
                  ))}
                </div>
              )}
              {!mergeSearching && mergeQuery.length > 0 && mergeResults.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-2">{tm('noContactFound')}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Merge Confirm Modal */}
      {mergeTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <Merge size={16} /> {t('mergeConfirm')}
              </h2>
              <button onClick={() => setMergeTarget(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-4">
                  <p className="text-xs font-semibold text-green-700 dark:text-green-400 mb-2 uppercase tracking-wide">{t('mergeKeepLabel')}</p>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{contact?.name || contact?.name_en || t('noName')}</p>
                  <p className="text-sm text-gray-500">{contact?.company}</p>
                  <p className="text-xs text-gray-400">{contact?.email}</p>
                </div>
                <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-4">
                  <p className="text-xs font-semibold text-red-700 dark:text-red-400 mb-2 uppercase tracking-wide">{t('mergeDeleteLabel')}</p>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{mergeTarget.name || mergeTarget.name_en || t('noName')}</p>
                  <p className="text-sm text-gray-500">{mergeTarget.company}</p>
                  <p className="text-xs text-gray-400">{mergeTarget.email}</p>
                </div>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-xs text-gray-500 dark:text-gray-400 space-y-1">
                <p>{t('mergeRule1')}</p>
                <p>{t('mergeRule2')}</p>
                <p>{t('mergeRule3')}</p>
              </div>
            </div>
            <div className="flex justify-between gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
              <button onClick={() => setMergeTarget(null)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900">
                {t('reselect')}
              </button>
              <button
                onClick={handleMerge}
                disabled={mergeSaving}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50"
              >
                {mergeSaving ? <Loader2 size={14} className="animate-spin" /> : <Merge size={14} />}
                確認合併
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
