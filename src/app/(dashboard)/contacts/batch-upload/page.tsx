'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { Upload, Loader2, AlertTriangle, CheckCircle, X, Save } from 'lucide-react'

const MAX_FILES = 50
const CONCURRENCY = 5

interface RowData {
  file: File
  fileId: string
  status: 'pending' | 'processing' | 'done' | 'error'
  error?: string
  // OCR result fields
  name: string
  name_en: string
  name_local: string
  company: string
  company_en: string
  company_local: string
  job_title: string
  email: string
  second_email: string
  phone: string
  second_phone: string
  address: string
  website: string
  linkedin_url: string
  facebook_url: string
  // meta
  imgUrl: string | null
  storagePath: string | null
  dupType: 'none' | 'exact' | 'similar'
  dupName: string | null
  skip: boolean
}

function makeRow(file: File): RowData {
  return {
    file,
    fileId: `${file.name}_${file.size}_${Math.random()}`,
    status: 'pending',
    name: '', name_en: '', name_local: '',
    company: '', company_en: '', company_local: '',
    job_title: '', email: '', second_email: '',
    phone: '', second_phone: '',
    address: '', website: '', linkedin_url: '', facebook_url: '',
    imgUrl: null, storagePath: null,
    dupType: 'none', dupName: null,
    skip: false,
  }
}

