'use client'
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, RemoveFormatting } from 'lucide-react'

export interface InlineEmailEditorHandle {
  insertImage: (url: string) => void
}

// 與電子報骨架範本內文一致的基準字體堆疊——「預設字體」選項套用它，
// 讓貼上／改過字體的文字能一鍵統一回信件本身的字體。
const BASE_FONT_STACK = "Arial, 'PingFang TC', 'Microsoft JhengHei', Helvetica, sans-serif"

const FONT_OPTIONS: { label: string; value: string }[] = [
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Georgia', value: "Georgia, 'Times New Roman', serif" },
  { label: 'Times New Roman', value: "'Times New Roman', Times, serif" },
  { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
]

// 剝掉剪貼簿 HTML 自帶的字體／字級／顏色等樣式，讓貼上的文字繼承游標處的
// 既有樣式——否則從 Word／網頁複製的內容永遠和信件字體不一致，且事後救不回來。
const FOREIGN_STYLE_PROPS = [
  'font-family', 'font-size', 'color', 'background-color', 'background',
  'line-height', 'letter-spacing', 'font-variant', 'white-space',
]

function sanitizePastedHtml(html: string): string {
  const body = new DOMParser().parseFromString(html, 'text/html').body
  body.querySelectorAll('style, script, meta, link, title').forEach((el) => el.remove())
  body.querySelectorAll('*').forEach((el) => {
    el.removeAttribute('class')
    // <font face/size/color> 等 presentational 屬性
    ;['face', 'color', 'size', 'bgcolor'].forEach((a) => el.removeAttribute(a))
    if (el instanceof HTMLElement && el.style.length) {
      FOREIGN_STYLE_PROPS.forEach((p) => el.style.removeProperty(p))
      if (!el.style.length) el.removeAttribute('style')
    }
  })
  return body.innerHTML
}

// Inline email editor using iframe + document.designMode.
// Unlike TipTap, this does NOT re-parse the HTML through a schema, so
// table-based email layouts stay completely intact. The user clicks directly
// on rendered text and edits in-place. onApply is called on unmount (mode
// switch) and when the user clicks "套用變更".
export const InlineEmailEditor = forwardRef<
  InlineEmailEditorHandle,
  { html: string; onApply: (html: string) => void; onSave: (html: string) => void }
>(({ html, onApply, onSave }, ref) => {
  const t = useTranslations('newsletterQuickSend')
  const frameRef = useRef<HTMLIFrameElement>(null)
  const onApplyRef = useRef(onApply)
  onApplyRef.current = onApply
  const [selectedImg, setSelectedImg] = useState<HTMLImageElement | null>(null)

  // execCommand is deprecated but remains the only reliable way to edit at the
  // caret position inside a designMode document across all browsers.
  function cmd(name: string, value?: string) {
    const doc = frameRef.current?.contentDocument
    if (!doc) return
    // eslint-disable-next-line deprecation/deprecation
    doc.execCommand(name, false, value)
  }

  useImperativeHandle(ref, () => ({
    insertImage(url: string) {
      const doc = frameRef.current?.contentDocument
      if (!doc) return
      // eslint-disable-next-line deprecation/deprecation
      doc.execCommand('insertImage', false, url)
      // execCommand inserts a bare <img> with no size constraint — a phone
      // photo (3000px+) blows out the ~600px email layout. Constrain inline so
      // the saved HTML (and the sent email) carries the fix too.
      Array.from(doc.images)
        .filter((img) => img.src === url && !img.style.maxWidth)
        .forEach((img) => {
          img.style.maxWidth = '100%'
          img.style.height = 'auto'
        })
    },
  }))

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    const doc = frame.contentDocument
    if (!doc) return
    doc.open()
    doc.write(html)
    doc.close()
    doc.designMode = 'on'
    // Make foreColor/fontSize emit inline styles (email-client-safe) instead
    // of <font> tags where supported.
    // eslint-disable-next-line deprecation/deprecation
    doc.execCommand('styleWithCSS', false, 'true')

    // Click an image → show width controls in the toolbar; click elsewhere → hide.
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      setSelectedImg(target instanceof HTMLImageElement ? target : null)
    }
    doc.addEventListener('click', onClick)

    // 攔截貼上：有 HTML 就淨化後插入，純文字直接插入；兩者皆無（如貼圖）走預設行為。
    const onPaste = (e: ClipboardEvent) => {
      const dt = e.clipboardData
      if (!dt) return
      const rich = dt.getData('text/html')
      const plain = dt.getData('text/plain')
      if (!rich && !plain) return
      e.preventDefault()
      // eslint-disable-next-line deprecation/deprecation
      if (rich) doc.execCommand('insertHTML', false, sanitizePastedHtml(rich))
      // eslint-disable-next-line deprecation/deprecation
      else doc.execCommand('insertText', false, plain)
    }
    doc.addEventListener('paste', onPaste)

    // Auto-sync on unmount so switching modes doesn't lose edits
    return () => {
      doc.removeEventListener('click', onClick)
      doc.removeEventListener('paste', onPaste)
      const d = frame.contentDocument
      if (d) onApplyRef.current(d.documentElement.outerHTML)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function setImageWidth(pct: number) {
    if (!selectedImg) return
    selectedImg.style.width = `${pct}%`
    selectedImg.style.maxWidth = '100%'
    selectedImg.style.height = 'auto'
    selectedImg.removeAttribute('width')
    selectedImg.removeAttribute('height')
  }

  // Toolbar buttons use onMouseDown+preventDefault so the iframe's text
  // selection survives the click (otherwise execCommand has no target).
  const keepSelection = (e: React.MouseEvent) => e.preventDefault()
  const btnCls =
    'min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded'

  return (
    <div className="flex flex-col">
      {/* Formatting toolbar (designMode-native commands — table layout stays intact) */}
      <div className="flex flex-wrap items-center gap-1 px-2 py-1 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
        <button type="button" onMouseDown={keepSelection} onClick={() => cmd('bold')} className={btnCls} title={t('fmtBold')}>
          <Bold size={16} />
        </button>
        <button type="button" onMouseDown={keepSelection} onClick={() => cmd('italic')} className={btnCls} title={t('fmtItalic')}>
          <Italic size={16} />
        </button>
        <button type="button" onMouseDown={keepSelection} onClick={() => cmd('underline')} className={btnCls} title={t('fmtUnderline')}>
          <Underline size={16} />
        </button>
        <span className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />
        <select
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            if (e.target.value) cmd('fontName', e.target.value)
            e.target.value = ''
          }}
          defaultValue=""
          className="min-h-[44px] max-w-[110px] text-base px-1 bg-transparent text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded"
          title={t('fmtFontFamily')}
        >
          <option value="" disabled>{t('fmtFontFamily')}</option>
          <option value={BASE_FONT_STACK}>{t('fmtFontDefault')}</option>
          {FONT_OPTIONS.map((f) => (
            <option key={f.label} value={f.value}>{f.label}</option>
          ))}
        </select>
        <select
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            if (e.target.value) cmd('fontSize', e.target.value)
            e.target.value = ''
          }}
          defaultValue=""
          className="min-h-[44px] text-base px-1 bg-transparent text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded"
          title={t('fmtFontSize')}
        >
          <option value="" disabled>{t('fmtFontSize')}</option>
          <option value="2">{t('fmtFontSmall')}</option>
          <option value="3">{t('fmtFontNormal')}</option>
          <option value="5">{t('fmtFontLarge')}</option>
        </select>
        <label className={`${btnCls} cursor-pointer relative`} title={t('fmtTextColor')} onMouseDown={keepSelection}>
          <span className="text-base font-semibold border-b-4 border-red-500 leading-none pb-0.5 text-gray-600 dark:text-gray-300">A</span>
          <input
            type="color"
            className="absolute inset-0 opacity-0 cursor-pointer"
            onChange={(e) => cmd('foreColor', e.target.value)}
          />
        </label>
        <button type="button" onMouseDown={keepSelection} onClick={() => cmd('removeFormat')} className={btnCls} title={t('fmtClearFormat')}>
          <RemoveFormatting size={16} />
        </button>
        <span className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />
        <button type="button" onMouseDown={keepSelection} onClick={() => cmd('justifyLeft')} className={btnCls} title={t('fmtAlignLeft')}>
          <AlignLeft size={16} />
        </button>
        <button type="button" onMouseDown={keepSelection} onClick={() => cmd('justifyCenter')} className={btnCls} title={t('fmtAlignCenter')}>
          <AlignCenter size={16} />
        </button>
        <button type="button" onMouseDown={keepSelection} onClick={() => cmd('justifyRight')} className={btnCls} title={t('fmtAlignRight')}>
          <AlignRight size={16} />
        </button>
        {selectedImg && (
          <>
            <span className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />
            <span className="text-xs text-gray-500 dark:text-gray-400">{t('imgWidthLabel')}</span>
            {[25, 50, 75, 100].map((pct) => (
              <button
                key={pct}
                type="button"
                onMouseDown={keepSelection}
                onClick={() => setImageWidth(pct)}
                className="min-h-[44px] px-2.5 text-xs text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                {pct}%
              </button>
            ))}
          </>
        )}
      </div>
      <div className="flex items-center justify-between px-3 py-1.5 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800">
        <span className="text-xs text-amber-700 dark:text-amber-400">{t('inlineHint')}</span>
        <button
          onClick={() => {
            const d = frameRef.current?.contentDocument
            if (!d) return
            const html = d.documentElement.outerHTML
            onApply(html)
            onSave(html)
          }}
          className="text-xs px-2.5 py-1 bg-amber-600 text-white rounded hover:bg-amber-700"
        >
          {t('inlineApplySave')}
        </button>
      </div>
      <iframe
        ref={frameRef}
        title="inline-editor"
        className="w-full h-[600px] bg-white"
        sandbox="allow-same-origin"
      />
    </div>
  )
})

InlineEmailEditor.displayName = 'InlineEmailEditor'
