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
  promo_text: string | null
}

interface List {
  id: string
  key: string
  name: string
  memberCount: number
  eligibleCount: number
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
  const [exportingImage, setExportingImage] = useState(false)
  const [testEmail, setTestEmail] = useState('')
  const [sendingTest, setSendingTest] = useState(false)
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)

  // Editable fields
  const [subject, setSubject] = useState('')
  const [previewText, setPreviewText] = useState('')
  const [promoText, setPromoText] = useState('')
  const [promoCopied, setPromoCopied] = useState(false)
  const [savingPromo, setSavingPromo] = useState(false)
  const [promoBatchOpen, setPromoBatchOpen] = useState(false)
  const [promoBatch, setPromoBatch] = useState({ 'zh-TW': '', 'en': '', 'ja': '' })
  const [promoBatchSaving, setPromoBatchSaving] = useState(false)
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
      setPromoText(c.promo_text ?? '')
      setListIds(c.list_ids ?? [])
      setContentHtml(c.content_html ?? '')

      // Fetch per-list stats (total + eligible, applying send-flow suppression filters)
      const listsArr = listData ?? []
      const statsRes = await fetch('/api/newsletter/lists/stats')
      const statsJson = statsRes.ok ? await statsRes.json() as { stats: Record<string, { total: number; eligible: number }> } : { stats: {} }
      const counts = listsArr.map((l) => {
        const s = statsJson.stats[l.id]
        return { ...l, memberCount: s?.total ?? 0, eligibleCount: s?.eligible ?? 0 } as List
      })
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
  /* Story photos cap at 130mm tall (~46% of A4 content). User wants
     "稍微縮小圖片" so multiple stories can fit on one page instead of
     each photo dominating its own page. Aspect preserved via height: auto
     (no object-fit: cover, no stretching). 200mm was too generous and
     produced 11-page PDFs; 130mm typically yields 6-7 pages. */
  img { vertical-align: middle; }
  img:not([width]) {
    max-width: 100% !important;
    max-height: 130mm !important;
    height: auto !important;
    display: block;
    margin: 0 auto;
    object-fit: contain;
  }
  h1, h2, h3, h4 { page-break-after: avoid !important; break-after: avoid !important; }
  p { orphans: 3; widows: 3; }
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
    // NOTE: image URL transform via /storage/v1/render/image/public/?width=...
    // was REMOVED because Supabase's render endpoint mishandles EXIF
    // orientation — phone photos taken in landscape but flagged with
    // orientation=6 (rotate 90°) come out as a 1200×{original_width}
    // strip (e.g. 5712×4284 landscape → 1200×5712 broken portrait).
    // Browsers respect EXIF on the original URL, so we serve it as-is.
    // Result: PDF / preview images render correctly; PDF size stays at
    // ~3-4 MB instead of ~1.5 MB (acceptable trade-off for accuracy).
    const compactHtml = contentHtml
    // Inject before </head> when present; else prepend to <body>; else wrap.
    if (/<\/head>/i.test(compactHtml)) return compactHtml.replace(/<\/head>/i, `${PRINT_CSS}</head>`)
    if (/<body[^>]*>/i.test(compactHtml)) return compactHtml.replace(/<body[^>]*>/i, (m) => `${m}${PRINT_CSS}`)
    return `<!doctype html><html><head>${PRINT_CSS}</head><body>${compactHtml}</body></html>`
  }, [contentHtml])

  // PDF download filename — Chrome's "Save as PDF" defaults to document.title.
  // Prefix with "Newsletter-" so end-users see a recognisable name even if
  // multiple PDFs end up in the same Downloads folder.
  const pdfFilename = useMemo(() => {
    const slug = campaign?.slug?.trim()
    if (slug) return `Newsletter-${slug}`
    const title = (campaign?.title ?? '').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-')
    return title ? `Newsletter-${title}` : `Newsletter-${id}`
  }, [campaign, id])

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
    const selectedCount = lists.filter((l) => listIds.includes(l.id)).reduce((sum, l) => sum + l.eligibleCount, 0)
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

  async function exportImage() {
    // Render the newsletter HTML to a single (potentially very long) PNG.
    // No pagination — the entire content is captured as one image, ideal
    // for posting on platforms like LINE / Substack / WeChat where one
    // tall image > a multi-page PDF.
    //
    // We render off-screen at email's natural width (600 px = the skeleton
    // table max-width) and let height grow as needed. Upscale by devicePixelRatio
    // so the result is sharp on retina displays / when zoomed.
    setExportingImage(true)
    setBanner(null)
    let host: HTMLDivElement | null = null
    try {
      const html2canvasMod = await import('html2canvas')
      const html2canvas = html2canvasMod.default
      // Stripped-down HTML for the image (no print CSS — we want screen
      // colours / sizes). Replace listmonk unsubscribe anchor placeholders
      // with "#" so the renderer doesn't choke on `{{{unsubscribe}}}`.
      // Also inject inline-block CSS for icon rows because html2canvas
      // misrenders inline <a><img></a> as block (stacking 3 icons vertically
      // in the footer) on some configs.
      const FORCE_INLINE_ICONS = `
<style>
  a > img[width="24"], a > img[width="32"] { display: inline-block !important; vertical-align: middle !important; }
  a:has(> img[width]) { display: inline-block !important; }
</style>`
      const renderHtml = FORCE_INLINE_ICONS + contentHtml
        .replace(/\{\{\{unsubscribe(?:_preferences)?\}\}\}/g, '#')
      host = document.createElement('div')
      host.style.position = 'fixed'
      host.style.left = '-99999px'
      host.style.top = '0'
      host.style.width = '600px'
      host.style.background = '#FFFFFF'
      host.innerHTML = renderHtml
      document.body.appendChild(host)
      // Wait for all images inside to load (html2canvas hangs otherwise on broken images)
      const imgs = Array.from(host.querySelectorAll('img'))
      await Promise.all(
        imgs.map((img) => {
          if (img.complete && img.naturalWidth > 0) return Promise.resolve()
          return new Promise<void>((resolve) => {
            const done = () => resolve()
            img.addEventListener('load', done, { once: true })
            img.addEventListener('error', done, { once: true })
            // Safety timeout
            setTimeout(done, 5000)
          })
        }),
      )
      const canvas = await html2canvas(host, {
        backgroundColor: '#FFFFFF',
        scale: Math.min(window.devicePixelRatio || 1, 2),
        useCORS: true,
        logging: false,
        windowWidth: 600,
      })
      // Convert to blob → trigger download
      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'))
      if (!blob) throw new Error('canvas → blob 失敗')
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${pdfFilename}.png`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setBanner({ kind: 'ok', msg: `已匯出 ${(blob.size / 1024 / 1024).toFixed(1)} MB 圖片` })
    } catch (e) {
      setBanner({ kind: 'err', msg: e instanceof Error ? e.message : '匯出圖片失敗' })
    } finally {
      if (host && host.parentNode) host.parentNode.removeChild(host)
      setExportingImage(false)
    }
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
    // Inject our preferred PDF filename as <title> BEFORE writing the doc —
    // browsers read document.title at the moment "Save as PDF" dialog opens,
    // so setting it via JS after document.close() can be too late on some
    // platforms (the dialog grabs the original "<title>{{subject}}</title>"
    // from the email skeleton and fills the filename input with that, which
    // contains 中文 and brackets that break the OS filesystem).
    const escapedTitle = pdfFilename.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    let html = previewHtml
    if (/<title>[\s\S]*?<\/title>/i.test(html)) {
      html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapedTitle}</title>`)
    } else if (/<head[^>]*>/i.test(html)) {
      html = html.replace(/<head[^>]*>/i, (m) => `${m}<title>${escapedTitle}</title>`)
    }
    w.document.open()
    w.document.write(html)
    w.document.close()
    try { w.document.title = pdfFilename } catch { /* keep as belt-and-braces */ }
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

  const totalSelected = lists.filter((l) => listIds.includes(l.id)).reduce((sum, l) => sum + l.eligibleCount, 0)
  const totalRawSelected = lists.filter((l) => listIds.includes(l.id)).reduce((sum, l) => sum + l.memberCount, 0)
  const totalSuppressed = totalRawSelected - totalSelected

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
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  LINE / 群組宣傳短文
                  <span className="text-gray-400 ml-1">— 可貼到 LINE / Slack</span>
                </label>
                <textarea
                  value={promoText}
                  onChange={(e) => setPromoText(e.target.value)}
                  rows={3}
                  placeholder="（由 Claude.ai newsletter-composer skill 自動產出，或手動填寫）"
                  className="w-full text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
                <div className="flex justify-end gap-2 mt-1">
                  <button
                    onClick={() => { setPromoBatch({ 'zh-TW': '', 'en': '', 'ja': '' }); setPromoBatchOpen(true) }}
                    className="text-xs px-2 py-1 rounded-lg border border-purple-300 dark:border-purple-700 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/30"
                    title="一次貼三種語言、套用到 3 個同期 campaign（zh/en/ja）"
                  >
                    三語批次匯入
                  </button>
                  {promoText && (
                    <button
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(promoText)
                          setPromoCopied(true)
                          setTimeout(() => setPromoCopied(false), 1500)
                        } catch {/* ignore */}
                      }}
                      className="text-xs px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      {promoCopied ? '✓ 已複製' : '複製'}
                    </button>
                  )}
                  <button
                    onClick={async () => {
                      setSavingPromo(true)
                      try {
                        const res = await fetch(`/api/newsletter/campaigns/${id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ promo_text: promoText.trim() || null }),
                        })
                        if (!res.ok) {
                          const data = await res.json()
                          setBanner({ kind: 'err', msg: data.error ?? '儲存失敗' })
                        } else {
                          setBanner({ kind: 'ok', msg: '宣傳短文已儲存' })
                        }
                      } finally { setSavingPromo(false) }
                    }}
                    disabled={savingPromo}
                    className="text-xs px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                  >
                    {savingPromo ? '儲存中…' : '儲存'}
                  </button>
                </div>
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
                <button
                  onClick={exportImage}
                  disabled={exportingImage}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                  title="把整封 newsletter 渲染成一張長圖（不分頁）"
                >
                  {exportingImage ? <Loader2 size={14} className="animate-spin" /> : <ImageIcon size={14} />}
                  匯出圖片
                </button>
                <button
                  onClick={async () => {
                    if (!campaign?.published_at) {
                      setBanner({ kind: 'err', msg: '請先發布到 RSS 才會有公開連結' })
                      return
                    }
                    const slug = campaign.slug ?? campaign.id
                    const url = `${window.location.origin}/newsletter/view/${slug}`
                    try {
                      await navigator.clipboard.writeText(url)
                      setBanner({ kind: 'ok', msg: `已複製連結 → 貼到 Substack「Import from URL」` })
                    } catch {
                      setBanner({ kind: 'err', msg: `複製失敗，連結：${url}` })
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                  title={campaign?.published_at ? '複製公開連結，貼到 Substack 的 Import from URL' : '請先發布到 RSS 才會有公開連結'}
                >
                  🔗 Substack 連結
                </button>
                <button
                  onClick={async () => {
                    // Extract clean body from email skeleton: drop logo /
                    // social-icon footer / unsubscribe / "Taipei, Taiwan"
                    // sign-off. Keep intro + stories.
                    //
                    // Write to clipboard with BOTH text/html and text/plain
                    // mime types so Substack's rich-text editor sees the HTML
                    // and pastes formatted content. navigator.clipboard.writeText()
                    // alone produces text/plain only, which the editor renders
                    // as literal HTML source. ClipboardItem with multi-mime is
                    // the recipe for "paste as rich text".
                    try {
                      const doc = new DOMParser().parseFromString(contentHtml, 'text/html')
                      doc.querySelectorAll('a[href*="unsubscribe"], a[href*="{{{unsubscribe"]').forEach((el) => el.closest('div, td, tr')?.remove())
                      doc.querySelectorAll('a > img[alt="Facebook"], a > img[alt="LinkedIn"], a > img[alt="Website"]').forEach((el) => el.closest('tr')?.remove())
                      doc.querySelectorAll('a > img[alt="CancerFree Biotech"]').forEach((el) => el.closest('tr')?.remove())
                      doc.querySelectorAll('td').forEach((td) => {
                        if (td.children.length === 0 && /CancerFree Biotech.*Taipei/.test(td.textContent ?? '')) {
                          td.closest('tr')?.remove()
                        }
                      })
                      const html = doc.body.innerHTML
                      // text/plain fallback: a stripped, line-broken version
                      const plain = doc.body.textContent?.replace(/\n{3,}/g, '\n\n').trim() ?? ''

                      // Use ClipboardItem so rich-text editors see HTML mime type
                      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
                        await navigator.clipboard.write([
                          new ClipboardItem({
                            'text/html': new Blob([html], { type: 'text/html' }),
                            'text/plain': new Blob([plain], { type: 'text/plain' }),
                          }),
                        ])
                      } else {
                        // Fallback for browsers without ClipboardItem
                        await navigator.clipboard.writeText(html)
                      }
                      setBanner({ kind: 'ok', msg: '已複製內文 → 直接貼到 Substack 編輯器（會自動渲染成格式化內容）' })
                    } catch (e) {
                      setBanner({ kind: 'err', msg: e instanceof Error ? e.message : '複製失敗' })
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                  title="抽掉 logo / 社群圖示 / 退訂連結，複製為「rich text」可直接貼到 Substack 編輯器"
                >
                  📋 複製內文
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
                      title="檢視名單成員（可寄送 / 總數）"
                    >
                      {l.eligibleCount}{l.memberCount !== l.eligibleCount && <span className="text-gray-400"> / {l.memberCount}</span>} 人 →
                    </Link>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 text-sm">
                <span className="text-gray-500">可寄送：</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">{totalSelected} 人</span>
                {totalSuppressed > 0 && (
                  <span className="text-xs text-gray-400 ml-2">（排除退信/退訂 {totalSuppressed} 人）</span>
                )}
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

      {/* 三語批次匯入 promo modal */}
      {promoBatchOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => !promoBatchSaving && setPromoBatchOpen(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-2xl mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">三語批次匯入 LINE 短文</h2>
              <button onClick={() => !promoBatchSaving && setPromoBatchOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">×</button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              貼上 3 種語言的短文，會同時套用到本期 zh / en / ja 三個 campaign。可只填部分（空的不會覆蓋）。
            </p>
            <div className="space-y-3">
              {(['zh-TW', 'en', 'ja'] as const).map((lang) => (
                <div key={lang}>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{lang}</label>
                  <textarea
                    value={promoBatch[lang]}
                    onChange={(e) => setPromoBatch((prev) => ({ ...prev, [lang]: e.target.value }))}
                    rows={3}
                    placeholder={lang === 'zh-TW' ? '繁中短文...' : lang === 'en' ? 'English promo text...' : '日本語の短文...'}
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setPromoBatchOpen(false)}
                disabled={promoBatchSaving}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={async () => {
                  setPromoBatchSaving(true)
                  try {
                    const res = await fetch(`/api/newsletter/campaigns/${id}/promo-batch`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ promo: promoBatch }),
                    })
                    const data = await res.json()
                    if (!res.ok) {
                      setBanner({ kind: 'err', msg: data.error ?? '批次匯入失敗' })
                      return
                    }
                    const updated = (data.results as { lang: string; updated: boolean }[]).filter((r) => r.updated).length
                    setBanner({ kind: 'ok', msg: `三語批次匯入成功（${updated} 個 campaign 更新）` })
                    // Update local promo if current campaign was one of the updated
                    const currentLangPromo = promoBatch['zh-TW'] && (campaign?.slug?.includes('-zh-tw-')) ? promoBatch['zh-TW']
                      : promoBatch['en'] && (campaign?.slug?.includes('-en-')) ? promoBatch['en']
                      : promoBatch['ja'] && (campaign?.slug?.includes('-ja-')) ? promoBatch['ja']
                      : null
                    if (currentLangPromo) setPromoText(currentLangPromo)
                    setPromoBatchOpen(false)
                  } catch (e) {
                    setBanner({ kind: 'err', msg: e instanceof Error ? e.message : '批次匯入失敗' })
                  } finally { setPromoBatchSaving(false) }
                }}
                disabled={promoBatchSaving}
                className="flex items-center gap-1.5 px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
              >
                {promoBatchSaving ? <Loader2 size={14} className="animate-spin" /> : null}
                匯入並儲存
              </button>
            </div>
          </div>
        </div>
      )}
    </PermissionGate>
  )
}
