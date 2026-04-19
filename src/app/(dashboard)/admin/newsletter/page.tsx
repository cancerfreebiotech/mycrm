'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import TipTapEditor, { TipTapAttachment } from '@/components/TipTapEditor'
import {
  Plus, Send, Pause, Play, Copy, Trash2, ChevronRight, ChevronLeft,
  Users, Mail, BarChart2, X, Search, Check, AlertCircle,
} from 'lucide-react'
import { PermissionGate } from '@/components/PermissionGate'

// ── Types ────────────────────────────────────────────────────────────────────

interface Campaign {
  id: string
  title: string
  subject: string
  preview_text: string | null
  content_html: string | null
  content_json: object | null
  tag_ids: string[]
  extra_contact_ids: string[]
  status: 'draft' | 'scheduled' | 'sending' | 'paused' | 'sent'
  scheduled_at: string | null
  daily_limit: number
  send_hour: number
  total_recipients: number
  sent_count: number
  created_at: string
  sent_at: string | null
}

interface Recipient {
  id: string
  email: string
  status: 'pending' | 'sent' | 'failed'
  opened_at: string | null
  clicked_at: string | null
  contacts: { name: string | null; company: string | null } | null
}

interface Unsubscribe {
  id: string
  email: string
  reason: string | null
  unsubscribed_at: string
  source: string
}

interface Blacklist {
  id: string
  email: string
  reason: string | null
  created_at: string
}

interface Tag { id: string; name: string; color: string | null }
interface ContactOption { id: string; name: string | null; email: string; company: string | null }

type View = 'list' | 'wizard' | 'detail' | 'unsubscribes' | 'blacklist'
type WizardStep = 1 | 2 | 3 | 4

