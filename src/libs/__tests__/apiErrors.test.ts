import { describe, it, expect, vi, beforeEach } from 'vitest'
import { apiError, mapErrorToResponse, ErrorCodes } from '@/libs/ApiErrors'
import { UsageLimitExceededError } from '@/libs/Usage'

vi.mock('@/libs/Logger', () => ({ logger: { error: vi.fn() } }))

describe('ApiErrors mapping', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('maps ApiError to response with provided status', () => {
    const e = apiError(ErrorCodes.FEATURE_DISABLED, 'AI off', 503)
    const mapped = mapErrorToResponse(e)
    expect(mapped.status).toBe(503)
    expect(mapped.body.error.code).toBe(ErrorCodes.FEATURE_DISABLED)
    expect(mapped.body.error.message).toBe('AI off')
  })

  it('maps UsageLimitExceededError to USAGE_LIMIT_EXCEEDED', () => {
    const ue = new UsageLimitExceededError('quota')
    const mapped = mapErrorToResponse(ue)
    expect(mapped.status).toBe(403)
    expect(mapped.body.error.code).toBe(ErrorCodes.USAGE_LIMIT_EXCEEDED)
  })

  it('maps unknown Error to INTERNAL_ERROR', () => {
    const e = new Error('boom')
    const mapped = mapErrorToResponse(e)
    expect(mapped.status).toBe(500)
    expect(mapped.body.error.code).toBe(ErrorCodes.INTERNAL_ERROR)
  })
})
