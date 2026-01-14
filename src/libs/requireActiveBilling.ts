import { getOrganization } from './Org'
import { apiError, ErrorCodes } from './ApiErrors'
import { logger } from './Logger'

const ALLOWED = new Set(['active', 'trialing'])
const BLOCKED = new Set(['past_due', 'canceled', 'unpaid', 'incomplete'])

/**
 * Ensure the organization has an active (or trialing) Stripe subscription state.
 * Throws ApiErrors with codes `BILLING_REQUIRED` (402) or `SUBSCRIPTION_INACTIVE` (403).
 */
export async function requireActiveBilling(orgId: string) {
  try {
    if (!orgId) throw apiError(ErrorCodes.BILLING_REQUIRED, 'Organization billing required', 402)

    const org = await getOrganization(orgId)
    if (!org) {
      logger.warn({ orgId }, 'Billing check failed: organization not found')
      throw apiError(ErrorCodes.BILLING_REQUIRED, 'Organization billing required', 402)
    }

    // Prefer canonical subscription status column if present
    const status = (org.subscriptionStatus ?? org.stripeSubscriptionStatus ?? org.stripe_subscription_status ?? null) as string | null

    if (!status) {
      logger.warn({ orgId, org }, 'Billing check failed: no subscription status on org')
      throw apiError(ErrorCodes.BILLING_REQUIRED, 'Organization billing required', 402)
    }

    const s = String(status).toLowerCase()
    if (ALLOWED.has(s)) return true

    if (BLOCKED.has(s)) {
      logger.warn({ orgId, status: s }, 'Subscription inactive or delinquent')
      throw apiError(ErrorCodes.SUBSCRIPTION_INACTIVE, 'Subscription not active', 403)
    }

    // Unknown status treated as inactive
    logger.warn({ orgId, status: s }, 'Subscription status unknown, treating as inactive')
    throw apiError(ErrorCodes.SUBSCRIPTION_INACTIVE, 'Subscription not active', 403)
  } catch (err: any) {
    if (err && typeof err.code === 'string' && typeof err.status === 'number') throw err
    logger.error({ err: String(err), stack: String(err?.stack ?? '') }, 'Failed to evaluate billing status')
    throw apiError(ErrorCodes.SUBSCRIPTION_INACTIVE, 'Subscription not active', 403)
  }
}

export default requireActiveBilling
