import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { GoogleGenerativeAI } from '@google/generative-ai'

const PROMPT = `You are a strict text formatter. Your ONLY job is to reformat the given content into clean HTML.

STRICT RULES:
1. Keep EVERY word exactly as written — do NOT add, remove, change, translate, or improve any text whatsoever
2. Convert paragraph blocks into <p> tags
3. If lines clearly start with list markers (-, *, •, or numbers like 1. 2.), convert them to <ul><li> or <ol><li>
4. Remove excessive blank lines between paragraphs
5. Return ONLY the HTML body content — no <html>, <body>, <head>, <style>, no explanations, no code blocks
6. Allowed tags only: <p>, <strong>, <em>, <ul>, <ol>, <li>, <br>, <a>
`

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { html } = await req.json()
  if (!html?.trim()) return NextResponse.json({ error: 'Missing html' }, { status: 400 })

  // Strip tags to get plain text — preserve line structure
  const plain = html
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/li>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  try {
    const apiKey = process.env.GEMINI_API_KEY!
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

    const result = await model.generateContent(`${PROMPT}\n\nContent to format:\n${plain}`)
    const text = result.response.text().trim()
      .replace(/^```html\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/, '')
      .trim()

    return NextResponse.json({ html: text })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
