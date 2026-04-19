'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import TextAlign from '@tiptap/extension-text-align'
import HorizontalRule from '@tiptap/extension-horizontal-rule'
import { useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import {
  Bold, Italic, UnderlineIcon, Link2, Image as ImageIcon,
  List, ListOrdered, Minus, AlignLeft, AlignCenter, AlignRight,
  Eye, Edit3, Paperclip, X, RemoveFormatting, LayoutList, Wand2, Loader2,
} from 'lucide-react'

// ── Rule-based formatter ──────────────────────────────────────────────────────
function applyRuleFormat(html: string): string {
  // Flatten HTML → structured plain text
  const text = html
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n§ ')   // temp marker
    .replace(/<\/li>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  const blocks = text.split(/\n{2,}/)
  const out: string[] = []

  for (const raw of blocks) {
    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean)
    if (!lines.length) continue

    // Lines recovered from <li> via §
    const fromLi   = lines.every(l => l.startsWith('§ '))
    const isBullet = !fromLi && lines.every(l => /^[-*•·]\s+/.test(l))
    const isOrdered = !fromLi && lines.every(l => /^\d+[.)、]\s*/.test(l))

    if (fromLi || isBullet) {
      const items = lines.map(l => `<li>${l.replace(/^(§ |[-*•·]\s+)/, '')}</li>`).join('')
      out.push(`<ul>${items}</ul>`)
    } else if (isOrdered) {
      const items = lines.map(l => `<li>${l.replace(/^\d+[.)、]\s*/, '')}</li>`).join('')
      out.push(`<ol>${items}</ol>`)
    } else {
      // Each line → its own <p> (preserves intentional breaks)
      lines.forEach(l => out.push(`<p>${l}</p>`))
    }
  }

  return out.join('') || '<p></p>'
}

export interface TipTapAttachment {
  name: string
  url: string
  size: number
}

interface TipTapEditorProps {
  content: string        // HTML string
  contentJson?: object
  onChange: (html: string, json: object) => void
  onAttachmentsChange?: (attachments: TipTapAttachment[]) => void
  attachments?: TipTapAttachment[]
  uploadAttachment?: (file: File) => Promise<{ url: string }>
  placeholder?: string
  unsubscribeUrl?: string  // auto-appended footer
}

