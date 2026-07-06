'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import JSZip from 'jszip'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { fetchOrgId, withOrgPrefix } from '@/lib/orgUploadPrefix'
import { PermissionGate } from '@/components/PermissionGate'
import { ArrowLeft, Upload, Package, AlertTriangle, CheckCircle2, Loader2, FileArchive } from 'lucide-react'

interface ImportResult {
  period: string
  image_count: number
  story_count: number
  campaigns: { lang: string; id: string; slug: string; error?: string }[]
}

const LANG_LABEL: Record<string, string> = {
  'zh-TW': '中文',
  'en': 'English',
  'ja': '日本語',
}

// Detect single common root folder in zip and return its prefix (with trailing slash)
// e.g. ['newsletter-2026-05/manifest.json', 'newsletter-2026-05/images/x.jpg'] → 'newsletter-2026-05/'
// Returns '' if files are at root.
function detectRootPrefix(zip: JSZip): string {
  const paths: string[] = []
  zip.forEach((rel) => paths.push(rel))
  if (paths.length === 0) return ''
  const firstSegments = new Set<string>()
  for (const p of paths) {
    const slash = p.indexOf('/')
    if (slash < 0) {
      firstSegments.add('')  // file at root
    } else {
      firstSegments.add(p.slice(0, slash))
    }
  }
  if (firstSegments.size === 1) {
    const only = [...firstSegments][0]
    if (only !== '') return `${only}/`
  }
  return ''
}

function normalizeImageFile(f: string): string {
  const stripped = f.replace(/^\.?\/?(images\/)?/, '')
  return `images/${stripped}`
}

function contentTypeFromName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  return 'image/jpeg'
}

