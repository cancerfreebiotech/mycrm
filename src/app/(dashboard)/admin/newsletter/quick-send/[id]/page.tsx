'use client'

import { useEffect, useState, useRef, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { PermissionGate } from '@/components/PermissionGate'
import { Loader2, Send, FileDown, Rss, Eye, Save, ArrowLeft, CheckCircle2, AlertTriangle, Code, Columns, ImageIcon } from 'lucide-react'

interface Campaign {
  id: string
  title: string | null
  subject: string | null
  preview_text: string | null
  content_html: string | null
  list_ids: string[] | null
  status: string
  slug: string | null
  published_at: string | null
  sent_at: string | null
  sent_count: number | null
  total_recipients: number | null
}

interface List {
  id: string
  key: string
  name: string
  memberCount: number
}

export default function QuickSendPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const id = params.id
  const supabase = createBrowserSupabaseClient()
  const previewRef = useRef<HTMLIFrameElement>(null)

  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [lists, setLists] = useState<List[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [testEmail, setTestEmail] = useState('')
  const [sendingTest, setSendingTest] = useState(false)
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)

  // Editable fields
  const [subject, setSubject] = useState('')
  const [previewText, setPreviewText] = useState('')
  const [listIds, setListIds] = useState<string[]>([])
  const [contentHtml, setContentHtml] = useState('')
  type ViewMode = 'preview' | 'edit' | 'split'
  const [viewMode, setViewMode] = useState<ViewMode>('preview')
  const [uploadingImage, setUploadingImage] = useState(false)
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    (async () => {
      const [cRes, { data: listData }] = await Promise.all([
        fetch(`/api/newsletter/campaigns/${id}`).then((r) => r.json()),
        supabase.from('newsletter_lists').select('id, key, name'),
      ])
      if (cRes.error) {
        setBanner({ kind: 'err', msg: cRes.error })
        setLoading(false)
        return
      }
      const c = cRes as Campaign
      setCampaign(c)
      setSubject(c.subject ?? '')
      setPreviewText(c.preview_text ?? '')
      setListIds(c.list_ids ?? [])
      setContentHtml(c.content_html ?? '')

      // Member counts per list
      const listsArr = listData ?? []
      const counts = await Promise.all(
        listsArr.map(async (l) => {
          const { count } = await supabase
            .from('newsletter_subscriber_lists')
            .select('subscriber_id', { count: 'exact', head: true })
            .eq('list_id', l.id)
          return { ...l, memberCount: count ?? 0 } as List
        })
      )
      setLists(counts)
      setLoading(false)
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Print-optimized preview HTML: inject @media print rules so window.print()
  // (= 匯出 PDF) renders without browser default margins, keeps background
  // colors, avoids splitting images/sections across pages.
  // Stored HTML in DB is NOT modified — pure version goes out to SendGrid for
  // email clients; print CSS only activates in the iframe / new-window print.
  // This rule-set applies automatically to ALL campaigns (current + future
  // new campaigns), so 5 月、6 月、後續的電子報都共用同一套。
  const previewHtml = useMemo(() => {
    const PRINT_CSS = `
<style>
@media print {
  @page { size: A4; margin: 8mm; }
  html, body {
    margin: 0 !important; padding: 0 !important;
    background: #FFFFFF !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  body > div, body > table { padding: 0 !important; background: #FFFFFF !important; }
  table[align="center"], table { max-width: 100% !important; width: 100% !important; }
  img { max-width: 100% !important; height: auto !important; page-break-inside: avoid !important; break-inside: avoid !important; display: block; margin: 0 auto; }
  h1, h2, h3, h4 { page-break-after: avoid !important; break-after: avoid !important; }
  p { orphans: 3; widows: 3; }
  tr, td { page-break-inside: avoid !important; break-inside: avoid !important; }
  /* Numbered story blocks: each sits in its own padded div — keep together */
  div[style*="padding:0px 24px"],
  div[style*="padding:16px 24px"] { page-break-inside: avoid !important; break-inside: avoid !important; }
  /* Link styling: override listmonk's inline text-decoration:none so URLs are
     visible and distinguishable in PDF (helps anchor detection by PDF viewers). */
  a { color: #0D9488 !important; text-decoration: underline !important; word-break: break-all; }
  hr { border-top: 1px solid #CCCCCC !important; }
  /* Show URL after link text so reader can see / copy even if PDF flattens anchors.
     Style as pseudo-link (same colour, underline) so visually consistent.
     Skip if the <a> wraps only an image — URL would clutter logo / social icons. */
  a[href^="http"]:not(:has(> img))::after {
    content: " (" attr(href) ")";
    color: #0D9488 !important;
    text-decoration: underline !important;
    font-size: 0.82em !important;
    font-weight: normal !important;
    word-break: break-all;
  }
  /* ── Hide unsubscribe footer in PDF export ──
     Email clients need the unsubscribe link (SendGrid substitutes {{{unsubscribe}}}
     at send time). PDF is a static artefact — unsubscribe link makes no sense there.
     Match both literal placeholders (in preview) AND substituted real URLs. */
  a[href*="unsubscribe"],
  a[href*="{{{unsubscribe"] {
    display: none !important;
  }
  /* If entire footer container only holds unsub links, collapse its padding. */
  td[style*="padding:16px 24px 16px 24px"]:has(> div > a[href*="unsubscribe"]) {
    display: none !important;
  }
}
</style>`.trim()
    // Inject before </head> when present; else prepend to <body>; else wrap.
    if (/<\/head>/i.test(contentHtml)) return contentHtml.replace(/<\/head>/i, `${PRINT_CSS}</head>`)
    if (/<body[^>]*>/i.test(contentHtml)) return contentHtml.replace(/<body[^>]*>/i, (m) => `${m}${PRINT_CSS}`)
    return `<!doctype html><html><head>${PRINT_CSS}</head><body>${contentHtml}</body></html>`
  }, [contentHtml])

  // Derive Storage folder from campaign slug (e.g. "2026-04-zh-tw" → "2026-04")
  // Fall back to current year-month if slug is missing / unparseable.
  function periodFolder(): string {
    const m = campaign?.slug?.match(/^(\d{4}-\d{2})/)
    if (m) return m[1]
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setBanner({ kind: 'err', msg: '只支援圖片檔' })
      if (imageInputRef.current) imageInputRef.current.value = ''
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setBanner({ kind: 'err', msg: '圖片超過 10 MB 上限' })
      if (imageInputRef.current) imageInputRef.current.value = ''
      return
    }
    setUploadingImage(true)
    setBanner(null)
    try {
      // Sanitize filename: ASCII-only for Storage key (same rule as migrate script)
      const dot = file.name.lastIndexOf('.')
      const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : ''
      const base = dot >= 0 ? file.name.slice(0, dot) : file.name
      const cleaned = base.replace(/[()（）【】\s]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
      // eslint-disable-next-line no-control-regex
      const safeName = /[^\x00-\x7F]/.test(cleaned)
        ? `asset-${Date.now().toString(36)}${ext}`
        : `${cleaned}-${Date.now().toString(36)}${ext}`
      const path = `${periodFolder()}/${safeName}`

      const { error: upErr } = await supabase.storage
        .from('newsletter-assets')
        .upload(path, file, { contentType: file.type, upsert: false })
      if (upErr) throw upErr
      const { data: pub } = supabase.storage.from('newsletter-assets').getPublicUrl(path)
      const imgTag = `<img src="${pub.publicUrl}" alt="" style="outline:none;border:none;text-decoration:none;vertical-align:middle;display:inline-block;max-width:100%" />`

      // Insert at cursor position in textarea if focused, else append at end
      const ta = editorRef.current
      if (ta) {
        const start = ta.selectionStart ?? contentHtml.length
        const end = ta.selectionEnd ?? contentHtml.length
        const next = contentHtml.slice(0, start) + imgTag + contentHtml.slice(end)
        setContentHtml(next)
        // Restore cursor position right after the inserted tag
        requestAnimationFrame(() => {
          const newPos = start + imgTag.length
          ta.focus()
          ta.setSelectionRange(newPos, newPos)
        })
      } else {
        setContentHtml(contentHtml + imgTag)
      }
      setBanner({ kind: 'ok', msg: `已上傳並插入：${safeName}` })
    } catch (e) {
      setBanner({ kind: 'err', msg: e instanceof Error ? e.message : '圖片上傳失敗' })
    } finally {
      setUploadingImage(false)
      if (imageInputRef.current) imageInputRef.current.value = ''
    }
  }

  function toggleList(lid: string) {
    setListIds((prev) => (prev.includes(lid) ? prev.filter((x) => x !== lid) : [...prev, lid]))
  }

  async function save() {
    setSaving(true)
    setBanner(null)
    try {
      const res = await fetch(`/api/newsletter/campaigns/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, preview_text: previewText, list_ids: listIds, content_html: contentHtml }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'save failed')
      setBanner({ kind: 'ok', msg: '已儲存' })
      setCampaign((prev) => prev ? { ...prev, subject, preview_text: previewText, list_ids: listIds, content_html: contentHtml } : prev)
    } catch (e) {
      setBanner({ kind: 'err', msg: e instanceof Error ? e.message : '儲存失敗' })
    } finally { setSaving(false) }
  }

  async function sendReal() {
    const selectedCount = lists.filter((l) => listIds.includes(l.id)).reduce((sum, l) => sum + l.memberCount, 0)
    if (!confirm(`確定要寄送這份電子報給 ${selectedCount} 位訂閱者？（此操作無法復原）`)) return
    setSending(true)
    setBanner(null)
    try {
      await save() // ensure latest subject/list_ids persisted first
      const res = await fetch(`/api/newsletter/campaigns/${id}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '寄送失敗')
      setBanner({ kind: 'ok', msg: `已寄出：${data.sent}/${data.total}${data.errors?.length ? `（${data.errors.length} 個 chunk 錯誤）` : ''}` })
      // Reload campaign to reflect sent state
      const c = await fetch(`/api/newsletter/campaigns/${id}`).then((r) => r.json())
      setCampaign(c)
    } catch (e) {
      setBanner({ kind: 'err', msg: e instanceof Error ? e.message : '寄送失敗' })
    } finally { setSending(false) }
  }

  async function sendTest() {
    if (!testEmail.trim()) { setBanner({ kind: 'err', msg: '請輸入測試信箱' }); return }
    setSendingTest(true)
    setBanner(null)
    try {
      await save()
      const res = await fetch(`/api/newsletter/campaigns/${id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testOnly: true, testEmail: testEmail.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '測試寄送失敗')
      setBanner({ kind: 'ok', msg: `測試信已寄到 ${testEmail}` })
    } catch (e) {
      setBanner({ kind: 'err', msg: e instanceof Error ? e.message : '測試寄送失敗' })
    } finally { setSendingTest(false) }
  }

  async function togglePublish() {
    const willPublish = !campaign?.published_at
    if (!confirm(willPublish ? '發布到 RSS feed？Substack 會在下次 poll 時抓取並產生草稿' : '取消發布到 RSS？')) return
    setPublishing(true)
    try {
      const res = await fetch(`/api/newsletter/campaigns/${id}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ published: willPublish }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '發布失敗')
      setCampaign((prev) => prev ? { ...prev, published_at: data.published_at } : prev)
      setBanner({ kind: 'ok', msg: willPublish ? `已發布到 RSS（${window.location.origin}/api/newsletter/feed.xml）` : '已取消發布' })
    } catch (e) {
      setBanner({ kind: 'err', msg: e instanceof Error ? e.message : '發布失敗' })
    } finally { setPublishing(false) }
  }

  function exportPdf() {
    // Open a fresh window with the full HTML + injected print CSS, then
    // trigger print. This avoids a known Chrome quirk where iframe printing
    // flattens <a> anchors in the resulting PDF (clicks do nothing).
    // Using a new window keeps anchors as real hyperlinks in the PDF.
    const w = window.open('', '_blank', 'width=800,height=1000,menubar=no,toolbar=no')
    if (!w) {
      setBanner({ kind: 'err', msg: '瀏覽器阻擋了彈出視窗，請允許後再試' })
      return
    }
    w.document.open()
    w.document.write(previewHtml)
    w.document.close()
    // Wait for images to load before printing so PDF isn't cut off mid-load
    const triggerPrint = () => { w.focus(); w.print() }
    const imgs = w.document.images
    if (imgs.length === 0) {
      setTimeout(triggerPrint, 300)
      return
    }
    let loaded = 0
    const done = () => { if (++loaded >= imgs.length) triggerPrint() }
    for (const img of Array.from(imgs)) {
      if (img.complete) done()
      else {
        img.addEventListener('load', done)
        img.addEventListener('error', done)
      }
    }
    // Safety timeout in case some images never resolve
    setTimeout(triggerPrint, 3000)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    )
  }

  if (!campaign) {
    return <div className="p-8 text-center text-gray-400">找不到電子報</div>
  }

  const totalSelected = lists.filter((l) => listIds.includes(l.id)).reduce((sum, l) => sum + l.memberCount, 0)

  return (
    <PermissionGate feature="newsletter">
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <Link href="/admin/newsletter/campaigns" className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{campaign.title ?? 'Newsletter'}</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {campaign.sent_at ? `已寄出 ${campaign.sent_count ?? 0} 份` : '尚未寄送'}
              {campaign.published_at ? ` · 已發布到 RSS` : ' · 未發布'}
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

        <div className="grid md:grid-cols-2 gap-6">
          {/* Left: edit + preview */}
          <div className="space-y-4">
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">主旨</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">預覽文字（收件匣第二行）</label>
                <input
                  type="text"
                  value={previewText}
                  onChange={(e) => setPreviewText(e.target.value)}
                  className="w-full text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={save}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  儲存草稿
                </button>
                <button
                  onClick={exportPdf}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <FileDown size={14} />
                  匯出 PDF
                </button>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              {/* View mode tabs + editor toolbar */}
              <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-2 text-xs">
                <div className="inline-flex rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <button
                    onClick={() => setViewMode('preview')}
                    className={`flex items-center gap-1 px-2.5 py-1 text-xs ${viewMode === 'preview' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                    title="只看渲染後預覽"
                  >
                    <Eye size={12} /> 預覽
                  </button>
                  <button
                    onClick={() => setViewMode('edit')}
                    className={`flex items-center gap-1 px-2.5 py-1 text-xs border-l border-gray-200 dark:border-gray-700 ${viewMode === 'edit' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                    title="只看 HTML 原始碼"
                  >
                    <Code size={12} /> 編輯
                  </button>
                  <button
                    onClick={() => setViewMode('split')}
                    className={`flex items-center gap-1 px-2.5 py-1 text-xs border-l border-gray-200 dark:border-gray-700 ${viewMode === 'split' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                    title="左編輯 + 右即時預覽"
                  >
                    <Columns size={12} /> 分割
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  {(viewMode === 'edit' || viewMode === 'split') && (
                    <button
                      onClick={() => imageInputRef.current?.click()}
                      disabled={uploadingImage}
                      className="flex items-center gap-1 px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                      title="上傳圖片到 newsletter-assets 並在游標位置插入 <img>"
                    >
                      {uploadingImage ? <Loader2 size={11} className="animate-spin" /> : <ImageIcon size={11} />}
                      插入圖片
                    </button>
                  )}
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageUpload}
                  />
                </div>
              </div>
              {/* Content area: preview / edit / split */}
              {viewMode === 'preview' ? (
                <iframe
                  ref={previewRef}
                  title="preview"
                  className="w-full h-[600px] bg-white"
                  srcDoc={previewHtml}
                  sandbox="allow-same-origin allow-popups allow-modals"
                />
              ) : viewMode === 'edit' ? (
                <textarea
                  ref={editorRef}
                  value={contentHtml}
                  onChange={(e) => setContentHtml(e.target.value)}
                  spellCheck={false}
                  className="w-full h-[600px] p-3 text-xs font-mono bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 border-0 focus:outline-none resize-none"
                />
              ) : (
                <div className="grid grid-cols-2 divide-x divide-gray-200 dark:divide-gray-700">
                  <textarea
                    ref={editorRef}
                    value={contentHtml}
                    onChange={(e) => setContentHtml(e.target.value)}
                    spellCheck={false}
                    className="w-full h-[600px] p-3 text-xs font-mono bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 border-0 focus:outline-none resize-none"
                  />
                  <iframe
                    title="preview"
                    className="w-full h-[600px] bg-white"
                    srcDoc={previewHtml}
                    sandbox="allow-same-origin allow-popups allow-modals"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Right: recipients + actions */}
          <div className="space-y-4">
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">收件名單</h2>
                <Link href="/admin/newsletter/lists" className="text-xs text-gray-400 hover:text-blue-500">管理 →</Link>
              </div>
              <div className="space-y-2">
                {lists.map((l) => (
                  <div key={l.id} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={listIds.includes(l.id)}
                      onChange={() => toggleList(l.id)}
                      id={`list-${l.id}`}
                      className="rounded cursor-pointer"
                    />
                    <label htmlFor={`list-${l.id}`} className="flex-1 cursor-pointer">{l.name}</label>
                    <Link
                      href={`/admin/newsletter/lists/${l.id}`}
                      className="text-xs text-gray-400 hover:text-blue-500 hover:underline"
                      title="檢視名單成員"
                    >
                      {l.memberCount} 人 →
                    </Link>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 text-sm">
                <span className="text-gray-500">總計：</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">{totalSelected} 人</span>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">測試寄送</h2>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="test@example.com"
                  className="flex-1 text-sm px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                />
                <button
                  onClick={sendTest}
                  disabled={sendingTest || !testEmail.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 disabled:opacity-50"
                >
                  {sendingTest ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  測試寄送
                </button>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
              <button
                onClick={sendReal}
                disabled={sending || listIds.length === 0 || !subject.trim()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
              >
                {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                正式寄送 ({totalSelected} 人)
              </button>
              <button
                onClick={togglePublish}
                disabled={publishing}
                className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 ${
                  campaign.published_at
                    ? 'border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400 hover:bg-orange-100'
                    : 'border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-400 hover:bg-purple-100'
                }`}
              >
                {publishing ? <Loader2 size={14} className="animate-spin" /> : <Rss size={14} />}
                {campaign.published_at ? '取消發布 RSS' : '發布到 RSS（Substack 會抓草稿）'}
              </button>
              {campaign.published_at && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  已發布：{new Date(campaign.published_at).toLocaleString('zh-TW')}
                </p>
              )}
            </div>

            <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl p-4 text-xs text-gray-500 dark:text-gray-400 space-y-1">
              <p>⚠ 電子報透過 SendGrid 寄送。發送後不會計入聯絡人的「最後活動時間」（仍會寫互動紀錄）。</p>
              <p>📡 RSS feed: <code className="text-gray-700 dark:text-gray-300">/api/newsletter/feed.xml</code></p>
            </div>
          </div>
        </div>

        <button
          onClick={() => router.back()}
          className="mt-6 text-sm text-gray-500 hover:text-gray-700"
        >
          ← 返回
        </button>
      </div>
    </PermissionGate>
  )
}
