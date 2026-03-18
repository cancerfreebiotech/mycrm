'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import { Sun, Moon, ArrowLeft, Globe } from 'lucide-react'
import { marked, Renderer } from 'marked'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { LOCALE_COOKIE, SUPPORTED_LOCALES } from '@/i18n/config'

type Locale = 'zh-TW' | 'en' | 'ja'
type Section = 'user' | 'super_admin'

const LOCALE_LABELS: Record<Locale, string> = {
  'zh-TW': '繁中',
  'en': 'English',
  'ja': '日本語',
}

const SECTION_LABELS: Record<Locale, Record<Section, string>> = {
  'zh-TW': { user: '一般使用者', super_admin: 'Super Admin' },
  'en': { user: 'User Guide', super_admin: 'Super Admin' },
  'ja': { user: '一般ユーザー', super_admin: 'Super Admin' },
}

interface TocItem {
  id: string
  text: string
  level: number
}

function getCookieLocale(): Locale {
  if (typeof document === 'undefined') return 'zh-TW'
  const match = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]*)`))
  const val = match ? decodeURIComponent(match[1]) : ''
  return (SUPPORTED_LOCALES as readonly string[]).includes(val) ? (val as Locale) : 'zh-TW'
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff\u3040-\u30ff\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

function buildMarkdownRenderer(): Renderer {
  const renderer = new Renderer()
  renderer.heading = ({ text, depth }: { text: string; depth: number }) => {
    const id = slugify(text)
    const tag = `h${depth}`
    return `<${tag} id="${id}">${text}</${tag}>\n`
  }
  return renderer
}

function extractToc(markdown: string): TocItem[] {
  const toc: TocItem[] = []
  const headingRegex = /^(#{1,3})\s+(.+)$/gm
  let match
  while ((match = headingRegex.exec(markdown)) !== null) {
    const level = match[1].length
    const text = match[2].trim()
    toc.push({ id: slugify(text), text, level })
  }
  return toc
}

export default function DocsPage() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [locale, setLocale] = useState<Locale>('zh-TW')
  const [section, setSection] = useState<Section>('user')
  const [content, setContent] = useState<string>('')
  const [html, setHtml] = useState<string>('')
  const [toc, setToc] = useState<TocItem[]>([])
  const [activeId, setActiveId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const contentRef = useRef<HTMLDivElement>(null)

  const supabase = createBrowserSupabaseClient()

  useEffect(() => {
    setMounted(true)
    setLocale(getCookieLocale())
  }, [])

  useEffect(() => {
    if (!mounted) return
    loadContent(locale, section)
  }, [locale, section, mounted])

  useEffect(() => {
    if (content) {
      const tocItems = extractToc(content)
      setToc(tocItems)
      marked.use({ renderer: buildMarkdownRenderer() })
      const parsed = marked.parse(content)
      if (typeof parsed === 'string') setHtml(parsed)
      else parsed.then(setHtml)
    } else {
      setHtml('')
      setToc([])
    }
  }, [content])

  // Intersection observer for active TOC item
  useEffect(() => {
    if (!html || toc.length === 0) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id)
          }
        }
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0 }
    )
    const el = contentRef.current
    if (!el) return
    el.querySelectorAll('h1, h2, h3').forEach((h) => observer.observe(h))
    return () => observer.disconnect()
  }, [html, toc])

  async function loadContent(loc: Locale, sec: Section) {
    setLoading(true)
    const { data } = await supabase
      .from('docs_content')
      .select('content')
      .eq('locale', loc)
      .eq('section', sec)
      .single()
    setContent(data?.content ?? '')
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 transition-colors">
            <ArrowLeft size={16} /> 返回系統
          </Link>
          <span className="text-gray-300 dark:text-gray-600">|</span>
          <span className="text-base font-bold text-gray-900 dark:text-gray-100">myCRM 使用說明</span>
        </div>
        <div className="flex items-center gap-3">
          {/* Locale switcher */}
          <div className="flex items-center gap-1 border border-gray-200 dark:border-gray-700 rounded-lg px-1 py-0.5">
            <Globe size={13} className="text-gray-400 ml-1 shrink-0" />
            {SUPPORTED_LOCALES.map((l) => (
              <button
                key={l}
                onClick={() => setLocale(l as Locale)}
                className={`text-xs px-2 py-1 rounded transition-colors ${
                  locale === l
                    ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-medium'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
              >
                {LOCALE_LABELS[l as Locale]}
              </button>
            ))}
          </div>
          {mounted && (
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          )}
        </div>
      </header>

      <div className="max-w-7xl mx-auto flex">
        {/* Left: Section nav */}
        <aside className="hidden lg:block w-56 shrink-0 border-r border-gray-200 dark:border-gray-800 min-h-[calc(100vh-3.5rem)]">
          <div className="sticky top-14 px-4 py-8 space-y-1">
            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-4 px-2">章節</p>
            {(['user', 'super_admin'] as Section[]).map((s) => (
              <button
                key={s}
                onClick={() => setSection(s)}
                className={`w-full text-left block text-sm transition-colors rounded-md px-3 py-2 ${
                  section === s
                    ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 font-semibold'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800/50'
                }`}
              >
                {SECTION_LABELS[locale][s]}
              </button>
            ))}
          </div>
        </aside>

        {/* Center: Content */}
        <main className="flex-1 min-w-0 px-8 py-10 max-w-3xl">
          {/* Mobile section switcher */}
          <div className="flex lg:hidden gap-2 mb-6">
            {(['user', 'super_admin'] as Section[]).map((s) => (
              <button
                key={s}
                onClick={() => setSection(s)}
                className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${
                  section === s
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-medium'
                    : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400'
                }`}
              >
                {SECTION_LABELS[locale][s]}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="text-sm text-gray-400 dark:text-gray-500 py-20 text-center">載入中…</div>
          ) : html ? (
            <div ref={contentRef}>
              <article
                className="docs-content"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            </div>
          ) : (
            <div className="text-center py-20">
              <p className="text-sm text-gray-400 dark:text-gray-500">此語言的文件尚未生成。</p>
            </div>
          )}

          <div className="mt-16 pt-6 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500">
            <span>myCRM v{process.env.NEXT_PUBLIC_APP_VERSION} · cancerfree.io</span>
          </div>
        </main>

        {/* Right: TOC */}
        {toc.length > 0 && (
          <aside className="hidden xl:block w-60 shrink-0 border-l border-gray-200 dark:border-gray-800">
            <div className="sticky top-14 px-5 py-8">
              <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-4">本頁目錄</p>
              <nav className="space-y-0.5">
                {toc.map((item) => (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    className={`block text-sm leading-snug py-1 transition-colors rounded ${
                      item.level === 1
                        ? 'font-semibold pl-0'
                        : item.level === 2
                        ? 'pl-3'
                        : 'pl-6'
                    } ${
                      activeId === item.id
                        ? 'text-blue-600 dark:text-blue-400'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                    }`}
                  >
                    {item.text}
                  </a>
                ))}
              </nav>
            </div>
          </aside>
        )}
      </div>

      <style>{`
        .docs-content h1 {
          font-size: 1.875rem;
          font-weight: 700;
          margin-top: 0;
          margin-bottom: 1rem;
          padding-bottom: 0.5rem;
          border-bottom: 2px solid #e5e7eb;
          color: inherit;
          line-height: 1.3;
          scroll-margin-top: 5rem;
        }
        .docs-content h2 {
          font-size: 1.375rem;
          font-weight: 700;
          margin-top: 2.5rem;
          margin-bottom: 0.875rem;
          padding-bottom: 0.375rem;
          border-bottom: 1px solid #e5e7eb;
          color: inherit;
          line-height: 1.35;
          scroll-margin-top: 5rem;
        }
        .docs-content h3 {
          font-size: 1.125rem;
          font-weight: 600;
          margin-top: 2rem;
          margin-bottom: 0.625rem;
          color: inherit;
          line-height: 1.4;
          scroll-margin-top: 5rem;
        }
        .docs-content h4 {
          font-size: 1rem;
          font-weight: 600;
          margin-top: 1.5rem;
          margin-bottom: 0.5rem;
          color: inherit;
          scroll-margin-top: 5rem;
        }
        .docs-content p {
          margin-bottom: 1rem;
          line-height: 1.75;
          color: #374151;
        }
        .docs-content ul, .docs-content ol {
          padding-left: 1.5rem;
          margin-bottom: 1rem;
          line-height: 1.75;
          color: #374151;
        }
        .docs-content li {
          margin-bottom: 0.25rem;
        }
        .docs-content li > ul, .docs-content li > ol {
          margin-top: 0.25rem;
          margin-bottom: 0.25rem;
        }
        .docs-content ul { list-style-type: disc; }
        .docs-content ol { list-style-type: decimal; }
        .docs-content code {
          background: #f3f4f6;
          border-radius: 0.25rem;
          padding: 0.15em 0.4em;
          font-size: 0.875em;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          color: #1f2937;
        }
        .docs-content pre {
          background: #1f2937;
          border-radius: 0.5rem;
          padding: 1rem 1.25rem;
          margin-bottom: 1.25rem;
          overflow-x: auto;
        }
        .docs-content pre code {
          background: transparent;
          padding: 0;
          font-size: 0.875rem;
          color: #e5e7eb;
          border-radius: 0;
        }
        .docs-content blockquote {
          border-left: 4px solid #3b82f6;
          background: #eff6ff;
          margin: 1.25rem 0;
          padding: 0.75rem 1rem;
          border-radius: 0 0.375rem 0.375rem 0;
          color: #1e40af;
          font-style: italic;
        }
        .docs-content table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 1.25rem;
          font-size: 0.9rem;
          overflow: hidden;
          border-radius: 0.375rem;
          border: 1px solid #e5e7eb;
        }
        .docs-content th {
          background: #f9fafb;
          padding: 0.625rem 0.875rem;
          text-align: left;
          font-weight: 600;
          font-size: 0.8125rem;
          color: #374151;
          border-bottom: 2px solid #e5e7eb;
        }
        .docs-content td {
          padding: 0.5rem 0.875rem;
          border-bottom: 1px solid #f3f4f6;
          color: #374151;
          vertical-align: top;
        }
        .docs-content tr:last-child td { border-bottom: none; }
        .docs-content tr:nth-child(even) td { background: #fafafa; }
        .docs-content a {
          color: #2563eb;
          text-decoration: none;
        }
        .docs-content a:hover { text-decoration: underline; }
        .docs-content hr {
          border: none;
          border-top: 1px solid #e5e7eb;
          margin: 2rem 0;
        }
        .docs-content strong { font-weight: 600; }

        /* Dark mode */
        @media (prefers-color-scheme: dark) {}
        .dark .docs-content p,
        .dark .docs-content ul,
        .dark .docs-content ol,
        .dark .docs-content li,
        .dark .docs-content td { color: #d1d5db; }
        .dark .docs-content h1,
        .dark .docs-content h2 { border-color: #374151; }
        .dark .docs-content code { background: #374151; color: #e5e7eb; }
        .dark .docs-content th { background: #1f2937; color: #d1d5db; border-color: #374151; }
        .dark .docs-content td { border-color: #1f2937; }
        .dark .docs-content tr:nth-child(even) td { background: #111827; }
        .dark .docs-content table { border-color: #374151; }
        .dark .docs-content blockquote { background: #1e3a5f; color: #93c5fd; border-color: #3b82f6; }
        .dark .docs-content a { color: #60a5fa; }
        .dark .docs-content hr { border-color: #374151; }
      `}</style>
    </div>
  )
}