export default function BatchUploadPage() {
  const router = useRouter()
  const t = useTranslations('batch')
  const tc = useTranslations('common')
  const supabase = createBrowserSupabaseClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [rows, setRows] = useState<RowData[]>([])
  const [processing, setProcessing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [aiModelId, setAiModelId] = useState<string | null>(null)
  const [saveResult, setSaveResult] = useState<{ saved: number; skipped: number } | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user?.email) return
      const { data: profile } = await supabase.from('users').select('id, ai_model_id').eq('email', user.email).single()
      if (profile) { setUserId(profile.id); setAiModelId(profile.ai_model_id ?? null) }
    })
  }, [])

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, MAX_FILES)
    setRows(files.map(makeRow))
    setSaveResult(null)
    if (e.target) e.target.value = ''
  }

  async function processAll() {
    if (rows.length === 0) return
    setProcessing(true)

    const queue = rows.map((_, i) => i)
    let idx = 0

    async function processOne(rowIdx: number) {
      setRows((prev) => prev.map((r, i) => i === rowIdx ? { ...r, status: 'processing' } : r))

      try {
        // Compress image before upload (max 1024px, JPEG 85%)
        const base64 = await compressImage(rows[rowIdx].file)

        // Upload image to storage
        const filename = `cards/batch_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`
        const buf = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
        const { error: uploadErr } = await supabase.storage.from('cards').upload(filename, buf, { contentType: 'image/jpeg' })
        if (uploadErr) throw new Error(uploadErr.message)

        const { data: urlData } = supabase.storage.from('cards').getPublicUrl(filename)
        const imgUrl = urlData.publicUrl

        // OCR
        const res = await fetch('/api/ocr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64, model: aiModelId }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'OCR 失敗')

        // Duplicate check
        let dupType: RowData['dupType'] = 'none'
        let dupName: string | null = null
        if (data.email) {
          const { data: exact } = await supabase.from('contacts').select('id, name').eq('email', data.email).maybeSingle()
          if (exact) { dupType = 'exact'; dupName = exact.name }
        }
        if (dupType === 'none' && data.name) {
          const { data: similar } = await supabase.rpc('find_similar_contacts', { input_name: data.name, threshold: 0.6 })
          if (similar && similar.length > 0) { dupType = 'similar'; dupName = similar[0].name }
        }

        setRows((prev) => prev.map((r, i) => i === rowIdx ? {
          ...r,
          status: 'done',
          name: data.name ?? '', name_en: data.name_en ?? '', name_local: data.name_local ?? '',
          company: data.company ?? '', company_en: data.company_en ?? '', company_local: data.company_local ?? '',
          job_title: data.job_title ?? '', email: data.email ?? '', second_email: data.second_email ?? '',
          phone: data.phone ?? '', second_phone: data.second_phone ?? '',
          address: data.address ?? '', website: data.website ?? '',
          linkedin_url: data.linkedin_url ?? '', facebook_url: data.facebook_url ?? '',
          imgUrl, storagePath: filename, dupType, dupName,
          skip: dupType === 'exact',
        } : r))
      } catch (err) {
        const msg = err instanceof Error ? err.message : '處理失敗'
        setRows((prev) => prev.map((r, i) => i === rowIdx ? { ...r, status: 'error', error: msg } : r))
      }
    }

    // Concurrency pool
    async function runPool() {
      const workers = Array.from({ length: CONCURRENCY }, async () => {
        while (idx < queue.length) {
          const rowIdx = queue[idx++]
          await processOne(rowIdx)
        }
      })
      await Promise.all(workers)
    }

    await runPool()
    setProcessing(false)
  }

  async function saveAll() {
    if (!userId) return
    setSaving(true)
    let saved = 0
    let skipped = 0

    for (const row of rows) {
      if (row.skip || row.status !== 'done') { skipped++; continue }

      const payload = {
        name: row.name || null, name_en: row.name_en || null, name_local: row.name_local || null,
        company: row.company || null, company_en: row.company_en || null, company_local: row.company_local || null,
        job_title: row.job_title || null, email: row.email || null, second_email: row.second_email || null,
        phone: row.phone || null, second_phone: row.second_phone || null,
        address: row.address || null, website: row.website || null,
        linkedin_url: row.linkedin_url || null, facebook_url: row.facebook_url || null,
        card_img_url: row.imgUrl,
        created_by: userId,
      }

      const { data: inserted } = await supabase.from('contacts').insert(payload).select('id').single()
      if (inserted) {
        // Add to contact_cards
        if (row.storagePath && row.imgUrl) {
          await supabase.from('contact_cards').insert({ contact_id: inserted.id, url: row.imgUrl, storage_path: row.storagePath, label: '正面' })
        }
        await supabase.from('interaction_logs').insert({ contact_id: inserted.id, type: 'note', content: '透過批次上傳新增名片', created_by: userId })
        saved++
      } else {
        skipped++
      }
    }

    setSaveResult({ saved, skipped })
    setSaving(false)
    setRows([])
  }

  function updateField(rowIdx: number, field: string, value: string) {
    setRows((prev) => prev.map((r, i) => i === rowIdx ? { ...r, [field]: value } : r))
  }

  function toggleSkip(rowIdx: number) {
    setRows((prev) => prev.map((r, i) => i === rowIdx ? { ...r, skip: !r.skip } : r))
  }

  const doneCount = rows.filter((r) => r.status === 'done').length
  const processedCount = rows.filter((r) => r.status !== 'pending').length
  const toSaveCount = rows.filter((r) => r.status === 'done' && !r.skip).length

  return (
    <div className="max-w-5xl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.push('/contacts')} className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100">
          ← {tc('back')}
        </button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('title')}</h1>
      </div>

      {saveResult && (
        <div className="mb-5 flex items-center gap-2 text-sm bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg px-4 py-3 text-green-700 dark:text-green-300">
          <CheckCircle size={16} />
          {t('saved', { saved: saveResult.saved, skipped: saveResult.skipped })}
          <button onClick={() => router.push('/contacts')} className="ml-auto underline">{t('goToList')}</button>
        </div>
      )}

      {/* File drop zone */}
      {rows.length === 0 && (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-12 text-center cursor-pointer hover:border-blue-400 transition-colors mb-5"
        >
          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileSelect} />
          <Upload size={40} className="mx-auto mb-3 text-gray-300 dark:text-gray-600" />
          <p className="text-gray-500 dark:text-gray-400">{t('dropzone', { max: MAX_FILES })}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{t('dropzoneHint')}</p>
        </div>
      )}

      {/* File count + start button */}
      {rows.length > 0 && !processing && doneCount === 0 && (
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">{t('selected', { count: rows.length })}</p>
          <div className="flex gap-2">
            <button
              onClick={() => { setRows([]); setSaveResult(null) }}
              className="px-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              {t('reselect')}
            </button>
            <button
              onClick={processAll}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              {t('startOcr')}
            </button>
          </div>
        </div>
      )}

      {/* Progress bar */}
      {(processing || (rows.length > 0 && processedCount > 0)) && rows.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
            <span>{processing ? t('processing') : t('done')} {t('progress', { done: processedCount, total: rows.length })}</span>
            {processing && <Loader2 size={12} className="animate-spin" />}
          </div>
          <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(processedCount / rows.length) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Results table */}
      {rows.some((r) => r.status !== 'pending') && (
        <>
          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700 mb-4">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800 text-xs text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-3 py-2 text-left w-8">{t('colSkip')}</th>
                  <th className="px-3 py-2 text-left w-20">{t('colImage')}</th>
                  <th className="px-3 py-2 text-left">{t('colName')}</th>
                  <th className="px-3 py-2 text-left">{t('colCompany')}</th>
                  <th className="px-3 py-2 text-left">{t('colJobTitle')}</th>
                  <th className="px-3 py-2 text-left">Email</th>
                  <th className="px-3 py-2 text-left">{t('colPhone')}</th>
                  <th className="px-3 py-2 text-left w-20">{t('colStatus')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {rows.map((row, i) => (
                  <tr key={row.fileId} className={row.skip ? 'opacity-40' : ''}>
                    <td className="px-3 py-2">
                      {row.status === 'done' && (
                        <input type="checkbox" checked={row.skip} onChange={() => toggleSkip(i)} className="cursor-pointer" />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {row.imgUrl ? (
                        <img src={row.imgUrl} alt="名片" className="w-16 h-10 object-cover rounded border border-gray-200 dark:border-gray-700" />
                      ) : row.status === 'processing' ? (
                        <div className="w-16 h-10 flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded">
                          <Loader2 size={14} className="animate-spin text-blue-400" />
                        </div>
                      ) : (
                        <div className="w-16 h-10 bg-gray-100 dark:bg-gray-800 rounded" />
                      )}
                    </td>
                    <td className="px-2 py-1">
                      {row.status === 'done' ? (
                        <input value={row.name} onChange={(e) => updateField(i, 'name', e.target.value)}
                          className="w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-2 py-1">
                      {row.status === 'done' ? (
                        <input value={row.company} onChange={(e) => updateField(i, 'company', e.target.value)}
                          className="w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-2 py-1">
                      {row.status === 'done' ? (
                        <input value={row.job_title} onChange={(e) => updateField(i, 'job_title', e.target.value)}
                          className="w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-2 py-1">
                      {row.status === 'done' ? (
                        <input value={row.email} onChange={(e) => updateField(i, 'email', e.target.value)}
                          className="w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-2 py-1">
                      {row.status === 'done' ? (
                        <input value={row.phone} onChange={(e) => updateField(i, 'phone', e.target.value)}
                          className="w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      {row.status === 'processing' && <span className="text-blue-500 text-xs flex items-center gap-1"><Loader2 size={10} className="animate-spin" />{t('status.processing')}</span>}
                      {row.status === 'pending' && <span className="text-gray-400 text-xs">{t('status.pending')}</span>}
                      {row.status === 'error' && (
                        <span className="text-red-500 text-xs flex items-center gap-1" title={row.error}><X size={10} />{t('status.error')}</span>
                      )}
                      {row.status === 'done' && row.dupType === 'exact' && (
                        <span className="text-red-500 text-xs flex items-center gap-1"><AlertTriangle size={10} />{t('status.duplicate')}</span>
                      )}
                      {row.status === 'done' && row.dupType === 'similar' && (
                        <span className="text-yellow-500 text-xs flex items-center gap-1"><AlertTriangle size={10} />{t('status.similar')}</span>
                      )}
                      {row.status === 'done' && row.dupType === 'none' && (
                        <span className="text-green-600 text-xs flex items-center gap-1"><CheckCircle size={10} />{t('status.ok')}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Dup legend */}
          {rows.some((r) => r.dupType !== 'none') && (
            <div className="flex gap-4 text-xs text-gray-500 dark:text-gray-400 mb-4">
              <span className="flex items-center gap-1"><AlertTriangle size={10} className="text-red-500" /> {t('dupLegend.exact')}</span>
              <span className="flex items-center gap-1"><AlertTriangle size={10} className="text-yellow-500" /> {t('dupLegend.similar')}</span>
            </div>
          )}

          {/* Save button */}
          {!processing && doneCount > 0 && !saveResult && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t('willSave', { count: toSaveCount, skip: rows.length - toSaveCount })}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => { setRows([]); setSaveResult(null) }}
                  className="px-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  {t('reselect')}
                </button>
                <button
                  onClick={saveAll}
                  disabled={saving || toSaveCount === 0}
                  className="flex items-center gap-2 px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  {t('saveAll')}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// Compress image client-side (matches server-side processCardImage: 1024px, JPEG 85%)
function compressImage(file: File, maxSide = 1024, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img
      if (width > maxSide || height > maxSide) {
        if (width >= height) {
          height = Math.round((height * maxSide) / width)
          width = maxSide
        } else {
          width = Math.round((width * maxSide) / height)
          height = maxSide
        }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('Canvas not supported')); return }
      ctx.drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', quality).split(',')[1])
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')) }
    img.src = url
  })
}
