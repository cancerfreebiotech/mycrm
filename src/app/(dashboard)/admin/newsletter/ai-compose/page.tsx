'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { PermissionGate } from '@/components/PermissionGate'
import { Loader2, Sparkles, Plus, X, ImageIcon, ArrowLeft, Wand2, CheckCircle2, AlertTriangle, Link as LinkIcon } from 'lucide-react'

interface StoryInput {
  title_zh: string
  outline_zh: string
  image_url: string
  links: { url: string; label: string }[]
}

function emptyStory(): StoryInput {
  return { title_zh: '', outline_zh: '', image_url: '', links: [] }
}

function defaultPeriod(): string {
  const now = new Date()
  // Next month by default (you're usually preparing ahead)
  const target = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}`
}

export default function AiComposePage() {
  const router = useRouter()
  const t = useTranslations('newsletter')
  const supabase = createBrowserSupabaseClient()
  const [period, setPeriod] = useState(defaultPeriod())
  const [intro, setIntro] = useState('')
  const [stories, setStories] = useState<StoryInput[]>([emptyStory()])
  const [translate, setTranslate] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null)
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)
  const imageInputs = useRef<(HTMLInputElement | null)[]>([])

  function updateStory(i: number, patch: Partial<StoryInput>) {
    setStories((prev) => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s))
  }
  function addStory() { setStories((prev) => [...prev, emptyStory()]) }
  function removeStory(i: number) { setStories((prev) => prev.filter((_, idx) => idx !== i)) }

  function addLink(i: number) {
    setStories((prev) => prev.map((s, idx) => idx === i ? { ...s, links: [...s.links, { url: '', label: '' }] } : s))
  }
  function updateLink(i: number, linkIdx: number, patch: Partial<{ url: string; label: string }>) {
    setStories((prev) => prev.map((s, idx) => idx === i
      ? { ...s, links: s.links.map((l, li) => li === linkIdx ? { ...l, ...patch } : l) }
      : s))
  }
  function removeLink(i: number, linkIdx: number) {
    setStories((prev) => prev.map((s, idx) => idx === i
      ? { ...s, links: s.links.filter((_, li) => li !== linkIdx) }
      : s))
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>, storyIdx: number) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setBanner({ kind: 'err', msg: t('aiErrorImageOnly') })
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setBanner({ kind: 'err', msg: t('aiErrorImageTooLarge') })
      return
    }
    setUploadingIdx(storyIdx)
    setBanner(null)
    try {
      const dot = file.name.lastIndexOf('.')
      const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : ''
      const base = dot >= 0 ? file.name.slice(0, dot) : file.name
      const cleaned = base.replace(/[()（）【】\s]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
      // eslint-disable-next-line no-control-regex
      const safe = /[^\x00-\x7F]/.test(cleaned)
        ? `asset-${Date.now().toString(36)}${ext}`
        : `${cleaned}-${Date.now().toString(36)}${ext}`
      const path = `${period}/${safe}`
      const { error: upErr } = await supabase.storage.from('newsletter-assets').upload(path, file, { contentType: file.type })
      if (upErr) throw upErr
      const { data: pub } = supabase.storage.from('newsletter-assets').getPublicUrl(path)
      updateStory(storyIdx, { image_url: pub.publicUrl })
      setBanner({ kind: 'ok', msg: t('aiImageUploaded', { name: safe }) })
    } catch (e) {
      setBanner({ kind: 'err', msg: e instanceof Error ? e.message : t('aiErrorImageUploadFailed') })
    } finally {
      setUploadingIdx(null)
      const input = imageInputs.current[storyIdx]
      if (input) input.value = ''
    }
  }

  async function generate() {
    if (stories.some((s) => !s.title_zh.trim() || !s.outline_zh.trim())) {
      setBanner({ kind: 'err', msg: t('aiErrorStoryRequired') })
      return
    }
    setGenerating(true)
    setBanner(null)
    try {
      const res = await fetch('/api/newsletter/ai-compose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          period,
          intro_zh: intro,
          stories: stories.map((s) => ({
            title_zh: s.title_zh,
            outline_zh: s.outline_zh,
            image_url: s.image_url || undefined,
            links: s.links.filter((l) => l.url && l.label),
          })),
          translate,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? t('aiErrorGenerateFailed'))

      const results = data.results as { lang: string; id: string; error?: string }[]
      const zhResult = results.find((r) => r.lang === 'zh-TW')
      const failed = results.filter((r) => r.error)
      if (failed.length > 0) {
        setBanner({ kind: 'err', msg: t('aiErrorPartialFailed', { detail: failed.map((f) => `${f.lang}: ${f.error}`).join(', ') }) })
      }
      if (zhResult?.id) {
        router.push(`/admin/newsletter/quick-send/${zhResult.id}`)
      }
    } catch (e) {
      setBanner({ kind: 'err', msg: e instanceof Error ? e.message : t('aiErrorGenerateFailed') })
    } finally { setGenerating(false) }
  }

  return (
    <PermissionGate feature="newsletter">
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/admin/newsletter/campaigns" className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
            <ArrowLeft size={18} />
          </Link>
          <Wand2 size={22} className="text-purple-500" />
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t('aiPageTitle')}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {t('aiPageDesc')}
            </p>
          </div>
        </div>

        {banner && (
          <div className={`mb-4 px-4 py-3 rounded-lg text-sm flex items-start gap-2 ${
            banner.kind === 'ok'
              ? 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800'
              : 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'
          }`}>
            {banner.kind === 'ok' ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
            <span>{banner.msg}</span>
          </div>
        )}

        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5 space-y-4 mb-6">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('aiPeriodLabel')}</label>
              <input
                type="text"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                placeholder="2026-05"
                pattern="\d{4}-\d{2}"
                className="w-full text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 dark:text-gray-300">
                <input type="checkbox" checked={translate} onChange={(e) => setTranslate(e.target.checked)} />
                {t('aiTranslateLabel')}
              </label>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('aiIntroLabel')}</label>
            <textarea
              value={intro}
              onChange={(e) => setIntro(e.target.value)}
              rows={3}
              placeholder={t('aiIntroPlaceholder')}
              className="w-full text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
            />
            <p className="text-xs text-gray-400 mt-1">{t('aiIntroHint')}</p>
          </div>
        </div>

        <div className="space-y-4 mb-6">
          {stories.map((s, i) => (
            <div key={i} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 text-xs font-bold mr-2">{i + 1}</span>
                  {t('aiStorySection')}
                </h3>
                {stories.length > 1 && (
                  <button onClick={() => removeStory(i)} className="text-gray-400 hover:text-red-500" title={t('aiRemove')}><X size={16} /></button>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('aiStoryTitleLabel')}</label>
                <input
                  type="text"
                  value={s.title_zh}
                  onChange={(e) => updateStory(i, { title_zh: e.target.value })}
                  placeholder={t('aiStoryTitlePlaceholder')}
                  className="w-full text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('aiOutlineLabel')}</label>
                <textarea
                  value={s.outline_zh}
                  onChange={(e) => updateStory(i, { outline_zh: e.target.value })}
                  rows={5}
                  placeholder={t('aiOutlinePlaceholder')}
                  className="w-full text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('aiImageLabel')}</label>
                {s.image_url ? (
                  <div className="flex items-center gap-2">
                    <img src={s.image_url} alt="" className="h-16 w-auto rounded border border-gray-200 dark:border-gray-700" />
                    <span className="text-xs text-gray-500 truncate flex-1">{s.image_url.split('/').pop()}</span>
                    <button onClick={() => updateStory(i, { image_url: '' })} className="text-xs text-red-500 hover:underline">{t('aiRemove')}</button>
                  </div>
                ) : (
                  <button
                    onClick={() => imageInputs.current[i]?.click()}
                    disabled={uploadingIdx === i}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                  >
                    {uploadingIdx === i ? <Loader2 size={12} className="animate-spin" /> : <ImageIcon size={12} />}
                    {t('aiUploadImage')}
                  </button>
                )}
                <input
                  ref={(el) => { imageInputs.current[i] = el }}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleImageUpload(e, i)}
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-gray-500">{t('aiLinksLabel')}</label>
                  <button onClick={() => addLink(i)} className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline">
                    <Plus size={11} /> {t('aiAddLink')}
                  </button>
                </div>
                {s.links.map((l, li) => (
                  <div key={li} className="flex items-center gap-2 mb-1">
                    <LinkIcon size={12} className="text-gray-400 shrink-0" />
                    <input
                      type="text"
                      value={l.label}
                      onChange={(e) => updateLink(i, li, { label: e.target.value })}
                      placeholder={t('aiLinkLabelPlaceholder')}
                      className="text-xs px-2 py-1 border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 w-32"
                    />
                    <input
                      type="url"
                      value={l.url}
                      onChange={(e) => updateLink(i, li, { url: e.target.value })}
                      placeholder="https://..."
                      className="flex-1 text-xs px-2 py-1 border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800"
                    />
                    <button onClick={() => removeLink(i, li)} className="text-gray-400 hover:text-red-500"><X size={12} /></button>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <button
            onClick={addStory}
            className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl text-sm text-gray-500 dark:text-gray-400 hover:border-purple-400 hover:text-purple-600 dark:hover:text-purple-400"
          >
            <Plus size={14} /> {t('aiAddStory')}
          </button>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {translate ? t('aiGenerateHintMulti') : t('aiGenerateHintZhOnly')}
          </p>
          <button
            onClick={generate}
            disabled={generating || stories.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 font-medium"
          >
            {generating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {generating ? t('aiGenerating') : t('aiGenerateButton')}
          </button>
        </div>
      </div>
    </PermissionGate>
  )
}