export default function NewsletterImportPage() {
  const t = useTranslations('newsletterImport')
  const router = useRouter()
  const fileInput = useRef<HTMLInputElement>(null)
  const supabase = createBrowserSupabaseClient()
  const [file, setFile] = useState<File | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'parsing' | 'uploading' | 'submitting'>('idle')
  const [progress, setProgress] = useState<{ done: number; total: number; current?: string }>({ done: 0, total: 0 })
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<{ msg: string; details?: string[] } | null>(null)

  function pickFile(picked: File | null | undefined) {
    setError(null)
    setResult(null)
    if (!picked) return
    if (!picked.name.toLowerCase().endsWith('.zip')) {
      setError({ msg: t('errorOnlyZip') })
      return
    }
    if (picked.size > 200 * 1024 * 1024) {
      setError({ msg: t('errorZipTooLarge') })
      return
    }
    setFile(picked)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragActive(false)
    pickFile(e.dataTransfer.files?.[0])
  }

  async function submit() {
    if (!file) return
    setError(null)
    setResult(null)

    try {
      // Phase 1: parse zip in browser
      setPhase('parsing')
      const zip = await JSZip.loadAsync(await file.arrayBuffer())
      const prefix = detectRootPrefix(zip)
      const manifestEntry = zip.file(`${prefix}manifest.json`)
      if (!manifestEntry) {
        setError({ msg: t('errorManifestNotFound', { path: `${prefix || '(root)'}manifest.json` }) })
        setPhase('idle')
        return
      }
      let manifest: Record<string, unknown>
      try {
        manifest = JSON.parse(await manifestEntry.async('string'))
      } catch (e) {
        setError({ msg: t('errorManifestParse', { detail: e instanceof Error ? e.message : String(e) }) })
        setPhase('idle')
        return
      }

      // Collect all referenced image_files (after normalization to images/X)
      const stories = collectStories(manifest)
      const referenced = new Set<string>()
      for (const s of stories) {
        if (Array.isArray(s.image_files)) {
          for (const f of s.image_files) {
            if (typeof f === 'string') referenced.add(normalizeImageFile(f))
          }
        }
      }

      // Phase 2: upload each image directly to Supabase Storage
      setPhase('uploading')
      setProgress({ done: 0, total: referenced.size })
      const period = typeof manifest.period === 'string' ? manifest.period : 'unknown-period'
      const stamp = Date.now().toString(36)
      const imageMap: Record<string, string> = {}
      // v8.0 Task 182 — org 前綴（取一次；取不到則退回無前綴，上傳不壞）
      const orgId = await fetchOrgId()

      let i = 0
      for (const refPath of referenced) {
        i++
        // Try multiple candidate paths in zip (with prefix, w/o, with images/, w/o)
        const baseFilename = refPath.replace(/^images\//, '')
        const candidates = [
          `${prefix}${refPath}`,                   // newsletter-2026-05/images/X
          `${prefix}${baseFilename}`,              // newsletter-2026-05/X
          refPath,                                 // images/X
          baseFilename,                            // X
        ]
        const entry = candidates.map((p) => zip.file(p)).find((e) => e)
        if (!entry) {
          throw new Error(t('errorImageNotFound', { image: refPath, tried: candidates.join(', ') }))
        }
        setProgress({ done: i - 1, total: referenced.size, current: baseFilename })
        const buf = await entry.async('uint8array')
        const storagePath = withOrgPrefix(orgId, `${period}/imported/${stamp}-${baseFilename.toLowerCase()}`)
        const { error: upErr } = await supabase.storage
          .from('newsletter-assets')
          .upload(storagePath, buf, { contentType: contentTypeFromName(baseFilename), upsert: false })
        if (upErr) throw new Error(t('errorUploadFailed', { file: baseFilename, detail: upErr.message }))
        const { data: pub } = supabase.storage.from('newsletter-assets').getPublicUrl(storagePath)
        imageMap[refPath] = pub.publicUrl
      }
      setProgress({ done: referenced.size, total: referenced.size })

      // Phase 3: submit manifest + imageMap as JSON
      setPhase('submitting')
      const res = await fetch('/api/newsletter/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manifest, imageMap }),
      })
      const text = await res.text()
      let data: { error?: string; details?: string[] } & Partial<ImportResult>
      try {
        data = JSON.parse(text)
      } catch {
        setError({ msg: t('errorNonJson', { status: res.status }), details: [text.slice(0, 300)] })
        setPhase('idle')
        return
      }
      if (!res.ok) {
        setError({ msg: data.error ?? t('errorImportFailed'), details: Array.isArray(data.details) ? data.details : undefined })
        setPhase('idle')
        return
      }
      setResult(data as ImportResult)
      setPhase('idle')
    } catch (e) {
      setError({ msg: e instanceof Error ? e.message : t('errorImportFailed') })
      setPhase('idle')
    }
  }

  function reset() {
    setFile(null)
    setResult(null)
    setError(null)
    setProgress({ done: 0, total: 0 })
    setPhase('idle')
    if (fileInput.current) fileInput.current.value = ''
  }

  const zhCampaign = result?.campaigns.find((c) => c.lang === 'zh-TW' && !c.error)
  const busy = phase !== 'idle'

  return (
    <PermissionGate feature="newsletter">
      <div className="p-6 max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/admin/newsletter/campaigns" className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
            <ArrowLeft size={18} />
          </Link>
          <Package size={22} className="text-teal-500" />
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t('pageTitle')}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {t('pageDesc')}
            </p>
          </div>
        </div>

        {!result && (
          <>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
              onDragLeave={() => setDragActive(false)}
              onDrop={onDrop}
              onClick={() => !busy && fileInput.current?.click()}
              className={`cursor-pointer rounded-xl border-2 border-dashed transition-colors p-8 text-center ${
                dragActive
                  ? 'border-teal-500 bg-teal-50 dark:bg-teal-950/30'
                  : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-gray-400 dark:hover:border-gray-600'
              } ${busy ? 'opacity-60 pointer-events-none' : ''}`}
            >
              {file ? (
                <div className="flex flex-col items-center gap-3">
                  <FileArchive size={40} className="text-teal-500" />
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{file.name}</div>
                  <div className="text-xs text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</div>
                  {!busy && (
                    <button
                      onClick={(e) => { e.stopPropagation(); reset() }}
                      className="text-xs text-red-500 hover:underline"
                    >
                      {t('changeFile')}
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <Upload size={32} className="text-gray-400" />
                  <div className="text-sm text-gray-700 dark:text-gray-300">
                    {t('dropzoneHint')}
                  </div>
                  <div className="text-xs text-gray-400">
                    {t('dropzoneSource')}
                  </div>
                </div>
              )}
              <input
                ref={fileInput}
                type="file"
                accept=".zip"
                className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0])}
              />
            </div>

            {phase !== 'idle' && (
              <div className="mt-4 px-4 py-3 rounded-lg text-sm bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 flex items-center gap-2">
                <Loader2 size={16} className="animate-spin shrink-0" />
                <div className="flex-1">
                  {phase === 'parsing' && t('phaseParsing')}
                  {phase === 'uploading' && (
                    <span>
                      {t('phaseUploading', { done: progress.done, total: progress.total })}
                      {progress.current && <span className="text-blue-500"> · {progress.current}</span>}
                    </span>
                  )}
                  {phase === 'submitting' && t('phaseSubmitting')}
                </div>
              </div>
            )}

            {error && (
              <div className="mt-4 px-4 py-3 rounded-lg text-sm bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <div className="font-medium">{error.msg}</div>
                    {error.details && error.details.length > 0 && (
                      <ul className="mt-2 space-y-0.5 text-xs font-mono">
                        {error.details.map((d, i) => <li key={i}>• {d}</li>)}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="mt-4 flex justify-end">
              <button
                onClick={submit}
                disabled={!file || busy}
                className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 disabled:opacity-50"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Package size={14} />}
                {t('importButton')}
              </button>
            </div>

            <div className="mt-8 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg text-xs text-gray-500 dark:text-gray-400">
              <div className="font-medium text-gray-700 dark:text-gray-300 mb-2">{t('zipStructureLabel')}</div>
              <pre className="font-mono text-[11px]">{`newsletter-YYYY-MM.zip
├── manifest.json
└── images/
    ├── 01-event-slug.jpg
    └── ...`}</pre>
              <div className="mt-2">
                {t.rich('zipStructureNote', { code: (chunks) => <code>{chunks}</code> })}
              </div>
            </div>
          </>
        )}

        {result && (
          <div className="space-y-4">
            <div className="px-4 py-3 rounded-lg text-sm bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800 flex items-start gap-2">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
              <div>
                <div className="font-medium">{t('importDone', { period: result.period })}</div>
                <div className="text-xs mt-0.5">{t('importSummary', { stories: result.story_count, images: result.image_count })}</div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
                    <th className="text-left px-4 py-2 font-medium text-gray-600 dark:text-gray-400">{t('thLanguage')}</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600 dark:text-gray-400">{t('thStatus')}</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600 dark:text-gray-400">{t('thAction')}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.campaigns.map((c) => (
                    <tr key={c.lang} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
                      <td className="px-4 py-3">{LANG_LABEL[c.lang] ?? c.lang}</td>
                      <td className="px-4 py-3">
                        {c.error ? (
                          <span className="text-xs text-red-600 dark:text-red-400">{t('rowFailed', { error: c.error })}</span>
                        ) : (
                          <span className="text-xs text-green-600 dark:text-green-400">{t('rowCreated')}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {c.id && (
                          <Link
                            href={`/admin/newsletter/quick-send/${c.id}`}
                            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            {t('editAndSend')}
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={reset}
                className="px-4 py-2 text-sm border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                {t('importAnother')}
              </button>
              {zhCampaign && (
                <button
                  onClick={() => router.push(`/admin/newsletter/quick-send/${zhCampaign.id}`)}
                  className="px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700"
                >
                  {t('openZhEdit')}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </PermissionGate>
  )
}

interface RawStory {
  section?: unknown
  image_files?: unknown
  [k: string]: unknown
}

function collectStories(manifest: Record<string, unknown>): RawStory[] {
  const out: RawStory[] = []
  if (Array.isArray(manifest.stories)) {
    for (const s of manifest.stories) if (s && typeof s === 'object') out.push(s as RawStory)
  } else {
    if (Array.isArray(manifest.last_month)) {
      for (const s of manifest.last_month as unknown[]) if (s && typeof s === 'object') out.push(s as RawStory)
    }
    if (Array.isArray(manifest.next_month)) {
      for (const s of manifest.next_month as unknown[]) if (s && typeof s === 'object') out.push(s as RawStory)
    }
  }
  return out
}
