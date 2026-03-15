'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { sendMail } from '@/lib/graph'
import { ArrowLeft, ImageIcon, Mail, X, Pencil, Loader2, Plus, Upload, Trash2 } from 'lucide-react'
import Image from 'next/image'

interface Tag { id: string; name: string }
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
  card_img_url: string | null
  card_img_back_url: string | null
  created_at: string
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
interface EmailTemplate { id: string; title: string; subject: string | null; body_content: string | null }

const TYPE_LABEL: Record<string, string> = { note: '筆記', meeting: '會議', email: '郵件', system: '系統' }
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
}

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createBrowserSupabaseClient()
  const editFileRef = useRef<HTMLInputElement>(null)
  const cardUploadRef = useRef<HTMLInputElement>(null)

  const [contact, setContact] = useState<Contact | null>(null)
  const [contactCards, setContactCards] = useState<ContactCard[]>([])
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [logs, setLogs] = useState<Log[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [aiModelId, setAiModelId] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)

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

  // Card upload
  const [cardUploading, setCardUploading] = useState(false)
  const [cardLabel, setCardLabel] = useState('')

  // Tags
  const [tagInput, setTagInput] = useState('')
  const [tagDropOpen, setTagDropOpen] = useState(false)

  // Mail modal
  const [mailOpen, setMailOpen] = useState(false)
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [mailSubject, setMailSubject] = useState('')
  const [mailBody, setMailBody] = useState('')
  const [mailSending, setMailSending] = useState(false)
  const [mailError, setMailError] = useState<string | null>(null)

  useEffect(() => { load() }, [id])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (user?.email) {
      const { data: profile } = await supabase.from('users').select('id, ai_model_id').eq('email', user.email).single()
      if (profile) { setCurrentUserId(profile.id); setAiModelId(profile.ai_model_id ?? null) }
    }
    const [{ data: c }, { data: l }, { data: tags }, { data: cards }] = await Promise.all([
      supabase.from('contacts').select('*, users(display_name), contact_tags(tags(id, name))').eq('id', id).single(),
      supabase.from('interaction_logs').select('id, content, type, meeting_date, created_at, users(display_name)').eq('contact_id', id).order('created_at', { ascending: false }),
      supabase.from('tags').select('id, name').order('name'),
      supabase.from('contact_cards').select('id, url, label, created_at').eq('contact_id', id).order('created_at', { ascending: true }),
    ])
    setContact(c as unknown as Contact)
    setLogs((l as unknown as Log[]) ?? [])
    setAllTags(tags ?? [])
    setContactCards(cards ?? [])
  }

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
    })
    setEditOpen(true)
  }

  async function handleEditImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string
      const base64 = dataUrl.split(',')[1]
      setEditOcring(true)
      try {
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
    reader.readAsDataURL(file)
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

  // ── Contact Cards ────────────────────────────────────────────────────────────

  async function handleCardUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setCardUploading(true)
    try {
      const buf = await file.arrayBuffer()
      const uint8 = new Uint8Array(buf)
      const filename = `cards/${id}_${Date.now()}.jpg`
      const { error: uploadErr } = await supabase.storage.from('cards').upload(filename, uint8, { contentType: file.type || 'image/jpeg' })
      if (uploadErr) throw uploadErr
      const { data: urlData } = supabase.storage.from('cards').getPublicUrl(filename)
      await supabase.from('contact_cards').insert({ contact_id: id, url: urlData.publicUrl, storage_path: filename, label: cardLabel.trim() || null })
      setCardLabel('')
      if (cardUploadRef.current) cardUploadRef.current.value = ''
      load()
    } finally { setCardUploading(false) }
  }

  async function deleteCard(cardId: string, storagePath?: string) {
    if (!confirm('確定要刪除此名片圖？')) return
    if (storagePath) await supabase.storage.from('cards').remove([storagePath])
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
    if (data) setLogs((prev) => [data as unknown as Log, ...prev])
    setLogContent(''); setLogDate(''); setAddingLog(false)
  }

  // ── Mail ─────────────────────────────────────────────────────────────────────

  async function openMailModal() {
    const { data } = await supabase.from('email_templates').select('id, title, subject, body_content').order('title')
    setTemplates(data ?? []); setMailSubject(''); setMailBody(''); setMailError(null); setMailOpen(true)
  }

  async function handleSendMail() {
    if (!contact?.email || !mailSubject.trim()) return
    setMailSending(true); setMailError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const accessToken = session?.provider_token
      if (!accessToken) throw new Error('找不到 Microsoft 存取權限，請重新登入')
      await sendMail({ accessToken, to: contact.email, subject: mailSubject, body: mailBody })
      const { data } = await supabase.from('interaction_logs')
        .insert({ contact_id: id, content: `寄送郵件：${mailSubject}`, type: 'email', created_by: currentUserId })
        .select('id, content, type, meeting_date, created_at, users(display_name)').single()
      if (data) setLogs((prev) => [data as unknown as Log, ...prev])
      setMailOpen(false)
    } catch (e) {
      setMailError(e instanceof Error ? e.message : '寄送失敗，請稍後再試')
    } finally { setMailSending(false) }
  }

  if (!contact) return <div className="text-gray-400 text-sm">載入中...</div>

  const inputClass = 'w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500'
  const labelClass = 'block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1'

  function InfoRow({ label, value, href }: { label: string; value: string | null | undefined; href?: string }) {
    if (!value) return null
    return (
      <div className="flex gap-3 text-sm">
        <span className="w-24 text-gray-400 dark:text-gray-500 shrink-0">{label}</span>
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline truncate">{value}</a>
        ) : (
          <span className="text-gray-900 dark:text-gray-100">{value}</span>
        )}
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
        <ArrowLeft size={16} /> 返回聯絡人列表
      </button>

      {/* Basic Info */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-4">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex-1 min-w-0 space-y-1.5">
            <InfoRow label="姓名" value={contact.name} />
            <InfoRow label="英文姓名" value={contact.name_en} />
            <InfoRow label="當地語言" value={contact.name_local} />
            <InfoRow label="公司" value={contact.company} />
            <InfoRow label="英文公司" value={contact.company_en} />
            <InfoRow label="當地公司" value={contact.company_local} />
            <InfoRow label="職稱" value={contact.job_title} />
            <InfoRow label="Email" value={contact.email} href={contact.email ? `mailto:${contact.email}` : undefined} />
            <InfoRow label="第二 Email" value={contact.second_email} href={contact.second_email ? `mailto:${contact.second_email}` : undefined} />
            <InfoRow label="電話" value={contact.phone} href={contact.phone ? `tel:${contact.phone}` : undefined} />
            <InfoRow label="第二電話" value={contact.second_phone} href={contact.second_phone ? `tel:${contact.second_phone}` : undefined} />
            <InfoRow label="地址" value={contact.address} />
            <InfoRow label="網站" value={contact.website} href={contact.website ?? undefined} />
            <InfoRow label="LinkedIn" value={contact.linkedin_url} href={contact.linkedin_url ?? undefined} />
            <InfoRow label="Facebook" value={contact.facebook_url} href={contact.facebook_url ?? undefined} />
            <InfoRow label="建立者" value={contact.users?.display_name} />
            {contact.notes && (
              <div className="flex gap-3 text-sm mt-2">
                <span className="w-24 text-gray-400 dark:text-gray-500 shrink-0">備註</span>
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
                <Plus size={10} /> 新增 Tag
              </button>
              {tagDropOpen && (
                <div className="absolute top-full mt-1 left-0 z-10 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-2 min-w-40">
                  <input autoFocus value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="搜尋 tag..." className="w-full text-xs px-2 py-1 border border-gray-200 dark:border-gray-700 rounded mb-1 bg-white dark:bg-gray-800" />
                  {filteredTags.map((t) => (
                    <button key={t.id} onClick={() => addTag(t)} className="w-full text-left text-xs px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800 rounded text-gray-700 dark:text-gray-300">{t.name}</button>
                  ))}
                  {filteredTags.length === 0 && <p className="text-xs text-gray-400 px-2 py-1">無符合 Tag</p>}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-4 border-t border-gray-100 dark:border-gray-800">
          <button onClick={openEdit} className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
            <Pencil size={14} /> 編輯
          </button>
          {contact.email && (
            <button onClick={openMailModal} className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              <Mail size={14} /> 寄信
            </button>
          )}
        </div>
      </div>

      {/* Contact Cards */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-4">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">名片圖片</h2>

        {/* Card gallery */}
        {allCards.length > 0 ? (
          <div className="flex flex-wrap gap-3 mb-4">
            {allCards.map((card) => (
              <div key={card.id} className="relative group">
                <div className="w-36 h-24 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 cursor-pointer" onClick={() => setLightbox(card.url)}>
                  <Image src={card.url} alt={card.label ?? '名片'} width={144} height={96} className="object-cover w-full h-full" />
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
        ) : (
          <div className="flex items-center justify-center w-36 h-24 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 mb-4">
            <ImageIcon size={24} className="text-gray-300 dark:text-gray-600" />
          </div>
        )}

        {/* Upload new card */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={cardLabel}
            onChange={(e) => setCardLabel(e.target.value)}
            placeholder="標籤（選填，如：正面、反面）"
            className="text-sm px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1"
          />
          <button
            onClick={() => cardUploadRef.current?.click()}
            disabled={cardUploading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
          >
            {cardUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            上傳名片
          </button>
          <input ref={cardUploadRef} type="file" accept="image/*" className="hidden" onChange={handleCardUpload} />
        </div>
      </div>

      {/* Interaction Logs */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">互動紀錄</h2>
        {/* Add Log */}
        <div className="space-y-2 mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <div className="flex gap-2">
            <select value={logType} onChange={(e) => setLogType(e.target.value as 'note' | 'meeting')}
              className="text-sm px-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
              <option value="note">筆記</option>
              <option value="meeting">會議</option>
            </select>
            {logType === 'meeting' && (
              <input type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)}
                className="text-sm px-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100" />
            )}
          </div>
          <div className="flex gap-2">
            <input type="text" value={logContent} onChange={(e) => setLogContent(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddLog()}
              placeholder="輸入互動紀錄..." className="flex-1 text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <button onClick={handleAddLog} disabled={addingLog || !logContent.trim()}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">新增</button>
          </div>
        </div>
        {/* Timeline */}
        {logs.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">尚無互動紀錄</p>
        ) : (
          <ol className="relative border-l border-gray-200 dark:border-gray-700 space-y-5 pl-5">
            {logs.map((log) => (
              <li key={log.id} className="relative">
                <div className="absolute -left-[21px] top-1 w-3 h-3 rounded-full bg-blue-500 border-2 border-white dark:border-gray-900" />
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs px-2 py-0.5 rounded ${TYPE_COLOR[log.type] ?? TYPE_COLOR.note}`}>{TYPE_LABEL[log.type] ?? log.type}</span>
                  {log.meeting_date && <span className="text-xs text-gray-500 dark:text-gray-400">📅 {log.meeting_date}</span>}
                </div>
                <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-line">{log.content}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {log.users?.display_name && <span className="text-xs text-gray-500 dark:text-gray-400">{log.users.display_name}</span>}
                  <time className="text-xs text-gray-400 dark:text-gray-500">{new Date(log.created_at).toLocaleString('zh-TW')}</time>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50" onClick={() => setLightbox(null)}>
          <Image src={lightbox} alt="名片大圖" width={800} height={500} className="max-w-[90vw] max-h-[80vh] object-contain rounded-lg" />
        </div>
      )}

      {/* Edit Modal */}
      {editOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-900 z-10">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">編輯聯絡人</h3>
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
                  <p className="text-sm text-gray-400 py-2">點擊掃描名片自動填入欄位（不會存圖）</p>
                )}
              </div>

              {/* Name section */}
              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">姓名</p>
                <div className="grid grid-cols-1 gap-3">
                  {[['姓名', 'name'], ['英文姓名', 'name_en'], ['當地語言姓名', 'name_local']].map(([label, field]) => (
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
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">公司 / 職稱</p>
                <div className="grid grid-cols-1 gap-3">
                  {[['公司', 'company'], ['英文公司名', 'company_en'], ['當地語言公司名', 'company_local'], ['職稱', 'job_title']].map(([label, field]) => (
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
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">聯絡方式</p>
                <div className="grid grid-cols-1 gap-3">
                  {[['Email', 'email', 'email'], ['第二 Email', 'second_email', 'email'], ['電話', 'phone', 'tel'], ['第二電話', 'second_phone', 'tel'], ['地址', 'address', 'text'], ['網站', 'website', 'url']].map(([label, field, type]) => (
                    <div key={field}>
                      <label className={labelClass}>{label}</label>
                      <input type={type} value={editForm[field as keyof typeof editForm]}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, [field]: e.target.value }))}
                        className={inputClass} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Social section */}
              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">社群</p>
                <div className="grid grid-cols-1 gap-3">
                  {[['LinkedIn', 'linkedin_url'], ['Facebook', 'facebook_url']].map(([label, field]) => (
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
                <label className={labelClass}>備註</label>
                <textarea value={editForm.notes} onChange={(e) => setEditForm((prev) => ({ ...prev, notes: e.target.value }))}
                  rows={3} className={inputClass + ' resize-none'} />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 sticky bottom-0 bg-white dark:bg-gray-900">
              <button onClick={() => setEditOpen(false)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900">取消</button>
              <button onClick={saveEdit} disabled={editSaving || editOcring}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {editSaving && <Loader2 size={14} className="animate-spin" />} 儲存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mail Modal */}
      {mailOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">寄送郵件</h3>
              <button onClick={() => setMailOpen(false)} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"><X size={18} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">收件人</label>
                <input type="text" value={contact.email ?? ''} readOnly className="w-full text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400" />
              </div>
              {templates.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">套用範本</label>
                  <select defaultValue="" onChange={(e) => { const t = templates.find((t) => t.id === e.target.value); if (t) { setMailSubject(t.subject ?? ''); setMailBody(t.body_content ?? '') } }}
                    className="w-full text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                    <option value="">— 選擇範本 —</option>
                    {templates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">主旨</label>
                <input type="text" value={mailSubject} onChange={(e) => setMailSubject(e.target.value)} placeholder="郵件主旨"
                  className="w-full text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">內文（支援 HTML）</label>
                <textarea value={mailBody} onChange={(e) => setMailBody(e.target.value)} rows={6} placeholder="郵件內文..."
                  className="w-full text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              {mailError && <p className="text-sm text-red-600 dark:text-red-400">{mailError}</p>}
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
              <button onClick={() => setMailOpen(false)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900">取消</button>
              <button onClick={handleSendMail} disabled={mailSending || !mailSubject.trim()}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">
                <Mail size={14} /> {mailSending ? '寄送中...' : '送出'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