const STATUS_I18N_KEY: Record<Campaign['status'], string> = {
  draft: 'statusDraft', scheduled: 'statusScheduled', sending: 'statusSending', paused: 'statusPaused', sent: 'statusSent',
}
const STATUS_COLOR: Record<Campaign['status'], string> = {
  draft: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  scheduled: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  sending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  paused: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  sent: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(dt: string | null) {
  if (!dt) return '—'
  return new Date(dt).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function estimateDays(total: number, limit: number) {
  if (!total || !limit) return null
  return Math.ceil(total / limit)
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function NewsletterPage() {
  const t = useTranslations('newsletter')
  const tc = useTranslations('common')
  const supabase = createBrowserSupabaseClient()
  const [view, setView] = useState<View>('list')
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null)
  const [tags, setTags] = useState<Tag[]>([])
  const [contactOptions, setContactOptions] = useState<ContactOption[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: camps }, { data: tagRows }, { data: contactRows }] = await Promise.all([
      supabase.from('newsletter_campaigns').select('*').order('created_at', { ascending: false }),
      supabase.from('tags').select('id, name, color').order('name'),
      supabase.from('contacts').select('id, name, email, company').is('deleted_at', null).not('email', 'is', null).order('name'),
    ])
    setCampaigns((camps ?? []) as Campaign[])
    setTags((tagRows ?? []) as Tag[])
    setContactOptions((contactRows ?? []) as ContactOption[])
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  // ── Campaign actions ──────────────────────────────────────────────────────

  async function togglePause(c: Campaign) {
    const next = c.status === 'paused' ? 'sending' : 'paused'
    await supabase.from('newsletter_campaigns').update({ status: next }).eq('id', c.id)
    setCampaigns(prev => prev.map(x => x.id === c.id ? { ...x, status: next } : x))
  }

  async function duplicateCampaign(c: Campaign) {
    const { data } = await supabase.from('newsletter_campaigns').insert({
      title: t('copyTitle', { title: c.title }),
      subject: c.subject,
      preview_text: c.preview_text,
      content_html: c.content_html,
      content_json: c.content_json,
      tag_ids: c.tag_ids,
      extra_contact_ids: c.extra_contact_ids,
      daily_limit: c.daily_limit,
      send_hour: c.send_hour,
    }).select('*').single()
    if (data) setCampaigns(prev => [data as Campaign, ...prev])
  }

  async function deleteCampaign(id: string) {
    if (!confirm(t('confirmDelete'))) return
    await supabase.from('newsletter_campaigns').delete().eq('id', id)
    setCampaigns(prev => prev.filter(x => x.id !== id))
  }

  // ── Views ─────────────────────────────────────────────────────────────────

  if (loading) return <div className="p-8 text-center text-gray-400">{tc('loading')}</div>

  if (view === 'wizard') return (
    <WizardView
      supabase={supabase}
      tags={tags}
      contactOptions={contactOptions}
      initialCampaign={selectedCampaign}
      onSave={(c) => {
        setCampaigns(prev => {
          const exists = prev.find(x => x.id === c.id)
          return exists ? prev.map(x => x.id === c.id ? c : x) : [c, ...prev]
        })
        setView('list')
      }}
      onCancel={() => setView('list')}
    />
  )

  if (view === 'detail' && selectedCampaign) return (
    <DetailView
      campaign={selectedCampaign}
      supabase={supabase}
      onBack={() => setView('list')}
      onTogglePause={togglePause}
    />
  )

  if (view === 'unsubscribes') return (
    <UnsubscribesView supabase={supabase} onBack={() => setView('list')} />
  )

  if (view === 'blacklist') return (
    <BlacklistView supabase={supabase} onBack={() => setView('list')} />
  )

  // ── Campaign List ─────────────────────────────────────────────────────────
  return (
    <PermissionGate feature="newsletter">
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('pageTitle')}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('pageDesc')}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setView('unsubscribes')} className="px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400">{t('unsubscribeManagement')}</button>
          <button onClick={() => setView('blacklist')} className="px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400">{t('blacklistManagement')}</button>
          <button
            onClick={() => { setSelectedCampaign(null); setView('wizard') }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            <Plus size={16} /> {t('newCampaign')}
          </button>
        </div>
      </div>

      {campaigns.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Mail size={40} className="mx-auto mb-3 opacity-30" />
          <p>{t('emptyCampaigns')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map(c => (
            <div key={c.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[c.status]}`}>{t(STATUS_I18N_KEY[c.status])}</span>
                  <h3 className="font-medium text-gray-900 dark:text-gray-100 truncate">{c.title}</h3>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{c.subject}</p>
                {/* Progress bar */}
                {c.total_recipients > 0 && (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                      <div
                        className="bg-blue-500 h-1.5 rounded-full transition-all"
                        style={{ width: `${Math.min(100, (c.sent_count / c.total_recipients) * 100)}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">{c.sent_count} / {c.total_recipients}</span>
                  </div>
                )}
              </div>
              <div className="text-xs text-gray-400 shrink-0 hidden sm:block">{fmt(c.scheduled_at ?? c.created_at)}</div>
              <div className="flex items-center gap-1 shrink-0">
                {(c.status === 'sending' || c.status === 'paused') && (
                  <button onClick={() => togglePause(c)} title={c.status === 'paused' ? t('resumeAction') : t('pauseAction')} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-500">
                    {c.status === 'paused' ? <Play size={15} /> : <Pause size={15} />}
                  </button>
                )}
                {c.status === 'draft' && (
                  <button onClick={() => { setSelectedCampaign(c); setView('wizard') }} title={tc('edit')} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-500">
                    <ChevronRight size={15} />
                  </button>
                )}
                <button onClick={() => duplicateCampaign(c)} title={tc('copy')} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-500"><Copy size={15} /></button>
                {c.status === 'draft' && (
                  <button onClick={() => deleteCampaign(c.id)} title={tc('delete')} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded text-gray-400 hover:text-red-500"><Trash2 size={15} /></button>
                )}
                <button onClick={() => { setSelectedCampaign(c); setView('detail') }} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-500"><BarChart2 size={15} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
    </PermissionGate>
  )
}

// ── Wizard ────────────────────────────────────────────────────────────────────

function WizardView({
  supabase, tags, contactOptions, initialCampaign, onSave, onCancel,
}: {
  supabase: ReturnType<typeof createBrowserSupabaseClient>
  tags: Tag[]
  contactOptions: ContactOption[]
  initialCampaign: Campaign | null
  onSave: (c: Campaign) => void
  onCancel: () => void
}) {
  const t = useTranslations('newsletter')
  const tc = useTranslations('common')
  const [step, setStep] = useState<WizardStep>(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Step 1
  const [title, setTitle] = useState(initialCampaign?.title ?? '')
  const [subject, setSubject] = useState(initialCampaign?.subject ?? '')
  const [previewText, setPreviewText] = useState(initialCampaign?.preview_text ?? '')

  // Step 2
  const [contentHtml, setContentHtml] = useState(initialCampaign?.content_html ?? '')
  const [contentJson, setContentJson] = useState<object>(initialCampaign?.content_json ?? {})
  const [attachments, setAttachments] = useState<TipTapAttachment[]>([])
  const [testEmail, setTestEmail] = useState('')
  const [testSending, setTestSending] = useState(false)

  // Step 3
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(initialCampaign?.tag_ids ?? [])
  const [extraContactIds, setExtraContactIds] = useState<string[]>(initialCampaign?.extra_contact_ids ?? [])
  const [contactSearch, setContactSearch] = useState('')
  const [recipientCount, setRecipientCount] = useState<number | null>(null)

  // Step 4
  const [scheduledAt, setScheduledAt] = useState(
    initialCampaign?.scheduled_at
      ? new Date(initialCampaign.scheduled_at).toISOString().slice(0, 16)
      : ''
  )
  const [dailyLimit, setDailyLimit] = useState(initialCampaign?.daily_limit ?? 500)
  const [sendHour, setSendHour] = useState(initialCampaign?.send_hour ?? 9)

  // Compute estimated recipients when tags/contacts change
  useEffect(() => {
    async function compute() {
      if (selectedTagIds.length === 0 && extraContactIds.length === 0) {
        setRecipientCount(0); return
      }
      // Get contacts from tags
      let tagContactIds: string[] = []
      if (selectedTagIds.length > 0) {
        const { data } = await supabase
          .from('contact_tags')
          .select('contact_id')
          .in('tag_id', selectedTagIds)
        tagContactIds = (data ?? []).map((r: { contact_id: string }) => r.contact_id)
      }
      const allIds = [...new Set([...tagContactIds, ...extraContactIds])]
      if (allIds.length === 0) { setRecipientCount(0); return }

      // Exclude unsubscribes and blacklist
      const [{ data: unsubs }, { data: blist }] = await Promise.all([
        supabase.from('newsletter_unsubscribes').select('email'),
        supabase.from('newsletter_blacklist').select('email'),
      ])
      const excluded = new Set([
        ...(unsubs ?? []).map((r: { email: string }) => r.email),
        ...(blist ?? []).map((r: { email: string }) => r.email),
      ])

      const { data: contacts } = await supabase
        .from('contacts')
        .select('email')
        .in('id', allIds)
        .not('email', 'is', null)

      const count = (contacts ?? []).filter((c: { email: string }) => c.email && !excluded.has(c.email)).length
      setRecipientCount(count)
    }
    compute()
  }, [selectedTagIds, extraContactIds, supabase])

  async function sendTest() {
    if (!testEmail.trim()) return
    setTestSending(true)
    try {
      await fetch('/api/newsletter/send-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testEmail, subject, contentHtml }),
      })
    } finally {
      setTestSending(false)
      setTestEmail('')
    }
  }

  async function handleSubmit() {
    if (!title || !subject || !contentHtml) { setError(t('errorFillRequired')); return }
    setSaving(true); setError('')
    try {
      // Compute recipients snapshot
      let tagContactIds: string[] = []
      if (selectedTagIds.length > 0) {
        const { data } = await supabase.from('contact_tags').select('contact_id').in('tag_id', selectedTagIds)
        tagContactIds = (data ?? []).map((r: { contact_id: string }) => r.contact_id)
      }
      const allContactIds = [...new Set([...tagContactIds, ...extraContactIds])]

      const [{ data: unsubs }, { data: blist }] = await Promise.all([
        supabase.from('newsletter_unsubscribes').select('email'),
        supabase.from('newsletter_blacklist').select('email'),
      ])
      const excluded = new Set([
        ...(unsubs ?? []).map((r: { email: string }) => r.email),
        ...(blist ?? []).map((r: { email: string }) => r.email),
      ])

      const { data: contacts } = await supabase
        .from('contacts').select('id, email').is('deleted_at', null).in('id', allContactIds).not('email', 'is', null)
      const eligible = (contacts ?? []).filter((c: { id: string; email: string }) => c.email && !excluded.has(c.email))

      const campaignPayload = {
        title, subject, preview_text: previewText || null, content_html: contentHtml,
        content_json: contentJson, tag_ids: selectedTagIds, extra_contact_ids: extraContactIds,
        status: 'scheduled', scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        daily_limit: dailyLimit, send_hour: sendHour, total_recipients: eligible.length,
      }

      let campaignId = initialCampaign?.id
      let savedCampaign: Campaign

      if (campaignId) {
        const { data } = await supabase.from('newsletter_campaigns').update(campaignPayload).eq('id', campaignId).select('*').single()
        savedCampaign = data as Campaign
      } else {
        const { data } = await supabase.from('newsletter_campaigns').insert(campaignPayload).select('*').single()
        savedCampaign = data as Campaign
        campaignId = savedCampaign.id
      }

      // Write recipients snapshot
      if (eligible.length > 0) {
        await supabase.from('newsletter_recipients').delete().eq('campaign_id', campaignId)
        await supabase.from('newsletter_recipients').insert(
          eligible.map((c: { id: string; email: string }) => ({
            campaign_id: campaignId,
            contact_id: c.id,
            email: c.email,
          }))
        )
      }

      onSave(savedCampaign)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errorSaveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const filteredContacts = contactSearch
    ? contactOptions.filter(c =>
        (c.name?.toLowerCase().includes(contactSearch.toLowerCase()) ||
         c.email.toLowerCase().includes(contactSearch.toLowerCase())) &&
        !extraContactIds.includes(c.id)
      ).slice(0, 10)
    : []

  const STEPS = [t('stepBasic'), t('stepContent'), t('stepRecipients'), t('stepSchedule')]
  const days = estimateDays(recipientCount ?? 0, dailyLimit)

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        {STEPS.map((s, i) => (
          <div key={i} className="flex items-center gap-2 flex-1">
            <div className={`flex items-center justify-center w-7 h-7 rounded-full text-sm font-semibold shrink-0 ${
              step === i + 1 ? 'bg-blue-600 text-white' :
              step > i + 1 ? 'bg-green-500 text-white' :
              'bg-gray-100 dark:bg-gray-700 text-gray-500'
            }`}>{step > i + 1 ? <Check size={14} /> : i + 1}</div>
            <span className={`text-sm hidden sm:block ${step === i + 1 ? 'text-gray-900 dark:text-gray-100 font-medium' : 'text-gray-400'}`}>{s}</span>
            {i < 3 && <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700 hidden sm:block" />}
          </div>
        ))}
      </div>

      {/* Step 1 */}
      {step === 1 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{t('stepBasic')}</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('campaignName')}</label>
            <input value={title} onChange={e => setTitle(e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-blue-500" placeholder={t('campaignNamePlaceholder')} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('emailSubjectLabel')}</label>
            <input value={subject} onChange={e => setSubject(e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-blue-500" placeholder={t('emailSubjectPlaceholder')} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('previewText')}</label>
            <input value={previewText} onChange={e => setPreviewText(e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-blue-500" placeholder={t('previewTextPlaceholder')} />
          </div>
        </div>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{t('stepContent')}</h2>
          <TipTapEditor
            content={contentHtml}
            onChange={(html, json) => { setContentHtml(html); setContentJson(json) }}
            attachments={attachments}
            onAttachmentsChange={setAttachments}
            placeholder={t('contentPlaceholder')}
            unsubscribeUrl="#"
          />
          <div className="flex items-center gap-2 pt-2">
            <input value={testEmail} onChange={e => setTestEmail(e.target.value)} className="flex-1 px-3 py-1.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm outline-none" placeholder={t('testEmailPlaceholder')} />
            <button onClick={sendTest} disabled={testSending || !testEmail.trim()} className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg disabled:opacity-50 flex items-center gap-1">
              <Send size={13} /> {testSending ? t('testSending') : t('testAction')}
            </button>
          </div>
        </div>
      )}

      {/* Step 3 */}
      {step === 3 && (
        <div className="space-y-5">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{t('stepRecipients')}</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('tagSelection')}</label>
            <div className="flex flex-wrap gap-2">
              {tags.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedTagIds(prev => prev.includes(t.id) ? prev.filter(x => x !== t.id) : [...prev, t.id])}
                  className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                    selectedTagIds.includes(t.id)
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-blue-400'
                  }`}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('manualSelection')}</label>
            <input
              value={contactSearch}
              onChange={e => setContactSearch(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm outline-none mb-2"
              placeholder={t('searchContactPlaceholder')}
            />
            {filteredContacts.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => { setExtraContactIds(prev => [...prev, c.id]); setContactSearch('') }}
                className="flex items-center justify-between w-full px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 rounded text-left"
              >
                <span>{c.name ?? c.email}</span>
                <span className="text-xs text-gray-400">{c.email}</span>
              </button>
            ))}
            {extraContactIds.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {extraContactIds.map(id => {
                  const c = contactOptions.find(x => x.id === id)
                  return c ? (
                    <span key={id} className="flex items-center gap-1 text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">
                      {c.name ?? c.email}
                      <button type="button" onClick={() => setExtraContactIds(prev => prev.filter(x => x !== id))}><X size={10} /></button>
                    </span>
                  ) : null
                })}
              </div>
            )}
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg px-4 py-3 flex items-center gap-2">
            <Users size={16} className="text-blue-500 shrink-0" />
            <span className="text-sm text-blue-700 dark:text-blue-300">
              {t.rich('estimatedRecipients', {
                count: recipientCount ?? t('calculatingCount'),
                b: (chunks) => <b>{chunks}</b>,
              })}
            </span>
          </div>
        </div>
      )}

      {/* Step 4 */}
      {step === 4 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{t('stepSchedule')}</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('startTime')}</label>
            <input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('dailyLimit')}</label>
              <input type="number" min={1} max={500} value={dailyLimit} onChange={e => setDailyLimit(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('sendHour')}</label>
              <input type="number" min={0} max={23} value={sendHour} onChange={e => setSendHour(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          {recipientCount !== null && recipientCount > 0 && (
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
              {t.rich('scheduleSummary', {
                count: recipientCount,
                limit: dailyLimit,
                b: (chunks) => <b>{chunks}</b>,
              })}
              {' '}{t.rich('daysToComplete', {
                days: days ?? 0,
                b: (chunks) => <b>{chunks}</b>,
              })}
              {days && scheduledAt && (() => {
                const end = new Date(scheduledAt)
                end.setDate(end.getDate() + days)
                return t('estimatedCompletionDate', { date: end.toLocaleDateString(undefined) })
              })()}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mt-4 flex items-center gap-2 text-sm text-red-500">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between mt-8">
        <button
          onClick={step === 1 ? onCancel : () => setStep(s => (s - 1) as WizardStep)}
          className="flex items-center gap-1 px-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          <ChevronLeft size={15} /> {step === 1 ? tc('cancel') : t('previousStep')}
        </button>
        {step < 4 ? (
          <button
            onClick={() => {
              if (step === 1 && (!title || !subject)) { setError(t('errorFillNameSubject')); return }
              setError(''); setStep(s => (s + 1) as WizardStep)
            }}
            className="flex items-center gap-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            {t('nextStep')} <ChevronRight size={15} />
          </button>
        ) : (
          <button onClick={handleSubmit} disabled={saving}
            className="flex items-center gap-1 px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
            <Check size={15} /> {saving ? t('saving') : t('confirmSchedule')}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Detail View ───────────────────────────────────────────────────────────────

function DetailView({
  campaign, supabase, onBack, onTogglePause,
}: {
  campaign: Campaign
  supabase: ReturnType<typeof createBrowserSupabaseClient>
  onBack: () => void
  onTogglePause: (c: Campaign) => void
}) {
  const t = useTranslations('newsletter')
  const tc = useTranslations('common')
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('newsletter_recipients')
        .select('id, email, status, opened_at, clicked_at, contacts(name, company)')
        .eq('campaign_id', campaign.id)
        .order('email')
      setRecipients((data ?? []) as Recipient[])
      setLoading(false)
    }
    load()
  }, [supabase, campaign.id])

  const filtered = search
    ? recipients.filter(r => r.email.toLowerCase().includes(search.toLowerCase()) || r.contacts?.name?.toLowerCase().includes(search.toLowerCase()))
    : recipients

  const openRate = recipients.length > 0
    ? Math.round(recipients.filter(r => r.opened_at).length / Math.max(1, recipients.filter(r => r.status === 'sent').length) * 100)
    : 0
  const clickRate = recipients.length > 0
    ? Math.round(recipients.filter(r => r.clicked_at).length / Math.max(1, recipients.filter(r => r.status === 'sent').length) * 100)
    : 0

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 mb-4"><ChevronLeft size={15} /> {t('backToList')}</button>

      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[campaign.status]}`}>{t(STATUS_I18N_KEY[campaign.status])}</span>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{campaign.title}</h1>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{campaign.subject}</p>
        </div>
        {(campaign.status === 'sending' || campaign.status === 'paused') && (
          <button onClick={() => onTogglePause(campaign)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">
            {campaign.status === 'paused' ? <><Play size={14} /> {t('resumeAction')}</> : <><Pause size={14} /> {t('pauseAction')}</>}
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: t('statSent'), value: `${campaign.sent_count} / ${campaign.total_recipients}` },
          { label: t('statOpenRate'), value: `${openRate}%` },
          { label: t('statClickRate'), value: `${clickRate}%` },
          { label: t('statCompletedAt'), value: fmt(campaign.sent_at) },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{s.label}</div>
            <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Progress */}
      {campaign.total_recipients > 0 && (
        <div className="mb-6">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>{t('sendProgress')}</span>
            <span>{Math.round(campaign.sent_count / campaign.total_recipients * 100)}%</span>
          </div>
          <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2">
            <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${Math.min(100, campaign.sent_count / campaign.total_recipients * 100)}%` }} />
          </div>
        </div>
      )}

      {/* Recipients */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
          <Search size={14} className="text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('searchRecipientPlaceholder')} className="flex-1 text-sm bg-transparent outline-none text-gray-900 dark:text-gray-100" />
        </div>
        {loading ? (
          <div className="py-8 text-center text-gray-400 text-sm">{tc('loading')}</div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700 max-h-96 overflow-y-auto">
            {filtered.map(r => (
              <div key={r.id} className="flex items-center px-4 py-2.5 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 dark:text-gray-100 truncate">{r.contacts?.name ?? r.email}</div>
                  {r.contacts?.name && <div className="text-xs text-gray-400 truncate">{r.email}</div>}
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  {r.status === 'sent' && <span className="text-xs text-green-600 dark:text-green-400">{t('recipientStatusSent')}</span>}
                  {r.status === 'pending' && <span className="text-xs text-gray-400">{t('recipientStatusPending')}</span>}
                  {r.status === 'failed' && <span className="text-xs text-red-500">{t('recipientStatusFailed')}</span>}
                  {r.opened_at && <span className="text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded">{t('recipientOpened')}</span>}
                  {r.clicked_at && <span className="text-xs bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 px-1.5 py-0.5 rounded">{t('recipientClicked')}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Unsubscribes ──────────────────────────────────────────────────────────────

const PAGE_SIZE = 50

function UnsubscribesView({ supabase, onBack }: { supabase: ReturnType<typeof createBrowserSupabaseClient>; onBack: () => void }) {
  const t = useTranslations('newsletter')
  const tc = useTranslations('common')
  const [rows, setRows] = useState<Unsubscribe[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)

  const fetchRows = useCallback(async (q: string, p: number) => {
    setLoading(true)
    let req = supabase
      .from('newsletter_unsubscribes')
      .select('*', { count: 'exact' })
      .order('unsubscribed_at', { ascending: false })
      .range(p * PAGE_SIZE, p * PAGE_SIZE + PAGE_SIZE - 1)
    if (q) req = req.ilike('email', `%${q}%`)
    const { data, count } = await req
    setRows((data ?? []) as Unsubscribe[])
    setTotal(count ?? 0)
    setLoading(false)
  }, [supabase])

  useEffect(() => { fetchRows(query, page) }, [fetchRows, query, page])

  function handleSearch() { setPage(0); setQuery(search) }

  async function remove(id: string) {
    await supabase.from('newsletter_unsubscribes').delete().eq('id', id)
    setRows(prev => prev.filter(r => r.id !== id))
    setTotal(t => t - 1)
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 mb-4"><ChevronLeft size={15} /> {tc('back')}</button>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t('unsubscribeManagement')}</h2>
        <span className="text-sm text-gray-400">{tc('total', { count: total })}</span>
      </div>
      <div className="flex gap-2 mb-4">
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder={t('searchEmailPlaceholder')}
            className="w-full pl-8 pr-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button onClick={handleSearch} className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-200 dark:hover:bg-gray-600">{tc('search')}</button>
      </div>
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
        {loading ? (
          <div className="py-10 text-center text-gray-400 text-sm">{tc('loading')}</div>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center text-gray-400 text-sm">{query ? tc('noResults') : t('emptyUnsubs')}</div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {rows.map(r => (
              <div key={r.id} className="flex items-center px-4 py-3 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 dark:text-gray-100">{r.email}</div>
                  <div className="text-xs text-gray-400">{r.reason ?? t('noReason')} · {fmt(r.unsubscribed_at)} · {r.source}</div>
                </div>
                <button onClick={() => remove(r.id)} title={t('removeUnsub')} className="p-1 hover:text-red-500 text-gray-400"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800">{t('prevPage')}</button>
          <span>{tc('page', { current: page + 1, total: totalPages })}</span>
          <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800">{t('nextPage')}</button>
        </div>
      )}
    </div>
  )
}

// ── Blacklist ─────────────────────────────────────────────────────────────────

function BlacklistView({ supabase, onBack }: { supabase: ReturnType<typeof createBrowserSupabaseClient>; onBack: () => void }) {
  const t = useTranslations('newsletter')
  const tc = useTranslations('common')
  const [rows, setRows] = useState<Blacklist[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [adding, setAdding] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<string | null>(null)

  const fetchRows = useCallback(async (q: string, p: number) => {
    setLoading(true)
    let req = supabase
      .from('newsletter_blacklist')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(p * PAGE_SIZE, p * PAGE_SIZE + PAGE_SIZE - 1)
    if (q) req = req.ilike('email', `%${q}%`)
    const { data, count } = await req
    setRows((data ?? []) as Blacklist[])
    setTotal(count ?? 0)
    setLoading(false)
  }, [supabase])

  useEffect(() => { fetchRows(query, page) }, [fetchRows, query, page])

  function handleSearch() { setPage(0); setQuery(search) }

  async function importSuppressions() {
    setImporting(true)
    setImportResult(null)
    try {
      const res = await fetch('/api/sendgrid/import-suppressions', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? t('importFailed'))
      setImportResult(t('importResultSuccess', { bounces: json.bounces, invalid: json.invalidEmails, unsubs: json.unsubscribes }))
      setPage(0); setQuery(''); setSearch('')
      fetchRows('', 0)
    } catch (e) {
      setImportResult(t('importResultError', { error: e instanceof Error ? e.message : t('importFailed') }))
    } finally {
      setImporting(false)
    }
  }

  async function add() {
    if (!newEmail.trim()) return
    setAdding(true)
    const { data } = await supabase.from('newsletter_blacklist')
      .upsert({ email: newEmail.trim(), reason: 'manual' }, { onConflict: 'email' })
      .select('*').single()
    if (data) {
      setRows(prev => [data as Blacklist, ...prev])
      setTotal(t => t + 1)
    }
    setNewEmail('')
    setAdding(false)
  }

  async function remove(id: string) {
    await supabase.from('newsletter_blacklist').delete().eq('id', id)
    setRows(prev => prev.filter(r => r.id !== id))
    setTotal(t => t - 1)
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 mb-4"><ChevronLeft size={15} /> {tc('back')}</button>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t('blacklistTitle')}</h2>
          <p className="text-sm text-gray-400 mt-0.5">{tc('total', { count: total })}</p>
        </div>
        <button
          onClick={importSuppressions}
          disabled={importing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 disabled:opacity-50"
          title={t('importFromSendgridTitle')}
        >
          {importing ? <><AlertCircle size={13} className="animate-pulse" /> {t('importing')}</> : t('importFromSendgrid')}
        </button>
      </div>
      {importResult && (
        <div className={`mb-4 text-sm px-3 py-2 rounded-lg ${importResult.startsWith('✅') ? 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400'}`}>
          {importResult}
        </div>
      )}
      <div className="flex gap-2 mb-3">
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder={t('searchEmailPlaceholder')}
            className="w-full pl-8 pr-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button onClick={handleSearch} className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-200 dark:hover:bg-gray-600">{tc('search')}</button>
      </div>
      <div className="flex gap-2 mb-4">
        <input value={newEmail} onChange={e => setNewEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder={t('newBlacklistEmailPlaceholder')} className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
        <button onClick={add} disabled={adding || !newEmail.trim()} className="px-4 py-2 bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900 rounded-lg text-sm hover:opacity-90 disabled:opacity-50">{tc('add')}</button>
      </div>
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
        {loading ? (
          <div className="py-10 text-center text-gray-400 text-sm">{tc('loading')}</div>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center text-gray-400 text-sm">{query ? tc('noResults') : t('emptyBlacklist')}</div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {rows.map(r => (
              <div key={r.id} className="flex items-center px-4 py-3 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 dark:text-gray-100">{r.email}</div>
                  <div className="text-xs text-gray-400">{r.reason ?? '—'} · {fmt(r.created_at)}</div>
                </div>
                <button onClick={() => remove(r.id)} title={t('removeFromBlacklist')} className="p-1 hover:text-red-500 text-gray-400"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800">{t('prevPage')}</button>
          <span>{tc('page', { current: page + 1, total: totalPages })}</span>
          <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800">{t('nextPage')}</button>
        </div>
      )}
    </div>
  )
}
