'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { Upload, Loader2, AlertTriangle, X } from 'lucide-react'

interface Tag { id: string; name: string }
interface DupContact { id: string; name: string; company: string | null }

const EMPTY_FORM = { name: '', company: '', job_title: '', email: '', phone: '' }

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
  const [geminiModel, setGeminiModel] = useState('gemini-2.5-flash')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const [{ data: tags }, { data: profile }] = await Promise.all([
        supabase.from('tags').select('id, name').order('name'),
        supabase.from('users').select('gemini_model').eq('email', user.email!).single(),
      ])
      setAllTags(tags ?? [])
      if (profile?.gemini_model) setGeminiModel(profile.gemini_model)
    }
    init()
  }, [])

  function set(field: keyof typeof EMPTY_FORM, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  // Duplicate check on email/name blur
  async function checkDup() {
    if (!form.email && !form.name) return
    const res = await fetch('/api/ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ check_dup: true, email: form.email, name: form.name }),
    })
    // Use supabase directly for dup check
    const sb = supabase
    let exact: DupContact | null = null
    if (form.email) {
      const { data } = await sb.from('contacts').select('id, name, company').eq('email', form.email).maybeSingle()
      exact = data ?? null
    }
    setDupExact(exact)

    if (form.name) {
      const { data } = await sb.rpc('find_similar_contacts', { input_name: form.name, threshold: 0.6 })
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
      // Auto OCR
      setOcring(true)
      try {
        const res = await fetch('/api/ocr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64, model: geminiModel }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        setForm((prev) => ({
          name: data.name || prev.name,
          company: data.company || prev.company,
          job_title: data.job_title || prev.job_title,
          email: data.email || prev.email,
          phone: data.phone || prev.phone,
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
        const { error: uploadErr } = await supabase.storage
          .from('cards')
          .upload(`cards/${filename}`, buf, { contentType: 'image/jpeg' })
        if (!uploadErr) {
          const { data: urlData } = supabase.storage.from('cards').getPublicUrl(`cards/${filename}`)
          card_img_url = urlData.publicUrl
        }
      }

      const { data: inserted, error: insertErr } = await supabase
        .from('contacts')
        .insert({ ...form, card_img_url, created_by: profile.id })
        .select('id')
        .single()
      if (insertErr || !inserted) throw insertErr

      // Save tags
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

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100">
          ← 返回
        </button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">新增聯絡人</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
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
          {imagePreview && !ocring && (
            <p className="text-xs text-gray-400 mt-2">點擊重新上傳</p>
          )}
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

        {/* Form fields */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5 space-y-4">
          {[
            { label: '姓名', field: 'name' as const },
            { label: '公司', field: 'company' as const },
            { label: '職稱', field: 'job_title' as const },
            { label: 'Email', field: 'email' as const, type: 'email' },
            { label: '電話', field: 'phone' as const, type: 'tel' },
          ].map(({ label, field, type }) => (
            <div key={field}>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
              <input
                type={type ?? 'text'}
                value={form[field]}
                onChange={(e) => set(field, e.target.value)}
                onBlur={checkDup}
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          ))}

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tags</label>
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
          </div>
        </div>

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
