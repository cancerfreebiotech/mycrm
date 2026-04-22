#!/usr/bin/env node
/**
 * Migrate newsletter HTML images from listmonk CDN to our Supabase Storage
 * (bucket: newsletter-assets). One-off script for the April 2026 zh-TW
 * newsletter — mirrors all listmonk image URLs, uploads them under
 * `<period>/<filename>`, and rewrites the campaign HTML to point at
 * the new public Storage URLs.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   CAMPAIGN_SLUG=2026-04-zh-tw PERIOD_FOLDER=2026-04 \
 *   node scripts/migrate-newsletter-images.mjs
 */

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://zaqzqcvsckripotuujep.supabase.co'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const CAMPAIGN_SLUG = process.env.CAMPAIGN_SLUG ?? '2026-04-zh-tw'
const PERIOD = process.env.PERIOD_FOLDER ?? '2026-04'
const BUCKET = 'newsletter-assets'

if (!KEY) { console.error('need SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }

const SUPABASE_HEADERS = { apikey: KEY, Authorization: `Bearer ${KEY}` }

// Sanitize filename for Supabase Storage key (ASCII-only). If any non-ASCII
// remains after basic cleaning, replace the basename with an 8-char hash of
// the original URL, preserving the extension.
import crypto from 'node:crypto'

function sanitizeFilename(srcUrl) {
  const pathPart = srcUrl.split('?')[0].split('/').pop() ?? ''
  const decoded = decodeURIComponent(pathPart)
  const dot = decoded.lastIndexOf('.')
  const ext = dot >= 0 ? decoded.slice(dot).toLowerCase() : ''
  const base = dot >= 0 ? decoded.slice(0, dot) : decoded
  const cleaned = base
    .replace(/[()（）【】\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  // Storage rejects non-ASCII keys → if anything non-ASCII remains, use hash
  // eslint-disable-next-line no-control-regex
  if (/[^\x00-\x7F]/.test(cleaned)) {
    const hash = crypto.createHash('sha256').update(srcUrl).digest('hex').slice(0, 8)
    return `asset-${hash}${ext}`
  }
  return `${cleaned}${ext}`
}

function publicUrl(path) {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`
}

async function fetchCampaign() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/newsletter_campaigns?select=id,content_html&slug=eq.${CAMPAIGN_SLUG}`,
    { headers: SUPABASE_HEADERS },
  )
  const rows = await res.json()
  if (!rows[0]) throw new Error(`campaign not found: ${CAMPAIGN_SLUG}`)
  return rows[0]
}

async function uploadOne(srcUrl, destPath) {
  // 1. Download from listmonk
  const dl = await fetch(srcUrl)
  if (!dl.ok) throw new Error(`download ${srcUrl}: ${dl.status}`)
  const contentType = dl.headers.get('content-type') ?? 'application/octet-stream'
  const buf = Buffer.from(await dl.arrayBuffer())

  // 2. Upload to Supabase Storage (upsert: true so re-runs replace)
  const up = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${destPath}`,
    {
      method: 'POST',
      headers: {
        ...SUPABASE_HEADERS,
        'Content-Type': contentType,
        'x-upsert': 'true',
      },
      body: buf,
    },
  )
  if (!up.ok) throw new Error(`upload ${destPath}: ${up.status} ${await up.text()}`)
  return publicUrl(destPath)
}

async function updateCampaign(id, newHtml) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/newsletter_campaigns?id=eq.${id}`,
    {
      method: 'PATCH',
      headers: { ...SUPABASE_HEADERS, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ content_html: newHtml }),
    },
  )
  if (!res.ok) throw new Error(`update campaign: ${res.status} ${await res.text()}`)
}

async function main() {
  const campaign = await fetchCampaign()
  const html = campaign.content_html

  // Extract all listmonk URLs (dedupe)
  const re = /https:\/\/listmonk\.avatarmedicine\.xyz\/uploads\/[^"'\s<>]+/g
  const urls = [...new Set(html.match(re) ?? [])]
  console.log(`Found ${urls.length} listmonk URLs`)

  const urlMap = {}
  for (const src of urls) {
    const filename = sanitizeFilename(src)
    const destPath = `${PERIOD}/${filename}`
    console.log(`  ↓ ${src}\n    → ${destPath}`)
    try {
      const newUrl = await uploadOne(src, destPath)
      urlMap[src] = newUrl
      console.log(`    ✓ ${newUrl}`)
    } catch (e) {
      console.error(`    ✗ ${e.message}`)
    }
  }

  console.log(`\nReplacing ${Object.keys(urlMap).length} URLs in HTML...`)
  let newHtml = html
  for (const [src, dst] of Object.entries(urlMap)) {
    newHtml = newHtml.split(src).join(dst)
  }
  await updateCampaign(campaign.id, newHtml)
  console.log('✓ Campaign HTML updated.')

  // Summary
  console.log('\n=== URL map ===')
  for (const [src, dst] of Object.entries(urlMap)) {
    console.log(`${src}\n  → ${dst}`)
  }
}

main().catch((e) => { console.error('\nERR:', e.message); process.exit(1) })
