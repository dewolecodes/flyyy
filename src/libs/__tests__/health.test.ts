import { describe, it, expect, beforeEach, vi } from 'vitest'

const fakeDb = {
  select: vi.fn(() => ({ from: () => ({ limit: vi.fn().mockResolvedValue([]) }) })),
}

vi.mock('@/libs/DB', () => ({ db: fakeDb }))
vi.mock('@clerk/nextjs/server', () => ({}))
vi.mock('stripe', () => ({}))

describe('GET /api/health', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test'
    process.env.DATABASE_URL = 'postgres://user:pass@localhost/db'
    process.env.CLERK_SECRET_KEY = 'clerk'
    process.env.STRIPE_SECRET_KEY = 'stripe'
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec'
    // reset mocks
    fakeDb.select.mockReset()
    fakeDb.select.mockImplementation(() => ({ from: () => ({ limit: vi.fn().mockResolvedValue([]) }) }))
    // clear the validate flag between tests
    ;(globalThis as any)[Symbol.for('flyyy.envValidated')] = undefined
  })

  it('returns 200 when all checks pass', async () => {
    // import the handler after mocks set up
    const mod = await import('@/app/api/health/route')
    const res = await mod.GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ok')
    expect(body.checks.db).toBe('ok')
    expect(body.checks.auth).toBe('ok')
    expect(body.checks.billing).toBe('ok')
    expect(body.checks.entitlements).toBe('ok')
  })

  it('returns 503 when db check fails', async () => {
    fakeDb.select.mockImplementation(() => ({ from: () => ({ limit: vi.fn().mockRejectedValue(new Error('db down')) }) }))
    const mod = await import('@/app/api/health/route')
    const res = await mod.GET()
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.status).toBe('degraded')
    expect(body.checks.db).toBe('fail')
  })
})
