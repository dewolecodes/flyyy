import { logger } from './Logger'

export const ErrorCodes = {
  FEATURE_DISABLED: 'FEATURE_DISABLED',
  USAGE_LIMIT_EXCEEDED: 'USAGE_LIMIT_EXCEEDED',
  ENTITLEMENT_REQUIRED: 'ENTITLEMENT_REQUIRED',
  BILLING_DISABLED: 'BILLING_DISABLED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  ORG_REQUIRED: 'ORG_REQUIRED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes]

export interface ApiError extends Error {
  code: ErrorCode | string
  status?: number
}

export function apiError(code: ErrorCode | string, message: string, status = 500): ApiError {
  const e = new Error(message) as ApiError
  e.code = code
  e.status = status
  return e
}

export function mapErrorToResponse(err: any) {
  // Log full details server-side only
  try {
    logger.error({ err: String(err), stack: String(err?.stack ?? ''), name: err?.name, code: err?.code }, 'API error')
  } catch (e) {
    // ignore logging failures
  }

  // If it's an ApiError produced by our helpers, use that mapping
  if (err && typeof err.code === 'string' && typeof err.status === 'number') {
    return {
      status: err.status,
      body: { error: { code: String(err.code), message: String(err.message ?? '') } },
    }
  }

    // Known internal error types
    if (err?.code === 'USAGE_LIMIT_EXCEEDED' || err?.name === 'UsageLimitExceededError') {
      return { status: 403, body: { error: { code: ErrorCodes.USAGE_LIMIT_EXCEEDED, message: String(err.message ?? 'Usage limit exceeded') } } }
    }

    if (err?.code === 'USAGE_RECORD_CORRUPT' || err?.name === 'UsageRecordCorruptError' || err?.message?.toLowerCase?.().includes('plan unknown') || err?.message?.toLowerCase?.().includes('missing or corrupt')) {
      return { status: 403, body: { error: { code: ErrorCodes.ENTITLEMENT_REQUIRED, message: 'Organization entitlements could not be verified' } } }
    }

  if (err?.code === 'UNAUTHENTICATED' || err?.code === ErrorCodes.UNAUTHENTICATED) {
    return { status: 401, body: { error: { code: ErrorCodes.UNAUTHENTICATED, message: 'Authentication required' } } }
  }

  if (err?.code === 'ORG_REQUIRED' || err?.code === ErrorCodes.ORG_REQUIRED) {
    return { status: 403, body: { error: { code: ErrorCodes.ORG_REQUIRED, message: 'Organization context required' } } }
  }

  

  if (err?.code === 'BILLING_DISABLED') {
    return { status: 403, body: { error: { code: ErrorCodes.BILLING_DISABLED, message: 'Billing disabled for organization' } } }
  }

  // Feature-disabled messages (textual match fallback)
  if (String(err?.message ?? '').toLowerCase().includes('disabled')) {
    return { status: 403, body: { error: { code: ErrorCodes.FEATURE_DISABLED, message: String(err?.message ?? 'Feature disabled') } } }
  }

  // Default: internal error
  return { status: 500, body: { error: { code: ErrorCodes.INTERNAL_ERROR, message: 'Internal server error' } } }
}

export default {
  apiError,
  mapErrorToResponse,
  ErrorCodes,
}
