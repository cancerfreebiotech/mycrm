// One-off script: Hunter.io domain-search backfill for contacts missing company/job_title
// Run: node scripts/hunter-backfill.mjs

const SUPABASE_URL = 'https://zaqzqcvsckripotuujep.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InphcXpxY3ZzY2tyaXBvdHV1amVwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzQwNTY1MSwiZXhwIjoyMDg4OTgxNjUxfQ._pcd99Sf2bJ426g_F8yyMzbZb97gKzBSznYmX83RPgU'
const HUNTER_KEY = '9b13ca66d49bfb5cac324f25e4b4c23de27ce46b'
const HUNTER_BASE = 'https://api.hunter.io/v2'

const FREE_DOMAINS = new Set([
  'gmail.com','yahoo.com','yahoo.co.jp','yahoo.co.tw','yahoo.com.tw',
  'outlook.com','hotmail.com','hotmail.co.jp','live.com','msn.com',
  'icloud.com','me.com','mac.com','protonmail.com','proton.me',
  'qq.com','163.com','126.com','sina.com','sina.cn','googlemail.com',
])

async function sbFetch(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...opts,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
      ...opts.headers,
    },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Supabase ${res.status}: ${text}`)
  }
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

async function hunterDomainSearch(domain) {
  const url = `${HUNTER_BASE}/domain-search?domain=${encodeURIComponent(domain)}&limit=100&api_key=${HUNTER_KEY}`
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
  if (!res.ok) {
    const body = await res.text()
    console.log(`  Hunter HTTP ${res.status}: ${body.slice(0, 200)}`)
    return null
  }
  const json = await res.json()
  if (!json?.data) {
    console.log(`  Hunter 200 but no data field:`, JSON.stringify(json).slice(0, 200))
  }
  return json?.data ?? null
}

async function main() {
  // Fetch target contacts
  const contacts = await sbFetch(
    `/contacts?select=id,name,email,company,job_title&deleted_at=is.null&email=not.is.null&or=(name.is.null,and(company.is.null,job_title.is.null))`
  )

  const targets = contacts.filter(c => {
    const domain = c.email?.split('@')[1]?.toLowerCase()
    return domain && !FREE_DOMAINS.has(domain)
  })

  console.log(`Targets: ${targets.length} contacts`)

  // Group by domain
  const byDomain = {}
  for (const c of targets) {
    const domain = c.email.split('@')[1].toLowerCase()
    if (!byDomain[domain]) byDomain[domain] = []
    byDomain[domain].push(c)
  }

  const domains = Object.keys(byDomain)
  console.log(`Unique domains: ${domains.length}\n`)

  // Quick API sanity check with first domain before full run
  console.log(`── Sanity check: testing jp.kpmg.com directly`)
  const sanity = await hunterDomainSearch('jp.kpmg.com')
  console.log(`  Result: ${sanity ? `ok, org="${sanity.organization}", ${sanity.emails?.length ?? 0} emails` : 'null (see error above)'}\n`)

  let totalUpdated = 0

  for (const domain of domains) {
    const domainContacts = byDomain[domain]
    console.log(`\n── ${domain} (${domainContacts.length} contacts)`)

    const data = await hunterDomainSearch(domain)
    if (!data) {
      console.log('  Hunter: no response')
      continue
    }

    const org = data.organization ?? null
    const emails = data.emails ?? []
    console.log(`  Hunter: org="${org ?? 'n/a'}", ${emails.length} emails indexed`)

    for (const contact of domainContacts) {
      const norm = contact.email.toLowerCase()
      const found = emails.find(e => e.value?.toLowerCase() === norm)

      const updates = {}
      const enriched = []

      if (found) {
        const fullName = [found.first_name, found.last_name].filter(Boolean).join(' ').trim()
        if (fullName && (!contact.name || contact.name === contact.email)) {
          updates.name = fullName
          enriched.push(`name→${fullName}`)
        }
        if (found.position && !contact.job_title) {
          updates.job_title = found.position
          enriched.push(`title→${found.position}`)
        }
        if (found.linkedin && !contact.linkedin_url) {
          updates.linkedin_url = found.linkedin
          enriched.push('linkedin')
        }
        if (found.phone_number && !contact.phone) {
          updates.phone = found.phone_number
          enriched.push(`phone→${found.phone_number}`)
        }
      }

      if (org && !contact.company) {
        updates.company = org
        enriched.push(`company→${org}`)
      }

      if (Object.keys(updates).length === 0) {
        console.log(`  ${contact.email}: no new data`)
        continue
      }

      await sbFetch(`/contacts?id=eq.${contact.id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      })

      const logContent = `Hunter.io 自動補全：${enriched.join('、')}`
      await sbFetch('/interaction_logs', {
        method: 'POST',
        body: JSON.stringify({
          contact_id: contact.id,
          type: 'system',
          content: logContent,
        }),
      })

      console.log(`  ✓ ${contact.email}: ${enriched.join(', ')}`)
      totalUpdated++
    }

    // Small delay between domain searches to be polite to Hunter API
    await new Promise(r => setTimeout(r, 300))
  }

  // Check remaining credits
  const acct = await fetch(`${HUNTER_BASE}/account?api_key=${HUNTER_KEY}`).then(r => r.json())
  const remaining = (acct?.data?.requests?.searches?.available ?? '?') - (acct?.data?.requests?.searches?.used ?? 0)

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  console.log(`Updated: ${totalUpdated} contacts`)
  console.log(`Hunter credits remaining: ${remaining}`)
}

main().catch(err => { console.error(err); process.exit(1) })
