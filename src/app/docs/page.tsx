'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import { Sun, Moon, ArrowLeft, RefreshCw, Globe } from 'lucide-react'
import { marked } from 'marked'
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

function getCookieLocale(): Locale {
  if (typeof document === 'undefined') return 'zh-TW'
  const match = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]*)`))
  const val = match ? decodeURIComponent(match[1]) : ''
  return (SUPPORTED_LOCALES as readonly string[]).includes(val) ? (val as Locale) : 'zh-TW'
}

export default function DocsPage() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [locale, setLocale] = useState<Locale>('zh-TW')
  const [section, setSection] = useState<Section>('user')
  const [content, setContent] = useState<string>('')
  const [html, setHtml] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)

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
      const parsed = marked.parse(content)
      if (typeof parsed === 'string') setHtml(parsed)
      else parsed.then(setHtml)
    } else {
      setHtml('')
    }
  }, [content])

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

  async function handleGenerate() {
    setGenerating(true)
    try {
      const res = await fetch('/api/docs/generate', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        alert(`生成失敗：${json.error ?? res.statusText}`)
        return
      }
      await loadContent(locale, section)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 h-14 flex items-center justify-between">
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

      <div className="max-w-6xl mx-auto flex gap-8 px-6 py-10">
        {/* TOC / Section nav */}
        <aside className="hidden lg:block w-48 shrink-0">
          <div className="sticky top-24 space-y-1">
            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">章節</p>
            {(['user', 'super_admin'] as Section[]).map((s) => (
              <button
                key={s}
                onClick={() => setSection(s)}
                className={`w-full text-left block text-sm transition-colors rounded px-2 py-1.5 ${
                  section === s
                    ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 font-semibold'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
              >
                {SECTION_LABELS[locale][s]}
              </button>
            ))}
          </div>
        </aside>

        {/* Content */}
        <div className="flex-1 min-w-0">
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
            <div className="text-sm text-gray-400 dark:text-gray-500 py-12 text-center">載入中…</div>
          ) : html ? (
            <article
              className="prose prose-gray dark:prose-invert max-w-none
                prose-headings:scroll-mt-20 prose-h1:text-2xl prose-h2:text-lg prose-h3:text-base
                prose-code:bg-gray-100 dark:prose-code:bg-gray-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:font-normal prose-code:before:content-none prose-code:after:content-none"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : (
            <div className="text-center py-12">
              <p className="text-sm text-gray-400 dark:text-gray-500 mb-4">此語言的文件尚未生成。</p>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                <RefreshCw size={14} className={generating ? 'animate-spin' : ''} />
                {generating ? '生成中…' : '立即生成說明書'}
              </button>
            </div>
          )}

          <div className="mt-12 pt-6 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500 flex items-center justify-between">
            <span>myCRM v{process.env.NEXT_PUBLIC_APP_VERSION} · cancerfree.io</span>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="inline-flex items-center gap-1.5 hover:text-gray-600 dark:hover:text-gray-300 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={12} className={generating ? 'animate-spin' : ''} />
              {generating ? '生成中…' : '重新生成'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
