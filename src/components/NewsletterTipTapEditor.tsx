'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import ImageExtension from '@tiptap/extension-image'
import LinkExtension from '@tiptap/extension-link'
import TextAlign from '@tiptap/extension-text-align'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
import { useEffect, useCallback } from 'react'
import {
  Bold, Italic, Underline as UnderlineIcon,
  Link2, List, ListOrdered, Minus, ImageIcon,
  AlignLeft, AlignCenter, AlignRight,
} from 'lucide-react'

interface Props {
  // initialValue is read once on mount; parent controls the source of truth.
  // Component is conditionally rendered (unmounts on tab switch) so every
  // time user enters WYSIWYG mode it picks up the latest contentHtml.
  initialValue: string
  onChange: (html: string) => void
  // Signal from parent that an image was just uploaded; editor inserts it.
  pendingImageUrl?: string | null
  onClearPendingImage?: () => void
  onImageInsertClick?: () => void
}

export function NewsletterTipTapEditor({
  initialValue,
  onChange,
  pendingImageUrl,
  onClearPendingImage,
  onImageInsertClick,
}: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      ImageExtension.configure({ inline: false }),
      LinkExtension.configure({ openOnClick: false }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Underline,
      Placeholder.configure({ placeholder: '開始撰寫電子報內容...' }),
    ],
    content: initialValue,
    onUpdate({ editor }) {
      onChange(editor.getHTML())
    },
  })

  // Insert image when parent signals upload complete
  useEffect(() => {
    if (!pendingImageUrl || !editor || editor.isDestroyed) return
    editor.chain().focus().setImage({ src: pendingImageUrl }).run()
    onClearPendingImage?.()
  }, [pendingImageUrl]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSetLink = useCallback(() => {
    if (!editor) return
    const prev = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('連結網址', prev ?? 'https://')
    if (url === null) return
    if (!url) { editor.chain().focus().unsetLink().run(); return }
    editor.chain().focus().setLink({ href: url }).run()
  }, [editor])

  if (!editor) return null

  const btn = (active: boolean) =>
    `p-1.5 rounded transition-colors ${
      active
        ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
        : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
    }`

  return (
    <div className="flex flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 bg-gray-50 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-700">
        <button onClick={() => editor.chain().focus().toggleBold().run()} className={btn(editor.isActive('bold'))} title="粗體 (Ctrl+B)">
          <Bold size={14} />
        </button>
        <button onClick={() => editor.chain().focus().toggleItalic().run()} className={btn(editor.isActive('italic'))} title="斜體 (Ctrl+I)">
          <Italic size={14} />
        </button>
        <button onClick={() => editor.chain().focus().toggleUnderline().run()} className={btn(editor.isActive('underline'))} title="底線 (Ctrl+U)">
          <UnderlineIcon size={14} />
        </button>
        <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1 shrink-0" />
        {([1, 2, 3] as const).map((level) => (
          <button
            key={level}
            onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
            className={`${btn(editor.isActive('heading', { level }))} text-xs font-bold px-2`}
            title={`標題 ${level}`}
          >
            H{level}
          </button>
        ))}
        <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1 shrink-0" />
        <button onClick={() => editor.chain().focus().toggleBulletList().run()} className={btn(editor.isActive('bulletList'))} title="項目符號">
          <List size={14} />
        </button>
        <button onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btn(editor.isActive('orderedList'))} title="編號清單">
          <ListOrdered size={14} />
        </button>
        <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1 shrink-0" />
        <button onClick={() => editor.chain().focus().setTextAlign('left').run()} className={btn(editor.isActive({ textAlign: 'left' }))} title="靠左">
          <AlignLeft size={14} />
        </button>
        <button onClick={() => editor.chain().focus().setTextAlign('center').run()} className={btn(editor.isActive({ textAlign: 'center' }))} title="置中">
          <AlignCenter size={14} />
        </button>
        <button onClick={() => editor.chain().focus().setTextAlign('right').run()} className={btn(editor.isActive({ textAlign: 'right' }))} title="靠右">
          <AlignRight size={14} />
        </button>
        <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1 shrink-0" />
        <button onClick={handleSetLink} className={btn(editor.isActive('link'))} title="插入連結">
          <Link2 size={14} />
        </button>
        <button onClick={() => editor.chain().focus().setHorizontalRule().run()} className={btn(false)} title="分隔線">
          <Minus size={14} />
        </button>
        {onImageInsertClick && (
          <button onClick={onImageInsertClick} className={btn(false)} title="插入圖片">
            <ImageIcon size={14} />
          </button>
        )}
      </div>

      {/* Editor body */}
      <EditorContent
        editor={editor}
        className="p-4 min-h-[540px] overflow-y-auto prose prose-sm dark:prose-invert max-w-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[500px] [&_.ProseMirror_img]:max-w-full [&_.ProseMirror_a]:text-blue-600 dark:[&_.ProseMirror_a]:text-blue-400"
      />
    </div>
  )
}
