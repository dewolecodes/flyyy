import { describe, it, expect, beforeEach, afterEach } from 'vitest'

const ORIGINAL_ENV = { ...process.env }

describe('validateEnv', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV }
    ;(globalThis as any)[Symbol.for('flyyy.envValidated')] = undefined
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
    // clear module cache to allow re-import/re-evaluation between tests
    Object.keys(require.cache).forEach((k) => delete require.cache[k])
    ;(globalThis as any)[Symbol.for('flyyy.envValidated')] = undefined
  })

  it('does not throw when all required env vars are present', async () => {
    process.env.NODE_ENV = 'test'
    process.env.DATABASE_URL = 'postgres://user:pass@localhost/db'
    process.env.CLERK_SECRET_KEY = 'clerk'
    process.env.STRIPE_SECRET_KEY = 'stripe'
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec'

    const mod = await import('@/libs/validateEnv')
    expect(() => mod.validateEnv()).not.toThrow()
  })

  it('throws when required env vars are missing and lists the missing keys', async () => {
    process.env = { ...ORIGINAL_ENV }
    delete process.env.CLERK_SECRET_KEY
    delete process.env.STRIPE_SECRET_KEY
    process.env.NODE_ENV = 'test'
    process.env.DATABASE_URL = 'postgres://x'

    const mod = await import('@/libs/validateEnv')
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(() => mod.validateEnv()).toThrow(/CLERK_SECRET_KEY|STRIPE_SECRET_KEY/)
    } finally {
      spy.mockRestore()
    }
  })
})
