import { describe, it, expect, vi, beforeEach } from 'vitest'

// Partially mock Env to control global flags while preserving other exports
vi.mock('@/libs/Env', async (importOriginal) => {
  const actual = await importOriginal<any>()
  return {
    ...actual,
    isAIEnabled: false,
    isBillingEnabled: true,
  }
})

// Mock Org to return configurable features
const mockOrg: any = {}
vi.mock('@/libs/Org', () => ({
  getOrganization: async (id: string) => mockOrg[id] ?? null,
  default: async (id: string) => mockOrg[id] ?? null,
}))

import { isAIEnabled, isPublishingEnabled, isBillingEnabled } from '@/libs/FeatureFlags'
import { getOrganization } from '@/libs/Org'

describe('FeatureFlags', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    for (const k of Object.keys(mockOrg)) delete mockOrg[k]
  })

  it('defaults to global AI flag when no org override', async () => {
    // Env mock set isAIEnabled = false
    const res = await isAIEnabled('org-a')
    expect(res).toBe(false)
  })

  it('respects org-level AI override', async () => {
    mockOrg['org-a'] = { id: 'org-a', features: { aiEnabled: true } }
    const res = await isAIEnabled('org-a')
    expect(res).toBe(true)
  })

  it('publishing is enabled by default', async () => {
    const res = await isPublishingEnabled('org-b')
    expect(res).toBe(true)
  })

  it('respects org-level publishing override', async () => {
    mockOrg['org-b'] = { id: 'org-b', features: { publishingEnabled: false } }
    const res = await isPublishingEnabled('org-b')
    expect(res).toBe(false)
  })

  it('respects org-level billing override over global', async () => {
    // Env mock set isBillingEnabled = true
    mockOrg['org-c'] = { id: 'org-c', features: { billingEnabled: false } }
    const res = await isBillingEnabled('org-c')
    expect(res).toBe(false)
  })
})
