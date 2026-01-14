import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/libs/Logger', () => ({ logger: { warn: vi.fn(), error: vi.fn() } }))

let authReturn: any = {}
vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => authReturn,
}))

describe('requireOrgContext', () => {
  beforeEach(() => {
    vi.resetModules()
    authReturn = {}
  })

  it('throws UNAUTHENTICATED when userId missing', async () => {
    authReturn = { orgId: 'org-1' }
    const { default: requireOrgContext } = await import('@/libs/requireOrgContext')
    await expect(requireOrgContext()).rejects.toMatchObject({ code: 'UNAUTHENTICATED', status: 401 })
  })

  it('throws ORG_REQUIRED when orgId missing', async () => {
    authReturn = { userId: 'user-1' }
    const { default: requireOrgContext } = await import('@/libs/requireOrgContext')
    await expect(requireOrgContext()).rejects.toMatchObject({ code: 'ORG_REQUIRED', status: 403 })
  })

  it('returns context when both userId and orgId present', async () => {
    authReturn = { userId: 'user-1', orgId: 'org-1' }
    const { default: requireOrgContext } = await import('@/libs/requireOrgContext')
    await expect(requireOrgContext()).resolves.toMatchObject({ userId: 'user-1', orgId: 'org-1' })
  })
})
