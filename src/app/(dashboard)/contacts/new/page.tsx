'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Image from 'next/image'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { Upload, Loader2, AlertTriangle, X, Sparkles, Check } from 'lucide-react'

interface Tag { id: string; name: string }
interface Country { code: string; name_zh: string; emoji: string }
interface DupContact { id: string; name: string; company: string | null }

type OcrFields = {
  name: string; name_en: string; name_local: string
  company: string; company_en: string; company_local: string
  job_title: string; email: string; second_email: string
  phone: string; second_phone: string; address: string
  website: string; linkedin_url: string; facebook_url: string
}

const EMPTY_FORM: OcrFields & { notes: string; country_code: string; met_at: string; met_date: string; referred_by: string; importance: string; source: string; language: string; hospital: string; department: string } = {
  name: '', name_en: '', name_local: '',
  company: '', company_en: '', company_local: '',
  job_title: '',
  email: '', second_email: '',
  phone: '', second_phone: '',
  address: '', website: '',
  linkedin_url: '', facebook_url: '',
  notes: '',
  country_code: '',
  met_at: '',
  met_date: '',
  referred_by: '',
  importance: 'medium',
  source: '',
  language: 'english',
  hospital: '',
  department: '',
}

function countryToLanguage(code: string | null | undefined): string {
  if (code === 'TW' || code === 'CN') return 'chinese'
  if (code === 'JP') return 'japanese'
  return 'english'
}

const FIELD_LABELS: Record<string, string> = {
  name: '姓名', name_en: '英文姓名', name_local: '當地語言姓名',
  company: '公司', company_en: '英文公司', company_local: '當地語言公司',
  job_title: '職稱', email: 'Email', second_email: '第二 Email',
  phone: '電話', second_phone: '第二電話', address: '地址', website: '網站',
  linkedin_url: 'LinkedIn', facebook_url: 'Facebook',
}

const inputClass = 'w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500'
const labelClass = 'block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1'

type FieldProps = { label: string; value: string; onChange: (v: string) => void; onBlur?: () => void; type?: string }
function Field({ label, value, onChange, onBlur, type }: FieldProps) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      <input
        type={type ?? 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        className={inputClass}
      />
    </div>
  )
}

