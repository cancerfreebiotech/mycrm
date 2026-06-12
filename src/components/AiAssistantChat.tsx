'use client'

import { useState, useRef, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { Send, Loader2, Sparkles } from 'lucide-react'

interface ChatMessage { role: 'user' | 'model'; content: string }

function renderMarkdown(md: string): string {
  return DOMPurify.sanitize(marked.parse(md, { async: false }) as string)
}

// AI-enabled CRM 助理對話。抽屜與 /ai-assistant 全頁共用。
// 後端 /api/ai-chat：Gemini function calling（查/改聯絡人、排 briefing…）。
export default function AiAssistantChat({ className = '' }: { className?: string }) {
  const t = useTranslations('assistant')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  async function send() {
    const text = input.trim()
    if (!text || loading) return
    const next = [...messages, { role: 'user' as const, content: text }]
    setMessages(next)
    setInput('')
    setLoading(true)
    try {
      const res = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next }),
      })
      const data = await res.json()
      const reply = res.ok ? (data.reply || t('empty')) : `⚠️ ${data.error || t('error')}`
      setMessages([...next, { role: 'model', content: reply }])
    } catch {
      setMessages([...next, { role: 'model', content: `⚠️ ${t('error')}` }])
    } finally {
      setLoading(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  return (
    <div className={`flex flex-col ${className}`}>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 dark:text-gray-500 gap-2 py-10">
            <Sparkles size={28} className="opacity-40" />
            <p className="text-sm">{t('placeholderTitle')}</p>
            <p className="text-xs max-w-xs">{t('placeholderHint')}</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            {m.role === 'user' ? (
              <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-blue-600 text-white px-3.5 py-2 text-sm whitespace-pre-wrap">{m.content}</div>
            ) : (
              <div
                className="max-w-[85%] rounded-2xl rounded-bl-sm bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3.5 py-2 text-sm prose prose-sm dark:prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }}
              />
            )}
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm bg-gray-100 dark:bg-gray-800 px-3.5 py-2 text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> {t('thinking')}
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-gray-200 dark:border-gray-800 p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder={t('inputPlaceholder')}
            className="flex-1 resize-none max-h-32 px-3 py-2.5 text-base rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            aria-label={t('send')}
            className="shrink-0 w-11 h-11 flex items-center justify-center rounded-xl bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </div>
      </div>
    </div>
  )
}
