import { describe, it, expect, vi, beforeEach } from 'vitest'

// orgContext imports `cookies` from next/headers at module load; that module is
// not importable in the node test environment, so stub it. Only getOrgContext
// touches it and getOrgContext is out of scope here.
vi.mock('next/headers', () => ({ cookies: vi.fn() }))
// Replace the supabase factory so createServiceClient hands back a fake client.
vi.mock('@/lib/supabase', () => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn(),
}))

import { createServiceClient } from '@/lib/supabase'
import {
  orgScopedClient,
  systemOrgContext,
  DEFAULT_ORG_ID,
  type OrgContext,
} from '@/lib/orgContext'

const BUILDER_METHODS = ['select', 'insert', 'upsert', 'update', 'delete', 'eq'] as const

/** Chainable spy builder: every method records its call and returns the builder. */
function makeBuilder() {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {}
  for (const m of BUILDER_METHODS) builder[m] = vi.fn(() => builder)
  return builder
}

let fromSpy: ReturnType<typeof vi.fn>
let rpcSpy: ReturnType<typeof vi.fn>
let fakeService: { from: typeof fromSpy; rpc: typeof rpcSpy }

beforeEach(() => {
  vi.clearAllMocks()
  fromSpy = vi.fn(() => makeBuilder())
  rpcSpy = vi.fn()
  fakeService = { from: fromSpy, rpc: rpcSpy }
  vi.mocked(createServiceClient).mockReturnValue(
    fakeService as unknown as ReturnType<typeof createServiceClient>,
  )
})

const ctx = (orgId: string): OrgContext => ({ orgId, userId: null, email: null })
/** The builder produced by the most recent service.from(...) call. */
const lastBuilder = () => fromSpy.mock.results[fromSpy.mock.results.length - 1].value

describe('orgScopedClient — business tables', () => {
  it('appends .eq(org_id) after select', () => {
    orgScopedClient(ctx('org-A')).from('contacts').select('id, name')
    const builder = lastBuilder()
    expect(fromSpy).toHaveBeenCalledWith('contacts')
    expect(builder.select).toHaveBeenCalledWith('id, name', undefined)
    expect(builder.eq).toHaveBeenCalledWith('org_id', 'org-A')
  })

  it('appends .eq(org_id) after update', () => {
    orgScopedClient(ctx('org-A')).from('contacts').update({ name: 'x' })
    const builder = lastBuilder()
    expect(builder.update).toHaveBeenCalledWith({ name: 'x' }, undefined)
    expect(builder.eq).toHaveBeenCalledWith('org_id', 'org-A')
  })

  it('appends .eq(org_id) after delete', () => {
    orgScopedClient(ctx('org-A')).from('contacts').delete()
    const builder = lastBuilder()
    expect(builder.delete).toHaveBeenCalledWith(undefined)
    expect(builder.eq).toHaveBeenCalledWith('org_id', 'org-A')
  })

  it('injects org_id into an insert object', () => {
    orgScopedClient(ctx('org-A')).from('contacts').insert({ name: 'x' })
    const builder = lastBuilder()
    expect(builder.insert).toHaveBeenCalledWith({ name: 'x', org_id: 'org-A' }, undefined)
  })

  it('injects org_id into every row of an insert array', () => {
    orgScopedClient(ctx('org-A')).from('contacts').insert([{ name: 'a' }, { name: 'b' }])
    const builder = lastBuilder()
    expect(builder.insert).toHaveBeenCalledWith(
      [
        { name: 'a', org_id: 'org-A' },
        { name: 'b', org_id: 'org-A' },
      ],
      undefined,
    )
  })

  it('injects org_id on upsert and preserves options', () => {
    orgScopedClient(ctx('org-A')).from('contacts').upsert({ email: 'a@b.c' }, { onConflict: 'email' })
    const builder = lastBuilder()
    expect(builder.upsert).toHaveBeenCalledWith(
      { email: 'a@b.c', org_id: 'org-A' },
      { onConflict: 'email' },
    )
  })

  it('does not overwrite an org_id the caller already provided', () => {
    orgScopedClient(ctx('org-A')).from('contacts').insert({ name: 'x', org_id: 'org-EXPLICIT' })
    const builder = lastBuilder()
    expect(builder.insert).toHaveBeenCalledWith({ name: 'x', org_id: 'org-EXPLICIT' }, undefined)
  })

  it('only fills org_id for rows in an array that lack it', () => {
    orgScopedClient(ctx('org-A')).from('contacts').insert([{ name: 'a' }, { name: 'b', org_id: 'keep' }])
    const builder = lastBuilder()
    expect(builder.insert).toHaveBeenCalledWith(
      [
        { name: 'a', org_id: 'org-A' },
        { name: 'b', org_id: 'keep' },
      ],
      undefined,
    )
  })
})

describe('orgScopedClient — global tables (pass-through)', () => {
  it('returns the bare builder for a global table', () => {
    const api = orgScopedClient(ctx('org-A')).from('users')
    expect(api).toBe(lastBuilder())
  })

  it('does not inject an org_id filter on a global-table select', () => {
    const api = orgScopedClient(ctx('org-A')).from('users') as unknown as Record<string, (...args: unknown[]) => unknown>
    api.select('id')
    const builder = lastBuilder()
    expect(builder.select).toHaveBeenCalledWith('id')
    expect(builder.eq).not.toHaveBeenCalled()
  })

  it('does not inject org_id into a global-table insert', () => {
    const api = orgScopedClient(ctx('org-A')).from('users') as unknown as Record<string, (...args: unknown[]) => unknown>
    api.insert({ email: 'a@b.c' })
    const builder = lastBuilder()
    expect(builder.insert).toHaveBeenCalledWith({ email: 'a@b.c' })
  })
})

describe('orgScopedClient — escape hatches', () => {
  it('.raw exposes the bare service client', () => {
    expect(orgScopedClient(ctx('org-A')).raw).toBe(fakeService)
  })

  it('rpc forwards through to the service client', () => {
    orgScopedClient(ctx('org-A')).rpc('some_fn', { a: 1 })
    expect(rpcSpy).toHaveBeenCalledWith('some_fn', { a: 1 })
  })
})

describe('systemOrgContext', () => {
  it('defaults to DEFAULT_ORG_ID with null user/email', () => {
    expect(systemOrgContext()).toEqual({ orgId: DEFAULT_ORG_ID, userId: null, email: null })
    expect(DEFAULT_ORG_ID).toBe('00000000-0000-0000-0000-000000000001')
  })

  it('accepts a custom org id', () => {
    expect(systemOrgContext('org-XYZ')).toEqual({ orgId: 'org-XYZ', userId: null, email: null })
  })
})
