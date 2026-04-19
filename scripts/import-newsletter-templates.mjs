#!/usr/bin/env node
/**
 * Import the 3 newsletter skeleton HTMLs under docs/newsletter-templates/
 * into the email_templates table as reusable templates.
 *
 * Usage:
 *   # First, set env vars:
 *   #   export SUPABASE_URL=https://xxx.supabase.co
 *   #   export SUPABASE_SERVICE_ROLE_KEY=...
 *   #   (or use NEXT_PUBLIC_SUPABASE_URL if you prefer)
 *   node scripts/import-newsletter-templates.mjs
 *
 * Idempotency: uses upsert on `title`. Re-running updates in place.
 *
 * Note on storage: the skeletons have {{logo_url}}, {{facebook_url}} etc.
 * placeholders that must be provided when composing an actual newsletter
 * (either by the /api/ai-newsletter-compose endpoint or by the admin UI).
 * This script just seeds the raw skeleton — no variables substituted yet.
 */

import fs from 'fs'
import path from 'path'

const SUPABASE_URL =
  process.env.SUPABASE_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error(
    'ERROR: set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env (or NEXT_PUBLIC_SUPABASE_URL).',
  )
  process.exit(1)
}

const TEMPLATES = [
  {
    key: 'newsletter-zh-TW',
    title: 'Newsletter Skeleton — 中文月報',
    subject: '', // user fills per-send
    file: 'docs/newsletter-templates/skeleton-zh-TW.html',
  },
  {
    key: 'newsletter-en',
    title: 'Newsletter Skeleton — English',
    subject: '',
    file: 'docs/newsletter-templates/skeleton-en.html',
  },
  {
    key: 'newsletter-ja',
    title: 'Newsletter Skeleton — 日本語',
    subject: '',
    file: 'docs/newsletter-templates/skeleton-ja.html',
  },
]

async function upsertTemplate({ title, subject, body_content }) {
  const url = `${SUPABASE_URL}/rest/v1/email_templates?on_conflict=title`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify({ title, subject, body_content }),
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`upsert failed (${res.status}): ${txt}`)
  }
  return res.json()
}

async function main() {
  for (const t of TEMPLATES) {
    const p = path.join(process.cwd(), t.file)
    if (!fs.existsSync(p)) {
      console.error(`  ✗ missing file: ${t.file}`)
      continue
    }
    const html = fs.readFileSync(p, 'utf8')
    console.log(`  → upserting "${t.title}" (${html.length} bytes)`)
    try {
      await upsertTemplate({ title: t.title, subject: t.subject, body_content: html })
      console.log(`    ✓ done`)
    } catch (e) {
      console.error(`    ✗ ${e.message ?? e}`)
    }
  }
  console.log('All done.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
