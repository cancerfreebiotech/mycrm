#!/usr/bin/env node
/**
 * Import SendGrid contact CSVs into newsletter_subscribers + link to lists.
 *
 * Assumes supabase/newsletter_subscribers.sql has already been applied
 * (creates the 3 tables + trigger + seeds the 4 default lists).
 *
 * Usage:
 *   node scripts/import-newsletter-subscribers.mjs \
 *     --csv path/to/zh-TW.csv   --list zh-TW \
 *     --csv path/to/en.csv      --list en \
 *     --csv path/to/ja.csv      --list ja \
 *     --csv path/to/marketing.csv --list zh-TW-marketing
 *
 *   # Env: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *
 * CSV column handling:
 *   - Required: `email` column (case-insensitive match, e.g. `Email`, `email_address`)
 *   - Optional: `first_name`, `last_name` (or `First Name`, `Last Name`)
 *   - Extra columns are captured into `metadata` JSONB verbatim.
 *
 * Behaviour:
 *   - Emails are trimmed + lowercased before dedup.
 *   - Same email appearing in multiple CSVs → ONE subscriber row, attached to
 *     all the specified lists (via newsletter_subscriber_lists).
 *   - Existing subscribers are NOT overwritten — only new list memberships
 *     are added (idempotent re-runs).
 *   - The DB trigger auto-links contact_id if a matching contact exists.
 *
 * NOTE: user must confirm actual CSV column names before running.
 * Tomorrow's first task: verify column header on one file, adjust
 * `COLUMN_ALIASES` below if needed.
 */

import fs from 'fs'
import path from 'path'

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('ERROR: set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env.')
  process.exit(1)
}

// Candidate column header aliases — normalized to lowercase, non-alphanumeric stripped
const COLUMN_ALIASES = {
  email: ['email', 'emailaddress', 'e_mail', 'mail'],
  first_name: ['firstname', 'givenname', 'first'],
  last_name: ['lastname', 'familyname', 'surname', 'last'],
}

function norm(h) {
  return h.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function parseArgs(argv) {
  const pairs = []
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--csv' && argv[i + 1]) {
      const csv = argv[++i]
      if (argv[i + 1] !== '--list') { throw new Error('expected --list after --csv') }
      i++
      const list = argv[++i]
      pairs.push({ csv, list })
    }
  }
  if (pairs.length === 0) throw new Error('no --csv/--list pairs provided')
  return pairs
}

// Minimal CSV parser (RFC 4180-ish). Handles quoted fields and embedded commas/newlines.
function parseCsv(text) {
  const rows = []
  let field = ''
  let row = []
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') { inQuotes = false }
      else { field += c }
    } else {
      if (c === '"') { inQuotes = true }
      else if (c === ',') { row.push(field); field = '' }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
      else if (c === '\r') { /* skip */ }
      else { field += c }
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row) }
  return rows
}

function mapHeaders(headers) {
  const map = { email: -1, first_name: -1, last_name: -1, extras: [] }
  headers.forEach((h, i) => {
    const n = norm(h)
    if (COLUMN_ALIASES.email.includes(n)) map.email = i
    else if (COLUMN_ALIASES.first_name.includes(n)) map.first_name = i
    else if (COLUMN_ALIASES.last_name.includes(n)) map.last_name = i
    else map.extras.push({ header: h, index: i })
  })
  if (map.email === -1) {
    throw new Error(
      `no email column found. Headers seen: ${headers.join(', ')}. ` +
      `Add alias to COLUMN_ALIASES.email if needed.`,
    )
  }
  return map
}

