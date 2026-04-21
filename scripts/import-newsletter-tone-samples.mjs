#!/usr/bin/env node
/**
 * Import past newsletter HTMLs into newsletter_tone_samples table.
 * These serve as few-shot reference corpus for /api/ai-newsletter-compose.
 *
 * Expected folder layout (user path via env NEWSLETTER_CORPUS_DIR):
 *   <dir>/
 *     2026 2月HTML/
 *       2602 中文電子報.txt
 *       2602 英文電子報.txt
 *       2602 日文電子報.txt
 *     2026 3月HTML/
 *     ...
 *
 * Usage:
 *   NEWSLETTER_CORPUS_DIR="/c/Users/.../foo2" \
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   node scripts/import-newsletter-tone-samples.mjs
 *
 * Idempotency: each (language, period) pair is upserted — re-running updates
 * the row in place instead of creating duplicates.
 */

import fs from 'fs'
import path from 'path'

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY
const CORPUS_DIR = process.env.NEWSLETTER_CORPUS_DIR

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('ERROR: set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env.')
  process.exit(1)
}
if (!CORPUS_DIR) {
  console.error('ERROR: set NEWSLETTER_CORPUS_DIR env (folder containing month subfolders).')
  process.exit(1)
}

// Map filename keyword → language code
const LANG_MAP = [
  { kw: '中文', lang: 'zh-TW' },
  { kw: '英文', lang: 'en' },
  { kw: '日文', lang: 'ja' },
]

function detectLanguage(filename) {
  for (const { kw, lang } of LANG_MAP) {
    if (filename.includes(kw)) return lang
  }
  return null
}

// Extract period (e.g., "2604" → "2026-04") from filename leading digits
function parsePeriod(filename) {
  const m = filename.match(/^(\d{2})(\d{2})/)
  if (!m) return null
  const yy = parseInt(m[1], 10)
  const mm = parseInt(m[2], 10)
  if (yy < 0 || mm < 1 || mm > 12) return null
  return `20${String(yy).padStart(2, '0')}-${String(mm).padStart(2, '0')}`
}

// Rough HTML → plain text: strip tags, collapse whitespace, keep paragraph breaks
function htmlToPlainText(html) {
  return html
    .replace(/<(?:script|style)[^>]*>[\s\S]*?<\/(?:script|style)>/gi, '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n\n')
    .replace(/<\/h[1-6]\s*>/gi, '\n\n')
    .replace(/<\/li\s*>/gi, '\n')
    .replace(/<\/div\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// Extract first h2 / h1 content as title (for human readability in admin)
function extractTitle(html) {
  const m = html.match(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/i)
  if (!m) return null
  return m[1].replace(/<[^>]+>/g, '').trim().slice(0, 120)
}

const entries = []

for (const monthDir of fs.readdirSync(CORPUS_DIR)) {
  const full = path.join(CORPUS_DIR, monthDir)
  if (!fs.statSync(full).isDirectory()) continue
  for (const f of fs.readdirSync(full)) {
    if (!f.endsWith('.txt') && !f.endsWith('.html')) continue
    const filePath = path.join(full, f)
    const html = fs.readFileSync(filePath, 'utf-8')
    const language = detectLanguage(f)
    const period = parsePeriod(f)
    if (!language) { console.warn(`skip (no lang): ${f}`); continue }
    if (!period)   { console.warn(`skip (no period): ${f}`); continue }
    const plain = htmlToPlainText(html)
    const title = extractTitle(html)
    entries.push({
      language,
      period,
      title,
      html_content: html,
      plain_text: plain,
      source_file: f,
    })
  }
}

console.log(`Discovered ${entries.length} newsletter(s):`)
for (const e of entries) {
  console.log(`  [${e.language} · ${e.period}] ${e.source_file} — ${e.plain_text.length} chars plain`)
}

// Upsert via REST + on_conflict on (language, period)
// NOTE: table currently has no unique constraint on (language, period).
// Simplest: delete existing + insert. Keeps script idempotent.
async function call(pathPart, opts) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${pathPart}`, {
    ...opts,
    headers: {
      'apikey': SERVICE_ROLE,
      'Authorization': `Bearer ${SERVICE_ROLE}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
      ...(opts?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`${res.status} ${pathPart}: ${body}`)
  }
  return res
}

// Delete all existing rows for the periods + languages we're about to insert
const langs = [...new Set(entries.map((e) => e.language))]
const periods = [...new Set(entries.map((e) => e.period))]
const langFilter = `language=in.(${langs.map((l) => `"${l}"`).join(',')})`
const periodFilter = `period=in.(${periods.map((p) => `"${p}"`).join(',')})`
console.log(`\nDeleting existing rows with ${langFilter} AND ${periodFilter}...`)
await call(`/newsletter_tone_samples?${langFilter}&${periodFilter}`, { method: 'DELETE' })

console.log(`Inserting ${entries.length} rows...`)
await call('/newsletter_tone_samples', {
  method: 'POST',
  body: JSON.stringify(entries),
})

console.log('✓ Done.')
