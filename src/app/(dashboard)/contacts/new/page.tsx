'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { Upload, Loader2, AlertTriangle, X } from 'lucide-react'

interface Tag { id: string; name: string }
interface DupContact { id: string; name: string; company: string | null }

const EMPTY_FORM = {
  name: '', name_en: '', name_local: '',
  company: '', company_en: '', company_local: '',
  job_title: '',
  email: '', second_email: '',
  phone: '', second_phone: '',
  address: '', website: '',
  linkedin_url: '', facebook_url: '',
  notes: '',
}

export default function NewContactPage() {
  const router = useRouter()
  const supabase = createBrowserSupabaseClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState(EMPTY_FORM)
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageBase64, setImageBase64] = useState<string | null>(null)
  const [ocring, setOcring] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dupExact, setDupExact] = useState<DupContact | null>(null)
  const [dupSimilar, setDupSimilar] = useState<DupContact[]>([])
  const [aiModelId, setAiModelId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const [{ data: tags }, { data: profile }] = await Promise.all([
        supabase.from('tags').select('id, name').order('name'),
        supabase.from('users').select('ai_model_id').eq('email', user.email!).single(),
      ])
      setAllTags(tags ?? [])
      if (profile?.ai_model_id) setAiModelId(profile.ai_model_id)
    }
    init()
  }, [])

  function set(field: keyof typeof EMPTY_FORM, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function checkDup() {
    if (!form.email && !form.name) return
    let exact: DupContact | null = null
    if (form.email) {
      const { data } = await supabase.from('contacts').select('id, name, company').eq('email', form.email).maybeSingle()
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

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string
      setImagePreview(dataUrl)
      const base64 = dataUrl.split(',')[1]
      setImageBase64(base64)
      setOcring(true)
      try {
        const res = await fetch('/api/ocr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64, model: aiModelId }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        setForm((prev) => ({
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
      } catch (err) {
        setError(err instanceof Error ? err.message : '辨識失敗')
      } finally {
        setOcring(false)
      }
    }
    reader.readAsDataURL(file)
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

      let card_img_url: string | null = null
      if (imageBase64) {
        const buf = Uint8Array.from(atob(imageBase64), (c) => c.charCodeAt(0))
        const filename = `web_${Date.now()}.jpg`
        const storagePath = `cards/${filename}`
        const { error: uploadErr } = await supabase.storage
          .from('cards')
          .upload(storagePath, buf, { contentType: 'image/jpeg' })
        if (!uploadErr) {
          const { data: urlData } = supabase.storage.from('cards').getPublicUrl(storagePath)
          card_img_url = urlData.publicUrl
        }
      }

      const payload = Object.fromEntries(
        Object.entries(form).map(([k, v]) => [k, v.trim() || null])
      )

      const { data: inserted, error: insertErr } = await supabase
        .from('contacts')
        .insert({ ...payload, card_img_url, created_by: profile.id })
        .select('id')
        .single()
      if (insertErr || !inserted) throw insertErr

      if (selectedTags.length > 0) {
        await supabase.from('contact_tags').insert(
          selectedTags.map((tag_id) => ({ contact_id: inserted.id, tag_id }))
        )
      }

      router.push(`/contacts/${inserted.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '儲存失敗')
      setSaving(false)
    }
  }

  function toggleTag(id: string) {
    setSelectedTags((prev) => prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id])
  }

  const inputClass = 'w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500'
  const labelClass = 'block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1'

  function Field({ label, field, type }: { label: string; field: keyof typeof EMPTY_FORM; type?: string }) {
    return (
      <div>
        <label className={labelClass}>{label}</label>
        <input
          type={type ?? 'text'}
          value={form[field]}
          onChange={(e) => set(field, e.target.value)}
          onBlur={['email', 'name'].includes(field) ? checkDup : undefined}
          className={inputClass}
        />
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100">
          ← 返回
        </button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">新增聯絡人</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Photo upload */}
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-6 text-center cursor-pointer hover:border-blue-400 transition-colors"
        >
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
          {imagePreview ? (
            <div className="relative inline-block">
              <img src={imagePreview} alt="名片預覽" className="max-h-40 rounded-lg object-contain mx-auto" />
              {ocring && (
                <div className="absolute inset-0 bg-white/70 dark:bg-black/50 flex items-center justify-center rounded-lg">
                  <Loader2 size={24} className="animate-spin text-blue-500" />
                </div>
              )}
            </div>
          ) : (
            <div className="py-4 text-gray-400 dark:text-gray-500">
              <Upload size={32} className="mx-auto mb-2" />
              <p className="text-sm">點擊上傳名片照片（自動 AI 辨識）</p>
            </div>
          )}
          {imagePreview && !ocring && <p className="text-xs text-gray-400 mt-2">點擊重新上傳</p>}
        </div>

        {/* Duplicate warning */}
        {(dupExact || dupSimilar.length > 0) && (
          <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 space-y-1">
            {dupExact && (
              <div className="flex items-start gap-2 text-sm text-yellow-800 dark:text-yellow-300">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <span>此 email 已有聯絡人：<strong>{dupExact.name}</strong>（{dupExact.company}）</span>
              </div>
            )}
            {dupSimilar.map((d) => (
              <div key={d.id} className="flex items-start gap-2 text-sm text-yellow-700 dark:text-yellow-400">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <span>系統有相似聯絡人：<strong>{d.name}</strong>（{d.company}）</span>
              </div>
            ))}
          </div>
        )}

        {/* Basic info */}
        <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">基本資訊</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="姓名（主要）" field="name" />
            <Field label="英文姓名" field="name_en" />
            <Field label="當地語言姓名" field="name_local" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="公司（主要）" field="company" />
            <Field label="英文公司名" field="company_en" />
            <Field label="當地語言公司名" field="company_local" />
          </div>
          <Field label="職稱" field="job_title" />
        </section>

        {/* Contact info */}
        <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">聯絡方式</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Email" field="email" type="email" />
            <Field label="第二 Email" field="second_email" type="email" />
            <Field label="電話" field="phone" type="tel" />
            <Field label="第二電話" field="second_phone" type="tel" />
          </div>
          <Field label="地址" field="address" />
          <Field label="網站" field="website" type="url" />
        </section>

        {/* Social */}
        <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">社群連結</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="LinkedIn" field="linkedin_url" type="url" />
            <Field label="Facebook" field="facebook_url" type="url" />
          </div>
        </section>

        {/* Notes */}
        <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">備註</h2>
          <div>
            <label className={labelClass}>備註</label>
            <textarea
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              rows={3}
              className={inputClass + ' resize-none'}
            />
          </div>
        </section>

        {/* Tags */}
        <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Tags</h2>
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
            {allTags.length === 0 && <p className="text-xs text-gray-400">尚無 Tags，請先至 Tag 管理新增</p>}
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
            儲存
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-5 py-2 text-sm text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            取消
          </button>
        </div>
      </form>
    </div>
  )
}