async function getListId(key) {
  const url = `${SUPABASE_URL}/rest/v1/newsletter_lists?key=eq.${encodeURIComponent(key)}&select=id`
  const res = await fetch(url, {
    headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` },
  })
  if (!res.ok) throw new Error(`lookup list failed: ${await res.text()}`)
  const rows = await res.json()
  if (rows.length === 0) throw new Error(`no list with key="${key}" (run supabase/newsletter_subscribers.sql first)`)
  return rows[0].id
}

async function upsertSubscribers(subscribers) {
  // Upsert by email (unique). on_conflict=email means existing rows are preserved
  // (Prefer: resolution=ignore-duplicates so we don't overwrite metadata/name).
  const url = `${SUPABASE_URL}/rest/v1/newsletter_subscribers?on_conflict=email`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=ignore-duplicates,return=representation',
    },
    body: JSON.stringify(subscribers),
  })
  if (!res.ok) throw new Error(`upsert subscribers failed (${res.status}): ${await res.text()}`)
  return res.json()
}

async function fetchSubscriberIdsByEmail(emails) {
  // PostgREST supports in.(a,b,c). Use citext-safe: emails already lowercased.
  const url = `${SUPABASE_URL}/rest/v1/newsletter_subscribers?select=id,email&email=in.(${
    emails.map((e) => `"${e.replace(/"/g, '\\"')}"`).join(',')
  })`
  const res = await fetch(url, {
    headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` },
  })
  if (!res.ok) throw new Error(`fetch subscriber ids failed: ${await res.text()}`)
  return res.json()
}

async function attachToList(subscriberIds, listId) {
  const rows = subscriberIds.map((id) => ({ subscriber_id: id, list_id: listId }))
  const url = `${SUPABASE_URL}/rest/v1/newsletter_subscriber_lists?on_conflict=subscriber_id,list_id`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=ignore-duplicates',
    },
    body: JSON.stringify(rows),
  })
  if (!res.ok) throw new Error(`attach to list failed (${res.status}): ${await res.text()}`)
}

async function importOne(csvPath, listKey) {
  console.log(`\n=== ${path.basename(csvPath)} → list="${listKey}" ===`)
  const text = fs.readFileSync(csvPath, 'utf8')
  const rows = parseCsv(text).filter((r) => r.length > 0 && r.some((c) => c !== ''))
  if (rows.length < 2) { console.log('  (empty)'); return }

  const headers = rows[0]
  const map = mapHeaders(headers)
  console.log(`  columns: email[${map.email}], first_name[${map.first_name}], last_name[${map.last_name}], extras[${map.extras.length}]`)

  const source = `csv_import_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`
  const batch = []
  const seenEmails = new Set()

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const rawEmail = (r[map.email] ?? '').trim().toLowerCase()
    if (!rawEmail || !rawEmail.includes('@')) continue
    if (seenEmails.has(rawEmail)) continue
    seenEmails.add(rawEmail)

    const metadata = {}
    for (const e of map.extras) {
      const v = r[e.index]
      if (v != null && v !== '') metadata[e.header] = v
    }

    batch.push({
      email: rawEmail,
      first_name: map.first_name >= 0 ? (r[map.first_name] ?? '').trim() || null : null,
      last_name: map.last_name >= 0 ? (r[map.last_name] ?? '').trim() || null : null,
      metadata,
      source,
    })
  }

  console.log(`  unique rows to upsert: ${batch.length}`)
  if (batch.length === 0) return

  // Upsert in chunks of 500
  const BATCH_SIZE = 500
  for (let i = 0; i < batch.length; i += BATCH_SIZE) {
    await upsertSubscribers(batch.slice(i, i + BATCH_SIZE))
  }

  const listId = await getListId(listKey)
  const emails = batch.map((b) => b.email)
  const attachBatch = []
  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    const slice = emails.slice(i, i + BATCH_SIZE)
    const rows = await fetchSubscriberIdsByEmail(slice)
    attachBatch.push(...rows.map((r) => r.id))
  }
  for (let i = 0; i < attachBatch.length; i += BATCH_SIZE) {
    await attachToList(attachBatch.slice(i, i + BATCH_SIZE), listId)
  }

  console.log(`  ✓ ${batch.length} subscribers upserted, attached to list "${listKey}"`)
}

async function main() {
  const pairs = parseArgs(process.argv)
  for (const p of pairs) {
    await importOne(p.csv, p.list)
  }
  console.log('\nAll CSVs imported. Run `SELECT count(*) FROM newsletter_subscribers WHERE contact_id IS NULL` to see how many are unlinked.')
}

main().catch((e) => {
  console.error('\nERROR:', e.message ?? e)
  process.exit(1)
})
