'use client'
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

export interface InlineEmailEditorHandle {
  insertImage: (url: string) => void
}

// Inline email editor using iframe + document.designMode.
// Unlike TipTap, this does NOT re-parse the HTML through a schema, so
// table-based email layouts stay completely intact. The user clicks directly
// on rendered text and edits in-place. onApply is called on unmount (mode
// switch) and when the user clicks "套用變更".
export const InlineEmailEditor = forwardRef<
  InlineEmailEditorHandle,
  { html: string; onApply: (html: string) => void }
>(({ html, onApply }, ref) => {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const onApplyRef = useRef(onApply)
  onApplyRef.current = onApply

  useImperativeHandle(ref, () => ({
    insertImage(url: string) {
      const doc = frameRef.current?.contentDocument
      if (!doc) return
      // execCommand is deprecated but remains the only reliable way to insert
      // at the caret position inside a designMode document across all browsers.
      // eslint-disable-next-line deprecation/deprecation
      doc.execCommand('insertImage', false, url)
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

    // Auto-sync on unmount so switching modes doesn't lose edits
    return () => {
      const d = frame.contentDocument
      if (d) onApplyRef.current(d.documentElement.outerHTML)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function applyNow() {
    const d = frameRef.current?.contentDocument
    if (d) onApply(d.documentElement.outerHTML)
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-3 py-1.5 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800">
        <span className="text-xs text-amber-700 dark:text-amber-400">
          直接點選文字進行編輯 — 版型不受影響
        </span>
        <button
          onClick={applyNow}
          className="text-xs px-2.5 py-1 bg-amber-600 text-white rounded hover:bg-amber-700"
        >
          套用變更
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
