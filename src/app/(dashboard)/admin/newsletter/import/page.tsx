'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
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

export default function NewsletterImportPage() {
  const router = useRouter()
  const fileInput = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<{ msg: string; details?: string[] } | null>(null)

  function pickFile(picked: File | null | undefined) {
    setError(null)
    setResult(null)
    if (!picked) return
    if (!picked.name.toLowerCase().endsWith('.zip')) {
      setError({ msg: '只接受 .zip 檔（newsletter-composer skill 輸出）' })
      return
    }
    if (picked.size > 30 * 1024 * 1024) {
      setError({ msg: 'zip 超過 30MB 上限' })
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
    setSubmitting(true)
    setError(null)
    setResult(null)
    try {
      const fd = new FormData()
      fd.append('zip', file)
      const res = await fetch('/api/newsletter/import', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) {
        setError({ msg: data.error ?? '匯入失敗', details: Array.isArray(data.details) ? data.details : undefined })
        return
      }
      setResult(data as ImportResult)
    } catch (e) {
      setError({ msg: e instanceof Error ? e.message : '匯入失敗' })
    } finally {
      setSubmitting(false)
    }
  }

  function reset() {
    setFile(null)
    setResult(null)
    setError(null)
    if (fileInput.current) fileInput.current.value = ''
  }

  const zhCampaign = result?.campaigns.find((c) => c.lang === 'zh-TW' && !c.error)

  return (
    <PermissionGate feature="newsletter">
      <div className="p-6 max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/admin/newsletter/campaigns" className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
            <ArrowLeft size={18} />
          </Link>
          <Package size={22} className="text-teal-500" />
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">從 Skill 匯入電子報</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              上傳 Claude.ai newsletter-composer skill 產出的 zip → 自動建 3 語草稿
            </p>
          </div>
        </div>

        {!result && (
          <>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
              onDragLeave={() => setDragActive(false)}
              onDrop={onDrop}
              onClick={() => fileInput.current?.click()}
              className={`cursor-pointer rounded-xl border-2 border-dashed transition-colors p-8 text-center ${
                dragActive
                  ? 'border-teal-500 bg-teal-50 dark:bg-teal-950/30'
                  : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-gray-400 dark:hover:border-gray-600'
              }`}
            >
              {file ? (
                <div className="flex flex-col items-center gap-3">
                  <FileArchive size={40} className="text-teal-500" />
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{file.name}</div>
                  <div className="text-xs text-gray-500">{(file.size / 1024).toFixed(1)} KB</div>
                  <button
                    onClick={(e) => { e.stopPropagation(); reset() }}
                    className="text-xs text-red-500 hover:underline"
                  >
                    換一個
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <Upload size={32} className="text-gray-400" />
                  <div className="text-sm text-gray-700 dark:text-gray-300">
                    拖放 zip 到這裡，或點擊選擇檔案
                  </div>
                  <div className="text-xs text-gray-400">
                    來源：Claude.ai 的 newsletter-composer skill 月底打包輸出
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
                disabled={!file || submitting}
                className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 disabled:opacity-50"
              >
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <Package size={14} />}
                匯入並建立草稿
              </button>
            </div>

            <div className="mt-8 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg text-xs text-gray-500 dark:text-gray-400">
              <div className="font-medium text-gray-700 dark:text-gray-300 mb-2">zip 內容應為：</div>
              <pre className="font-mono text-[11px]">{`newsletter-YYYY-MM.zip
├── manifest.json
└── images/
    ├── 01-event-slug.jpg
    └── ...`}</pre>
              <div className="mt-2">完整 schema：<code className="text-[11px]">skills/newsletter-composer/manifest-schema.json</code></div>
            </div>
          </>
        )}

        {result && (
          <div className="space-y-4">
            <div className="px-4 py-3 rounded-lg text-sm bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800 flex items-start gap-2">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
              <div>
                <div className="font-medium">匯入完成 — {result.period}</div>
                <div className="text-xs mt-0.5">{result.story_count} 則故事，{result.image_count} 張圖片</div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
                    <th className="text-left px-4 py-2 font-medium text-gray-600 dark:text-gray-400">語言</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600 dark:text-gray-400">狀態</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600 dark:text-gray-400">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {result.campaigns.map((c) => (
                    <tr key={c.lang} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
                      <td className="px-4 py-3">{LANG_LABEL[c.lang] ?? c.lang}</td>
                      <td className="px-4 py-3">
                        {c.error ? (
                          <span className="text-xs text-red-600 dark:text-red-400">失敗：{c.error}</span>
                        ) : (
                          <span className="text-xs text-green-600 dark:text-green-400">已建立草稿</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {c.id && (
                          <Link
                            href={`/admin/newsletter/quick-send/${c.id}`}
                            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            編輯與寄發 →
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
                再匯入一份
              </button>
              {zhCampaign && (
                <button
                  onClick={() => router.push(`/admin/newsletter/quick-send/${zhCampaign.id}`)}
                  className="px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700"
                >
                  打開中文版編輯
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </PermissionGate>
  )
}
