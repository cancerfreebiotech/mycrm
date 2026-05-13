// Phase 09 — Storage migration
// Copies every object from source buckets to target buckets.
// Parallelism: 10 concurrent transfers (tunable via --concurrency=N).
// Resumable: skips objects that already exist on target with matching size.
//
// 7,606 objects · ~890 MB on source (cards 7240 + camcard 332 + newsletter-assets 34).
// Buckets are created during schema phase via the storage_and_rls migration.

import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mgmtSql, isDryRun } from './lib/clients.mjs'
import { env, requireKeys } from './lib/env.mjs'
import { loadState, recordPhase, saveState } from './lib/state.mjs'
import { makeLogger, fmtBytes, fmtNum } from './lib/log.mjs'
import { listAllRecursive } from './lib/storage.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROGRESS_PATH = join(__dirname, 'artifacts', 'storage-progress.json')
const log = makeLogger('09-storage')

requireKeys(['SOURCE_SUPABASE_URL', 'SOURCE_SERVICE_ROLE_KEY'])

const BUCKETS = ['cards', 'camcard', 'newsletter-assets']

function getConcurrency() {
  const arg = process.argv.find((a) => a.startsWith('--concurrency='))
  return arg ? parseInt(arg.split('=')[1], 10) : 10
}

async function copyOne(srcClient, tgtClient, bucket, obj, maxRetries = 3) {
  let lastErr
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const { data: blob, error: dlErr } = await srcClient.storage.from(bucket).download(obj.name)
      if (dlErr) throw new Error(dlErr.message)
      const buf = Buffer.from(await blob.arrayBuffer())
      const { error: upErr } = await tgtClient.storage.from(bucket).upload(obj.name, buf, {
        contentType: obj.mimetype,
        upsert: true,
      })
      if (upErr) throw new Error(upErr.message)
      return buf.length
    } catch (e) {
      lastErr = e
      // Brief backoff on retry
      if (attempt < maxRetries - 1) await new Promise((r) => setTimeout(r, 500 * (attempt + 1)))
    }
  }
  throw new Error(`${bucket}/${obj.name}: ${lastErr.message}`)
}

// Worker-pool concurrency (not flawed Promise.race approach).
async function runPool(items, concurrency, work) {
  const queue = items.slice()
  const results = []
  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift()
      const r = await work(item).catch((e) => ({ __error: e.message, item }))
      results.push(r)
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  await Promise.all(workers)
  return results
}

async function migrateBucket(bucket, srcClient, tgtClient, progress, dry) {
  log.step(`Bucket: ${bucket}`)
  const srcObjects = await listAllRecursive(srcClient, bucket)
  if (srcObjects === null) {
    log.warn(`Source bucket ${bucket} not found — skip`)
    return { bucket, total: 0, copied: 0, bytes: 0 }
  }
  const srcTotalBytes = srcObjects.reduce((a, o) => a + o.size, 0)
  log.info(`${fmtNum(srcObjects.length)} objects, ${fmtBytes(srcTotalBytes)}`)

  if (dry) {
    log.warn(`DRY: would copy ${srcObjects.length} objects, ${fmtBytes(srcTotalBytes)}`)
    return { bucket, total: srcObjects.length, copied: 0, bytes: 0, skipped: 0, dry: true }
  }

  // Build set of already-copied keys (from previous run or fresh target)
  const targetObjects = await listAllRecursive(tgtClient, bucket)
  const existing = new Set((targetObjects ?? []).map((o) => o.name))
  log.info(`${existing.size} objects already on target (resume)`)

  const concurrency = getConcurrency()
  const queue = srcObjects.filter((o) => !existing.has(o.name))
  log.info(`${queue.length} to copy with concurrency=${concurrency}`)

  let copied = 0, failed = 0, bytes = 0
  const errors = []
  const t0 = Date.now()
  let lastLogged = 0

  await runPool(queue, concurrency, async (obj) => {
    try {
      const n = await copyOne(srcClient, tgtClient, bucket, obj)
      copied++
      bytes += n
    } catch (e) {
      failed++
      errors.push({ key: obj.name, error: e.message })
    }
    // Periodic progress + checkpoint
    if (copied + failed - lastLogged >= 100) {
      lastLogged = copied + failed
      const elapsed = (Date.now() - t0) / 1000
      const rate = copied / elapsed
      const eta = (queue.length - copied) / Math.max(rate, 0.1)
      log.info(`  ${bucket}: ${copied}/${queue.length} (failed=${failed})  rate=${rate.toFixed(1)}/s  ETA=${(eta / 60).toFixed(1)}min`)
      progress[bucket] = { copied, failed, bytes }
      writeFileSync(PROGRESS_PATH, JSON.stringify(progress, null, 2))
    }
  })

  log.ok(`${bucket}: copied=${copied} failed=${failed} bytes=${fmtBytes(bytes)}`)
  progress[bucket] = { copied, failed, bytes, errors: errors.slice(0, 50) }
  writeFileSync(PROGRESS_PATH, JSON.stringify(progress, null, 2))
  return { bucket, total: srcObjects.length, copied, failed, bytes, errors: errors.slice(0, 50) }
}

async function main() {
  const dry = isDryRun()
  const state = loadState()
  const target = state.phases['01-create-target']
  if (!dry && !target?.projectRef) throw new Error('Phase 01 must complete first')

  const srcClient = createClient(env.SOURCE_SUPABASE_URL, env.SOURCE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
  const tgtClient = dry ? null : createClient(target.url, target.serviceRoleKey, {
    auth: { persistSession: false },
  })

  const progress = {}
  const results = []
  for (const b of BUCKETS) {
    const r = await migrateBucket(b, srcClient, tgtClient, progress, dry)
    results.push(r)
  }

  if (!dry) {
    recordPhase('09-storage', { results })
  }

  const totalCopied = results.reduce((a, r) => a + (r.copied ?? 0), 0)
  const totalBytes = results.reduce((a, r) => a + (r.bytes ?? 0), 0)
  const totalFailed = results.reduce((a, r) => a + (r.failed ?? 0), 0)
  log.ok(`Total: ${fmtNum(totalCopied)} objects, ${fmtBytes(totalBytes)}, ${totalFailed} failed`)
  if (totalFailed > 0) {
    log.err(`See ${PROGRESS_PATH} for failed keys`)
    process.exit(1)
  }
}

main().catch((e) => { log.err(e.message); process.exit(1) })
