import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/libs/Logger', () => ({ logger: { warn: vi.fn(), error: vi.fn() } }))

const mockOrgStore: Record<string, any> = {}
vi.mock('@/libs/Org', () => ({
  getOrganization: async (id: string) => mockOrgStore[id] ?? null,
}))

import requireActiveBilling from '@/libs/requireActiveBilling'

describe('requireActiveBilling', () => {
  beforeEach(() => {
    for (const k of Object.keys(mockOrgStore)) delete mockOrgStore[k]
  })

  it('allows active subscription', async () => {
    mockOrgStore['org-a'] = { id: 'org-a', subscriptionStatus: 'active' }
    await expect(requireActiveBilling('org-a')).resolves.toBeTruthy()
  })

  it('allows trialing subscription', async () => {
    mockOrgStore['org-b'] = { id: 'org-b', subscriptionStatus: 'trialing' }
    await expect(requireActiveBilling('org-b')).resolves.toBeTruthy()
  })

  it('blocks past_due', async () => {
    mockOrgStore['org-c'] = { id: 'org-c', subscriptionStatus: 'past_due' }
    await expect(requireActiveBilling('org-c')).rejects.toMatchObject({ code: 'SUBSCRIPTION_INACTIVE' })
  })

  it('blocks canceled', async () => {
    mockOrgStore['org-d'] = { id: 'org-d', subscriptionStatus: 'canceled' }
    await expect(requireActiveBilling('org-d')).rejects.toMatchObject({ code: 'SUBSCRIPTION_INACTIVE' })
  })
})