export default function TipTapEditor({
  content,
  onChange,
  onAttachmentsChange,
  attachments = [],
  uploadAttachment,
  placeholder,
  unsubscribeUrl,
}: TipTapEditorProps) {
  const t = useTranslations('tiptap')
  const tc = useTranslations('common')
  const effectivePlaceholder = placeholder ?? t('bodyPlaceholder')
  const VARIABLES = [
    { label: t('varName'), value: '{{name}}' },
    { label: t('varCompany'), value: '{{company}}' },
    { label: t('varJobTitle'), value: '{{job_title}}' },
  ]
  const [preview, setPreview] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [aiFormatLoading, setAiFormatLoading] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [showLinkInput, setShowLinkInput] = useState(false)

  function handleRuleFormat() {
    if (!editor) return
    const formatted = applyRuleFormat(editor.getHTML())
    editor.commands.setContent(formatted, true)
  }

  async function handleAiFormat() {
    if (!editor || aiFormatLoading) return
    const html = editor.getHTML()
    if (!html.trim() || html === '<p></p>') return
    setAiFormatLoading(true)
    try {
      const res = await fetch('/api/ai-format', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html }),
      })
      const data = await res.json()
      if (data.html) editor.commands.setContent(data.html, true)
    } catch {
      // silent fail
    } finally {
      setAiFormatLoading(false)
    }
  }

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ horizontalRule: false }),
      Underline,
      HorizontalRule,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Link.configure({ openOnClick: false, HTMLAttributes: { class: 'text-blue-600 underline' } }),
      Image.configure({ HTMLAttributes: { class: 'max-w-full rounded' } }),
      Placeholder.configure({ placeholder: effectivePlaceholder }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML(), editor.getJSON())
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm dark:prose-invert max-w-none min-h-[280px] px-4 py-3 focus:outline-none',
      },
      transformPastedHTML(html) {
        // Strip inline styles, font tags, and class/data attributes —
        // keep structure (bold, italic, lists, links) but remove all styling
        return html
          .replace(/(<[^>]+)\sstyle="[^"]*"/gi, '$1')
          .replace(/(<[^>]+)\sclass="[^"]*"/gi, '$1')
          .replace(/(<[^>]+)\sdata-[\w-]+="[^"]*"/gi, '$1')
          .replace(/<font[^>]*>/gi, '')
          .replace(/<\/font>/gi, '')
          .replace(/<span[^>]*>\s*<\/span>/gi, '')
      },
    },
  })

  const insertVariable = (v: string) => {
    editor?.chain().focus().insertContent(v).run()
  }

  const setLink = useCallback(() => {
    if (!linkUrl.trim()) {
      editor?.chain().focus().extendMarkToLink({ href: '' }).unsetLink().run()
    } else {
      const url = linkUrl.startsWith('http') ? linkUrl : `https://${linkUrl}`
      editor?.chain().focus().setLink({ href: url }).run()
    }
    setShowLinkInput(false)
    setLinkUrl('')
  }, [editor, linkUrl])

  const handleAttachFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !uploadAttachment) return
    setUploading(true)
    try {
      const { url } = await uploadAttachment(file)
      onAttachmentsChange?.([...attachments, { name: file.name, url, size: file.size }])
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const removeAttachment = (idx: number) => {
    onAttachmentsChange?.(attachments.filter((_, i) => i !== idx))
  }

  const previewHtml = content + (unsubscribeUrl
    ? `<p style="margin-top:24px;font-size:12px;color:#888;">
        <a href="${unsubscribeUrl}">${t('unsubscribeText')}</a>
       </p>`
    : '')

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 px-2 py-1.5 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <ToolBtn active={!preview} onClick={() => setPreview(false)} title={t('edit')}><Edit3 size={14} /></ToolBtn>
        <ToolBtn active={preview} onClick={() => setPreview(true)} title={t('preview')}><Eye size={14} /></ToolBtn>
        <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />

        {!preview && (
          <>
            <ToolBtn active={editor?.isActive('bold')} onClick={() => editor?.chain().focus().toggleBold().run()} title={t('bold')}><Bold size={14} /></ToolBtn>
            <ToolBtn active={editor?.isActive('italic')} onClick={() => editor?.chain().focus().toggleItalic().run()} title={t('italic')}><Italic size={14} /></ToolBtn>
            <ToolBtn active={editor?.isActive('underline')} onClick={() => editor?.chain().focus().toggleUnderline().run()} title={t('underline')}><UnderlineIcon size={14} /></ToolBtn>
            <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />
            <ToolBtn active={editor?.isActive({ textAlign: 'left' })} onClick={() => editor?.chain().focus().setTextAlign('left').run()} title={t('alignLeft')}><AlignLeft size={14} /></ToolBtn>
            <ToolBtn active={editor?.isActive({ textAlign: 'center' })} onClick={() => editor?.chain().focus().setTextAlign('center').run()} title={t('alignCenter')}><AlignCenter size={14} /></ToolBtn>
            <ToolBtn active={editor?.isActive({ textAlign: 'right' })} onClick={() => editor?.chain().focus().setTextAlign('right').run()} title={t('alignRight')}><AlignRight size={14} /></ToolBtn>
            <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />
            <ToolBtn active={editor?.isActive('bulletList')} onClick={() => editor?.chain().focus().toggleBulletList().run()} title={t('bulletList')}><List size={14} /></ToolBtn>
            <ToolBtn active={editor?.isActive('orderedList')} onClick={() => editor?.chain().focus().toggleOrderedList().run()} title={t('orderedList')}><ListOrdered size={14} /></ToolBtn>
            <ToolBtn onClick={() => editor?.chain().focus().setHorizontalRule().run()} title={t('divider')}><Minus size={14} /></ToolBtn>
            <ToolBtn
              onClick={() => editor?.chain().focus().clearNodes().unsetAllMarks().run()}
              title={t('clearFormat')}
            ><RemoveFormatting size={14} /></ToolBtn>
            <ToolBtn onClick={handleRuleFormat} title={t('autoFormatRule')}>
              <LayoutList size={14} />
            </ToolBtn>
            <ToolBtn onClick={handleAiFormat} title={t('autoFormatAi')} disabled={aiFormatLoading}>
              {aiFormatLoading ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
            </ToolBtn>
            <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />
            <ToolBtn
              active={editor?.isActive('link') || showLinkInput}
              onClick={() => { setShowLinkInput(v => !v); setLinkUrl(editor?.getAttributes('link').href ?? '') }}
              title={t('link')}
            ><Link2 size={14} /></ToolBtn>
            <ToolBtn
              onClick={() => {
                const url = prompt(t('imageUrlPrompt'))
                if (url) editor?.chain().focus().setImage({ src: url }).run()
              }}
              title={t('insertImage')}
            ><ImageIcon size={14} /></ToolBtn>
            <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />
            {/* Variables */}
            <span className="text-xs text-gray-400 dark:text-gray-500 mr-1">{t('insertVariable')}</span>
            {VARIABLES.map(v => (
              <button
                key={v.value}
                type="button"
                onClick={() => insertVariable(v.value)}
                className="text-xs px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/70"
              >
                {v.label}
              </button>
            ))}
          </>
        )}
      </div>

      {/* Link input */}
      {showLinkInput && !preview && (
        <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800">
          <input
            type="url"
            value={linkUrl}
            onChange={e => setLinkUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && setLink()}
            placeholder="https://..."
            className="flex-1 text-sm px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 outline-none"
            autoFocus
          />
          <button type="button" onClick={setLink} className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">{tc('confirm')}</button>
          <button type="button" onClick={() => setShowLinkInput(false)} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
        </div>
      )}

      {/* Editor / Preview */}
      {preview ? (
        <div
          className="prose prose-sm dark:prose-invert max-w-none px-4 py-3 min-h-[280px]"
          dangerouslySetInnerHTML={{ __html: previewHtml }}
        />
      ) : (
        <EditorContent editor={editor} />
      )}

      {/* Unsubscribe footer notice */}
      {unsubscribeUrl && (
        <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-400">
          ↳ 信件底部自動附加退訂連結（不可移除）
        </div>
      )}

      {/* Attachments */}
      {uploadAttachment && (
        <div className="px-3 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <div className="flex flex-wrap gap-2 mb-1">
            {attachments.map((a, i) => (
              <span key={i} className="flex items-center gap-1 text-xs bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded px-2 py-0.5">
                <Paperclip size={10} className="text-gray-400" />
                {a.name}
                <button type="button" onClick={() => removeAttachment(i)} className="hover:text-red-500 ml-0.5"><X size={10} /></button>
              </span>
            ))}
          </div>
          <label className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 cursor-pointer hover:underline w-fit">
            <Paperclip size={12} />
            {uploading ? t('uploading') : t('addAttachment')}
            <input type="file" className="hidden" onChange={handleAttachFile} disabled={uploading} />
          </label>
        </div>
      )}
    </div>
  )
}

function ToolBtn({ onClick, active, title, disabled, children }: {
  onClick: () => void
  active?: boolean
  title?: string
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        active ? 'bg-gray-200 dark:bg-gray-600 text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400'
      }`}
    >
      {children}
    </button>
  )
}