export default function NewContactPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useTranslations('contacts')
  const tc = useTranslations('common')
  const supabase = createBrowserSupabaseClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Preloaded image from failed scan redirect
  const preloadedCardUrl = searchParams.get('card_img_url') ?? null
  const preloadedStoragePath = searchParams.get('storage_path') ?? null
  const failedScanId = searchParams.get('failed_scan_id') ?? null

  const [form, setForm] = useState(EMPTY_FORM)
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [allCountries, setAllCountries] = useState<Country[]>([])
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [files, setFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [ocring, setOcring] = useState(false)
  const [ocrResult, setOcrResult] = useState<Partial<OcrFields> | null>(null)
  const [saving, setSaving] = useState(false)
  const [dupExact, setDupExact] = useState<DupContact | null>(null)
  const [dupSimilar, setDupSimilar] = useState<DupContact[]>([])
  const [aiModelId, setAiModelId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const [{ data: tags }, { data: profile }, { data: countries }] = await Promise.all([
        supabase.from('tags').select('id, name').order('name'),
        supabase.from('users').select('ai_model_id').eq('email', user.email!).single(),
        supabase.from('countries').select('code, name_zh, emoji').eq('is_active', true).order('name_zh'),
      ])
      setAllTags(tags ?? [])
      setAllCountries(countries ?? [])
      if (profile?.ai_model_id) setAiModelId(profile.ai_model_id)

      // LinkedIn prefill
      if (searchParams.get('source') === 'linkedin') {
        const raw = sessionStorage.getItem('linkedin_prefill')
        if (raw) {
          try {
            const li = JSON.parse(raw) as { name?: string; name_en?: string; job_title?: string; company?: string; linkedin_url?: string; email?: string; notes?: string; country_code?: string }
            sessionStorage.removeItem('linkedin_prefill')
            setForm(prev => ({
              ...prev,
              name: li.name ?? '',
              name_en: li.name_en ?? '',
              job_title: li.job_title ?? '',
              company: li.company ?? '',
              linkedin_url: li.linkedin_url ?? '',
              email: li.email ?? '',
              notes: li.notes ?? '',
              source: 'linkedin',
              country_code: li.country_code ?? '',
              language: countryToLanguage(li.country_code),
            }))
          } catch { /* ignore */ }
        }
      }
    }
    init()
  }, [])

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => { previews.forEach((url) => URL.revokeObjectURL(url)) }
  }, [])

  function set(field: keyof typeof EMPTY_FORM, value: string) {
    setForm((prev) => {
      const next = { ...prev, [field]: value }
      if (field === 'country_code') next.language = countryToLanguage(value)
      return next
    })
  }

  async function checkDup() {
    if (!form.email && !form.name) return
    let exact: DupContact | null = null
    if (form.email) {
      const { data } = await supabase.from('contacts').select('id, name, company').is('deleted_at', null).eq('email', form.email).maybeSingle()
      exact = data ?? null
    }
    setDupExact(exact)
    if (form.name) {
      const { data } = await supabase.rpc('find_similar_contacts', { input_name: form.name, threshold: 0.6 })
      setDupSimilar((data ?? []).filter((c: DupContact) => c.id !== exact?.id).slice(0, 3))
    } else {
      setDupSimilar([])
    }
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

  function handleFilesChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? [])
    if (selected.length === 0) return
    const toAdd = selected.slice(0, 6 - files.length)
    const newPreviews = toAdd.map((f) => URL.createObjectURL(f))
    setFiles((prev) => [...prev, ...toAdd])
    setPreviews((prev) => [...prev, ...newPreviews])
    setOcrResult(null)
    if (e.target) e.target.value = ''
  }

  function removeFile(i: number) {
    URL.revokeObjectURL(previews[i])
    setFiles((prev) => prev.filter((_, idx) => idx !== i))
    setPreviews((prev) => prev.filter((_, idx) => idx !== i))
    setOcrResult(null)
  }

  async function handleOcr() {
    if (files.length === 0) return
    setOcring(true)
    setError(null)
    try {
      const bases = await Promise.all(files.map((f) => compressImage(f)))
      const res = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: bases, model: aiModelId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setOcrResult(data as Partial<OcrFields>)
    } catch (err) {
      setError(err instanceof Error ? err.message : '辨識失敗')
    } finally {
      setOcring(false)
    }
  }

  async function handleOcrPreloaded() {
    if (!preloadedCardUrl) return
    setOcring(true)
    setError(null)
    try {
      // Fetch the remote image and convert to base64
      const resp = await fetch(preloadedCardUrl)
      const blob = await resp.blob()
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })
      const res = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: [base64], model: aiModelId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setOcrResult(data as Partial<OcrFields>)
    } catch (err) {
      setError(err instanceof Error ? err.message : '辨識失敗')
    } finally {
      setOcring(false)
    }
  }

  function applyOcr() {
    if (!ocrResult) return
    setForm((prev) => {
      const next = { ...prev }
      for (const field of Object.keys(FIELD_LABELS) as (keyof OcrFields)[]) {
        const val = ocrResult[field]
        if (val) next[field] = val
      }
      const ocrWithCountry = ocrResult as Partial<OcrFields> & { country_code?: string }
      if (ocrWithCountry.country_code) {
        next.country_code = ocrWithCountry.country_code
        next.language = countryToLanguage(ocrWithCountry.country_code)
      }
      return next
    })
    setOcrResult(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('未登入')

      const { data: profile } = await supabase.from('users').select('id').eq('email', user.email!).single()
      if (!profile) throw new Error('找不到使用者')

      const payload = Object.fromEntries(
        Object.entries(form).map(([k, v]) => [k, v.trim() || null])
      )

      const { data: inserted, error: insertErr } = await supabase
        .from('contacts')
        .insert({ ...payload, created_by: profile.id })
        .select('id')
        .single()
      if (insertErr || !inserted) throw insertErr

      if (selectedTags.length > 0) {
        await supabase.from('contact_tags').insert(
          selectedTags.map((tag_id) => ({ contact_id: inserted.id, tag_id }))
        )
      }

      // Upload images via server API (uses service client to bypass RLS)
      // If any upload fails, delete the contact and abort
      if (files.length > 0) {
        try {
          await Promise.all(
            files.map(async (file, i) => {
              const base64 = await compressImage(file)
              const res = await fetch('/api/upload-card', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contactId: inserted.id, base64, index: i }),
              })
              if (!res.ok) {
                const err = await res.json().catch(() => ({}))
                throw new Error(`照片 ${i + 1} 上傳失敗：${err.error ?? res.status}`)
              }
            })
          )
        } catch (uploadErr) {
          // Rollback: delete the contact (cascades to contact_cards, tags, logs)
          await supabase.from('contacts').delete().eq('id', inserted.id)
          throw uploadErr
        }
      }

      // Link preloaded failed-scan image to contact
      if (preloadedCardUrl) {
        await fetch('/api/link-card', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contactId: inserted.id,
            card_img_url: preloadedCardUrl,
            storage_path: preloadedStoragePath,
            failed_scan_id: failedScanId,
          }),
        })
      }

      // Interaction log
      await supabase.from('interaction_logs').insert({
        contact_id: inserted.id,
        type: 'note',
        content: '透過網頁手動新增聯絡人',
        created_by: profile.id,
      })

      router.push(`/contacts/${inserted.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '儲存失敗')
      setSaving(false)
    }
  }

  function toggleTag(id: string) {
    setSelectedTags((prev) => prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id])
  }

  const ocrHasValues = ocrResult && Object.values(ocrResult).some(Boolean)

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100">
          ← {tc('back')}
        </button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('new')}</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Multi-photo upload */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{t('cardImages')}</h2>
            {files.length > 0 && files.length < 6 && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                + {t('uploadCard')}
              </button>
            )}
          </div>

          {/* Preloaded image from failed scan */}
          {preloadedCardUrl && (
            <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
              <p className="text-xs text-amber-700 dark:text-amber-400 mb-2 font-medium">
                📎 來自辨識失敗審查的名片圖片（儲存後自動關聯）
              </p>
              <div className="flex items-start gap-3">
                <div className="relative w-40 h-24 rounded-lg overflow-hidden border border-amber-200 dark:border-amber-700 shrink-0">
                  <Image src={preloadedCardUrl} alt="名片" fill className="object-cover" unoptimized />
                </div>
                {!ocring && ocrResult === null && (
                  <button
                    type="button"
                    onClick={handleOcrPreloaded}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    <Sparkles size={14} /> OCR 辨識此圖
                  </button>
                )}
              </div>
            </div>
          )}

          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFilesChange} />

          {files.length === 0 ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-6 text-center cursor-pointer hover:border-blue-400 transition-colors"
            >
              <div className="py-2 text-gray-400 dark:text-gray-500">
                <Upload size={28} className="mx-auto mb-2" />
                <p className="text-sm">{t('uploadCardHint')}</p>
                <p className="text-xs mt-1 text-gray-300 dark:text-gray-600">最多 6 張</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3 mb-3">
              {previews.map((src, i) => (
                <div key={i} className="relative group">
                  <div className="w-32 h-20 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={`card-${i + 1}`} className="object-cover w-full h-full" />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* OCR button for manually selected files */}
          {files.length > 0 && !ocring && ocrResult === null && (
            <button
              type="button"
              onClick={handleOcr}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Sparkles size={14} /> OCR 辨識（{files.length} 張）
            </button>
          )}
          {ocring && (
            <div className="flex items-center gap-2 text-sm text-blue-500">
              <Loader2 size={14} className="animate-spin" /> AI 辨識中...
            </div>
          )}
        </div>

        {/* OCR comparison panel */}
        {ocrResult !== null && (
          <div className="bg-white dark:bg-gray-900 border border-blue-200 dark:border-blue-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3 bg-blue-50 dark:bg-blue-950/40 border-b border-blue-200 dark:border-blue-800 flex items-center justify-between">
              <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">OCR 辨識結果確認</span>
              <button type="button" onClick={() => setOcrResult(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 divide-y sm:divide-y-0 sm:divide-x divide-gray-100 dark:divide-gray-800">
              {/* Left: thumbnails */}
              <div className="p-4">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">已上傳名片（{files.length} 張）</p>
                <div className="flex flex-wrap gap-2">
                  {previews.map((src, i) => (
                    <div key={i} className="w-28 h-18 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt={`card-${i + 1}`} className="object-cover w-full h-full" style={{ height: '4.5rem' }} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Right: OCR fields */}
              <div className="p-4">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">辨識欄位</p>
                {ocrHasValues ? (
                  <div className="space-y-1.5">
                    {(Object.keys(FIELD_LABELS) as (keyof OcrFields)[]).map((field) => {
                      const val = ocrResult[field]
                      if (!val) return null
                      return (
                        <div key={field} className="flex gap-2 text-sm">
                          <span className="text-gray-400 dark:text-gray-500 w-24 shrink-0 text-xs pt-0.5">{FIELD_LABELS[field]}</span>
                          <span className="text-gray-900 dark:text-gray-100 text-xs">{val}</span>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">未辨識到任何欄位</p>
                )}
              </div>
            </div>

            <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800 flex gap-2">
              <button
                type="button"
                onClick={applyOcr}
                disabled={!ocrHasValues}
                className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40"
              >
                <Check size={14} /> 套用到表單
              </button>
              <button
                type="button"
                onClick={() => setOcrResult(null)}
                className="px-4 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                忽略
              </button>
            </div>
          </div>
        )}

        {/* Duplicate warning */}
        {(dupExact || dupSimilar.length > 0) && (
          <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 space-y-1">
            {dupExact && (
              <div className="flex items-start gap-2 text-sm text-yellow-800 dark:text-yellow-300">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <span>{t('duplicate.exactEmail', { name: dupExact.name, company: dupExact.company ?? '' })}</span>
              </div>
            )}
            {dupSimilar.map((d) => (
              <div key={d.id} className="flex items-start gap-2 text-sm text-yellow-700 dark:text-yellow-400">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <span>{t('duplicate.similar', { name: d.name, company: d.company ?? '' })}</span>
              </div>
            ))}
          </div>
        )}

        {/* Basic info */}
        <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{t('sectionBasic')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label={t('name')} value={form.name} onChange={(v) => set('name', v)} onBlur={checkDup} />
            <Field label={t('nameEn')} value={form.name_en} onChange={(v) => set('name_en', v)} />
            <Field label={t('nameLocal')} value={form.name_local} onChange={(v) => set('name_local', v)} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label={t('company')} value={form.company} onChange={(v) => set('company', v)} />
            <Field label={t('companyEn')} value={form.company_en} onChange={(v) => set('company_en', v)} />
            <Field label={t('companyLocal')} value={form.company_local} onChange={(v) => set('company_local', v)} />
          </div>
          <Field label={t('jobTitle')} value={form.job_title} onChange={(v) => set('job_title', v)} />
          <div>
            <label className={labelClass}>{t('importance')}</label>
            <div className="flex gap-2">
              {(['high', 'medium', 'low'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => set('importance', v)}
                  className={`flex-1 py-1.5 text-sm rounded-lg border transition-colors ${
                    form.importance === v
                      ? 'bg-green-500 border-green-500 text-white'
                      : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  {v === 'high' ? 'H' : v === 'low' ? 'L' : 'M'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={labelClass}>{t('language')}</label>
            <select
              value={form.language}
              onChange={(e) => set('language', e.target.value)}
              className={inputClass}
            >
              <option value="chinese">{t('languageChinese')}</option>
              <option value="english">{t('languageEnglish')}</option>
              <option value="japanese">{t('languageJapanese')}</option>
            </select>
          </div>
        </section>

        {/* Contact info */}
        <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{t('sectionContact')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Email" value={form.email} onChange={(v) => set('email', v)} onBlur={checkDup} type="email" />
            <Field label={t('secondEmail')} value={form.second_email} onChange={(v) => set('second_email', v)} type="email" />
            <Field label={t('phone')} value={form.phone} onChange={(v) => set('phone', v)} type="tel" />
            <Field label={t('secondPhone')} value={form.second_phone} onChange={(v) => set('second_phone', v)} type="tel" />
          </div>
          <Field label={t('address')} value={form.address} onChange={(v) => set('address', v)} />
          <Field label={t('hospital')} value={form.hospital} onChange={(v) => set('hospital', v)} />
          <Field label={t('department')} value={form.department} onChange={(v) => set('department', v)} />
          <Field label={t('website')} value={form.website} onChange={(v) => set('website', v)} />
          <div>
            <label className={labelClass}>{t('country')}</label>
            <select
              value={form.country_code}
              onChange={(e) => set('country_code', e.target.value)}
              className={inputClass}
            >
              <option value="">—</option>
              {allCountries.map((c) => (
                <option key={c.code} value={c.code}>{c.emoji} {c.name_zh}</option>
              ))}
            </select>
          </div>
        </section>

        {/* Social */}
        <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{t('sectionSocial')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="LinkedIn" value={form.linkedin_url} onChange={(v) => set('linkedin_url', v)} />
            <Field label="Facebook" value={form.facebook_url} onChange={(v) => set('facebook_url', v)} />
          </div>
        </section>

        {/* Notes */}
        <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{t('sectionNotes')}</h2>
          <div>
            <label className={labelClass}>{t('notes')}</label>
            <textarea
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              rows={3}
              className={inputClass + ' resize-none'}
            />
          </div>
        </section>

        {/* Met section */}
        <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{t('sectionMet')}</h2>
          <Field label={t('metAt')} value={form.met_at} onChange={(v) => set('met_at', v)} />
          <div>
            <label className={labelClass}>{t('metDate')}</label>
            <input type="date" value={form.met_date} onChange={(e) => set('met_date', e.target.value)} className={inputClass} />
          </div>
          <Field label={t('referredBy')} value={form.referred_by} onChange={(v) => set('referred_by', v)} />
        </section>

        {/* Tags */}
        <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">{t('tags')}</h2>
          <div className="flex flex-wrap gap-2">
            {allTags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggleTag(tag.id)}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                  selectedTags.includes(tag.id)
                    ? 'bg-blue-500 border-blue-500 text-white'
                    : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-blue-300'
                }`}
              >
                {tag.name}
              </button>
            ))}
            {allTags.length === 0 && <p className="text-xs text-gray-400">{t('noTags')}</p>}
          </div>
        </section>

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">
            <X size={16} />
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving || ocring}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {tc('save')}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-5 py-2 text-sm text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            {tc('cancel')}
          </button>
        </div>
      </form>
    </div>
  )
}
