import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// orgSettings imports DEFAULT_ORG_ID from orgContext, which pulls in next/headers
// and the supabase factory at module load — stub both so the module tree loads
// under the node test environment.
vi.mock('next/headers', () => ({ cookies: vi.fn() }))
vi.mock('@/lib/supabase', () => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn(),
}))

type SysRow = { key: string; value: unknown }

/**
 * Fake service client covering the two reads getOrgSettings performs:
 *   from('organizations').select('settings').eq('id', orgId).maybeSingle()
 *   from('system_settings').select('key, value').in('key', missing)
 */
function makeService(
  opts: {
    orgSettings?: Record<string, unknown> | null
    sysRows?: SysRow[] | null
    throws?: boolean
  } = {},
) {
  const orgData = opts.orgSettings ? { settings: opts.orgSettings } : null
  const sysData = opts.sysRows ?? null
  const from = vi.fn((table: string) => {
    if (table === 'organizations') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() =>
              opts.throws
                ? Promise.reject(new Error('db down'))
                : Promise.resolve({ data: orgData }),
            ),
          })),
        })),
      }
    }
    if (table === 'system_settings') {
      return {
        select: vi.fn(() => ({
          in: vi.fn(() =>
            opts.throws
              ? Promise.reject(new Error('db down'))
              : Promise.resolve({ data: sysData }),
          ),
        })),
      }
    }
    throw new Error(`unexpected table: ${table}`)
  })
  return { service: { from } as unknown as SupabaseClient, from }
}

// The module holds a process-lifetime cache keyed by (org, key). Reset the module
// registry before each test and dynamic-import fresh so caches never leak across
// tests.
beforeEach(() => {
  vi.resetModules()
})

const load = () => import('@/lib/orgSettings')

describe('getOrgSettings — resolution chain', () => {
  it('uses organizations.settings when present', async () => {
    const { getOrgSetting } = await load()
    const { service } = makeService({ orgSettings: { org_name: 'Org JSONB Name' } })
    await expect(getOrgSetting(service, 'org_name', 'org-1')).resolves.toBe('Org JSONB Name')
  })

  it('falls back to system_settings when the org jsonb is missing', async () => {
    const { getOrgSetting } = await load()
    const { service } = makeService({ sysRows: [{ key: 'org_name', value: 'System Name' }] })
    await expect(getOrgSetting(service, 'org_name', 'org-2')).resolves.toBe('System Name')
  })

  it('prefers the org jsonb over system_settings', async () => {
    const { getOrgSetting } = await load()
    const { service } = makeService({
      orgSettings: { org_name: 'Org Wins' },
      sysRows: [{ key: 'org_name', value: 'System Loses' }],
    })
    await expect(getOrgSetting(service, 'org_name', 'org-3')).resolves.toBe('Org Wins')
  })

  it('falls back to the hardcoded constant when neither source has a value', async () => {
    const { getOrgSetting, ORG_SETTING_KEYS } = await load()
    const { service } = makeService({})
    await expect(getOrgSetting(service, 'org_name', 'org-4')).resolves.toBe(ORG_SETTING_KEYS.org_name)
  })

  it('treats a whitespace-only value as empty and falls through', async () => {
    const { getOrgSetting } = await load()
    const { service } = makeService({
      orgSettings: { org_name: '   ' },
      sysRows: [{ key: 'org_name', value: 'System Name' }],
    })
    await expect(getOrgSetting(service, 'org_name', 'org-5')).resolves.toBe('System Name')
  })

  it('resolves each key independently in a multi-key read', async () => {
    const { getOrgSettings } = await load()
    const { service } = makeService({
      orgSettings: { org_name: 'From Org' },
      sysRows: [{ key: 'owner_email', value: 'from-sys@x.io' }],
    })
    const values = await getOrgSettings(service, ['org_name', 'owner_email'], 'org-6')
    expect(values.org_name).toBe('From Org')
    expect(values.owner_email).toBe('from-sys@x.io')
  })
})

describe('getOrgSettings — error handling', () => {
  it('returns fallbacks when the client throws, and does not cache them', async () => {
    const { getOrgSetting, ORG_SETTING_KEYS } = await load()

    const failing = makeService({ throws: true })
    await expect(getOrgSetting(failing.service, 'org_name', 'org-7')).resolves.toBe(
      ORG_SETTING_KEYS.org_name,
    )

    // A later successful read for the same (org, key) must reach the DB — proving
    // the throwing path never cached the fallback.
    const working = makeService({ orgSettings: { org_name: 'Now Available' } })
    await expect(getOrgSetting(working.service, 'org_name', 'org-7')).resolves.toBe('Now Available')
  })
})

describe('getOrgSettings — caching', () => {
  it('serves the second read from cache without touching the DB', async () => {
    const { getOrgSetting } = await load()
    const { service, from } = makeService({ orgSettings: { org_name: 'Cached Value' } })

    await expect(getOrgSetting(service, 'org_name', 'org-8')).resolves.toBe('Cached Value')
    const callsAfterFirst = from.mock.calls.length

    await expect(getOrgSetting(service, 'org_name', 'org-8')).resolves.toBe('Cached Value')
    expect(from.mock.calls.length).toBe(callsAfterFirst)
  })

  it('caches per (org, key) — distinct orgs resolve independently', async () => {
    const { getOrgSetting } = await load()

    const a = makeService({ orgSettings: { org_name: 'Org A' } })
    const b = makeService({ orgSettings: { org_name: 'Org B' } })
    await expect(getOrgSetting(a.service, 'org_name', 'org-A')).resolves.toBe('Org A')
    await expect(getOrgSetting(b.service, 'org_name', 'org-B')).resolves.toBe('Org B')

    // Re-reading each org returns its own cached value even when handed a client
    // that would report something different.
    const aChanged = makeService({ orgSettings: { org_name: 'A Changed' } })
    const bChanged = makeService({ orgSettings: { org_name: 'B Changed' } })
    await expect(getOrgSetting(aChanged.service, 'org_name', 'org-A')).resolves.toBe('Org A')
    await expect(getOrgSetting(bChanged.service, 'org_name', 'org-B')).resolves.toBe('Org B')
  })
})
