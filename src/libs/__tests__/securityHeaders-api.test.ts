import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/libs/requireOrgContext', () => ({ default: async () => ({ userId: 'user1', orgId: 'org1' }) }))
vi.mock('@/libs/PlanGuard', () => ({ requirePlanAllowed: async () => undefined }))

describe('Security headers on protected API', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test'
    process.env.DATABASE_URL = 'postgres://x'
    process.env.CLERK_SECRET_KEY = 'clerk'
    process.env.STRIPE_SECRET_KEY = 'stripe'
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec'
    ;(globalThis as any)[Symbol.for('flyyy.envValidated')] = undefined
  })

  it('demo protected route includes security headers and disables caching', async () => {
    const mod = await import('@/app/api/demo/protected/route')
    const res = await mod.GET()
    const headers = res.headers
    expect(headers.get('Cache-Control')).toBe('no-store')
    expect(headers.get('Content-Security-Policy')).toBeTruthy()
    expect(headers.get('X-Frame-Options')).toBe('DENY')
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
  })
})
