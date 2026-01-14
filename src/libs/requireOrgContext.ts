import { auth } from '@clerk/nextjs/server'
import { apiError, ErrorCodes } from './ApiErrors'
import { logger } from './Logger'

export type OrgContext = { userId: string; orgId: string }

/**
 * Server-only helper to ensure Clerk org auth context exists.
 * Throws ApiErrors with clear codes for consistent mapping.
 */
export async function requireOrgContext(): Promise<OrgContext> {
  try {
    const a = await auth()
    if (!a || !a.userId) {
      logger.warn({ auth: a }, 'Unauthenticated request: missing userId')
      throw apiError(ErrorCodes.UNAUTHENTICATED, 'User not authenticated', 401)
    }

    if (!a.orgId) {
      logger.warn({ userId: a.userId, auth: a }, 'Authenticated request missing organization context')
      throw apiError(ErrorCodes.ORG_REQUIRED, 'Organization context required', 403)
    }

    return { userId: String(a.userId), orgId: String(a.orgId) }
  } catch (err: any) {
    // Re-throw known ApiError instances to be handled by route mappers
    if (err && typeof err.code === 'string' && typeof err.status === 'number') throw err
    logger.error({ err: String(err), stack: String(err?.stack ?? '') }, 'Failed to resolve org auth context')
    throw apiError(ErrorCodes.INTERNAL_ERROR, 'Authentication failure', 500)
  }
}

export default requireOrgContext
