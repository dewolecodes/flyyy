import { describe, it, expect, vi, beforeEach } from 'vitest'

// Use a hoist-safe mock factory for '@/libs/Org' and obtain the mock after import
vi.mock('@/libs/Org', () => ({ getOrganization: vi.fn() }))
// Provide a controllable mock for the DB to avoid real DB access in unit tests.
const rowsStore: { nextRows: any[] } = { nextRows: [] }
vi.mock('@/libs/DB', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () => rowsStore.nextRows,
      }),
    }),
    insert: () => ({ onConflictDoUpdate: async () => undefined }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
    transaction: async (fn: any) => {
      // naive transaction wrapper that calls the provided function with the same mock API
      const tx = {
        select: () => ({
          from: () => ({
            where: async () => rowsStore.nextRows,
          }),
        }),
        update: () => ({ set: () => ({ where: async () => undefined }) }),
      }
      return fn(tx)
    },
  },
  __mockControl: {
    setNextRows: (r: any[]) => { rowsStore.nextRows = r },
  },
}))

import * as Usage from '@/libs/Usage'
import { UsageLimitExceededError, UsageRecordCorruptError } from '@/libs/Usage'
import { getOrganization } from '@/libs/Org'
const mockGetOrganization = vi.mocked(getOrganization)
import * as DB from '@/libs/DB'
const __mockControl = (DB as any).__mockControl

describe('Usage and Entitlements enforcement (server-side)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('starter plan hits AI limit → blocked (UsageLimitExceededError)', async () => {
    mockGetOrganization.mockResolvedValue({ id: 'org-starter', plan: 'starter' })
    // starter AI monthlyLimit = 100 -> simulate stored count of 100
    __mockControl.setNextRows([{ count: '100' }])

    await expect(Usage.assertCanUseAI('org-starter')).rejects.toBeInstanceOf(UsageLimitExceededError)
  })

  it('growth plan allows AI under limit', async () => {
    mockGetOrganization.mockResolvedValue({ id: 'org-growth', plan: 'growth' })
    // growth AI monthlyLimit = 1000 -> simulate stored count of 10
    __mockControl.setNextRows([{ count: '10' }])

    await expect(Usage.assertCanUseAI('org-growth')).resolves.toBeUndefined()
  })

  it('scale plan allows unlimited publishing (no throw)', async () => {
    mockGetOrganization.mockResolvedValue({ id: 'org-scale', plan: 'scale' })
    // scale has Infinity published pages; simulate many published pages
    __mockControl.setNextRows(new Array(1000000).fill({}))

    await expect(Usage.assertCanPublish('org-scale')).resolves.toBeUndefined()
  })

  it('unknown plan → throws UsageRecordCorruptError', async () => {
    mockGetOrganization.mockResolvedValue({ id: 'org-unknown', plan: 'this-plan-does-not-exist' })
    // Ensure getAIUsage not invoked; but if invoked, return 0
    vi.spyOn(Usage, 'getAIUsage').mockResolvedValue(0)

    await expect(Usage.assertCanUseAI('org-unknown')).rejects.toBeInstanceOf(UsageRecordCorruptError)
  })

  it('corrupt usage count → blocked safely (UsageRecordCorruptError)', async () => {
    mockGetOrganization.mockResolvedValue({ id: 'org-corrupt', plan: 'starter' })
    // Simulate corrupt underlying usage storage by returning non-numeric count
    __mockControl.setNextRows([{ count: 'not-a-number' }])

    await expect(Usage.assertCanUseAI('org-corrupt')).rejects.toBeInstanceOf(UsageRecordCorruptError)
  })
})
