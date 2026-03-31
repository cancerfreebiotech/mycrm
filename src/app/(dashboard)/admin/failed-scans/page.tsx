'use client'

import { useEffect, useState } from 'react'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { Check, Loader2, ExternalLink } from 'lucide-react'
import { PermissionGate } from '@/components/PermissionGate'
import Image from 'next/image'

interface FailedScan {
  id: string
  user_id: string
  storage_path: string
  card_img_url: string
  created_at: string
  reviewed: boolean
  reviewed_by: string | null
  reviewed_at: string | null
  note: string | null
  users: { display_name: string | null; email: string } | null
}

export default function FailedScansPage() {
  const supabase = createBrowserSupabaseClient()
  const [scans, setScans] = useState<FailedScan[]>([])
  const [loading, setLoading] = useState(true)
  const [showReviewed, setShowReviewed] = useState(false)
  const [reviewing, setReviewing] = useState<string | null>(null)

  useEffect(() => { fetchScans() }, [showReviewed])

  async function fetchScans() {
    setLoading(true)
    const query = supabase
      .from('failed_scans')
      .select('id, user_id, storage_path, card_img_url, created_at, reviewed, reviewed_by, reviewed_at, note, users(display_name, email)')
      .order('created_at', { ascending: false })
    if (!showReviewed) query.eq('reviewed', false)
    const { data } = await query
    setScans((data as unknown as FailedScan[]) ?? [])
    setLoading(false)
  }

  async function markReviewed(id: string) {
    setReviewing(id)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase
      .from('failed_scans')
      .update({ reviewed: true, reviewed_by: user?.email ?? null, reviewed_at: new Date().toISOString() })
      .eq('id', id)
    setScans(prev => prev.filter(s => s.id !== id))
    setReviewing(null)
  }

  return (
    <PermissionGate feature="failed_scans">
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">辨識失敗審查</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">名片辨識失敗（無法識別姓名）的圖片，可手動建立聯絡人後標記完成</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
          <input
            type="checkbox"
            checked={showReviewed}
            onChange={e => setShowReviewed(e.target.checked)}
            className="rounded"
          />
          顯示已審查
        </label>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-400">
          <Loader2 size={16} className="animate-spin" /> 載入中...
        </div>
      ) : scans.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center text-gray-400">
          {showReviewed ? '沒有審查紀錄' : '✅ 目前沒有待審查的辨識失敗圖片'}
        </div>
      ) : (
        <div className="space-y-4">
          {scans.map(scan => (
            <div
              key={scan.id}
              className={`bg-white dark:bg-gray-900 rounded-xl border ${scan.reviewed ? 'border-gray-100 dark:border-gray-800 opacity-60' : 'border-gray-200 dark:border-gray-700'} p-5`}
            >
              <div className="flex gap-5">
                {/* Card image */}
                <a href={scan.card_img_url} target="_blank" rel="noopener noreferrer" className="shrink-0 group">
                  <div className="relative w-40 h-24 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800">
                    <Image
                      src={scan.card_img_url}
                      alt="名片圖片"
                      fill
                      className="object-cover group-hover:opacity-90 transition-opacity"
                      unoptimized
                    />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/20 transition-opacity">
                      <ExternalLink size={16} className="text-white" />
                    </div>
                  </div>
                </a>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        上傳者：{scan.users?.display_name ?? scan.users?.email ?? '—'}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(scan.created_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}
                      </p>
                      {scan.reviewed && scan.reviewed_by && (
                        <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                          ✅ 已審查 by {scan.reviewed_by}（{new Date(scan.reviewed_at!).toLocaleDateString('zh-TW')}）
                        </p>
                      )}
                    </div>
                    {!scan.reviewed && (
                      <button
                        onClick={() => markReviewed(scan.id)}
                        disabled={reviewing === scan.id}
                        className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 shrink-0"
                      >
                        {reviewing === scan.id
                          ? <Loader2 size={13} className="animate-spin" />
                          : <Check size={13} />
                        }
                        標記完成
                      </button>
                    )}
                  </div>

                  <div className="mt-3 flex gap-2">
                    <a
                      href={scan.card_img_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                    >
                      <ExternalLink size={11} /> 開原圖
                    </a>
                    <a
                      href={`/contacts/new?card_img_url=${encodeURIComponent(scan.card_img_url)}&storage_path=${encodeURIComponent(scan.storage_path)}&failed_scan_id=${scan.id}`}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      → 手動建立聯絡人
                    </a>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
    </PermissionGate>
  )
}
