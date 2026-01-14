import { isAIEnabled as ENV_AI_ENABLED, isBillingEnabled as ENV_BILLING_ENABLED } from './Env'
import { getOrganization } from './Org'
import { logger } from './Logger'

type OrgLike = string | { id?: string; features?: any } | null | undefined

async function resolveOrgFeatures(org?: OrgLike) {
  if (!org) return null
  if (typeof org === 'string') {
    const row = await getOrganization(org)
    return row?.features ?? null
  }
  // object-like
  return (org as any).features ?? null
}

export async function isAIEnabled(org?: OrgLike): Promise<boolean> {
  try {
    const orgFeatures = await resolveOrgFeatures(org)
    // Org-level override wins when explicitly present
    if (orgFeatures && typeof orgFeatures.aiEnabled === 'boolean') return orgFeatures.aiEnabled
    return Boolean(ENV_AI_ENABLED)
  } catch (e: any) {
    logger.error({ err: String(e), org }, 'Failed to resolve feature flags for AI');
    return Boolean(ENV_AI_ENABLED)
  }
}

export async function isPublishingEnabled(org?: OrgLike): Promise<boolean> {
  try {
    const orgFeatures = await resolveOrgFeatures(org)
    if (orgFeatures && typeof orgFeatures.publishingEnabled === 'boolean') return orgFeatures.publishingEnabled
    // Default: publishing enabled unless explicitly disabled via env later
    return true
  } catch (e: any) {
    logger.error({ err: String(e), org }, 'Failed to resolve feature flags for publishing');
    return true
  }
}

export async function isBillingEnabled(org?: OrgLike): Promise<boolean> {
  try {
    const orgFeatures = await resolveOrgFeatures(org)
    if (orgFeatures && typeof orgFeatures.billingEnabled === 'boolean') return orgFeatures.billingEnabled
    return Boolean(ENV_BILLING_ENABLED)
  } catch (e: any) {
    logger.error({ err: String(e), org }, 'Failed to resolve feature flags for billing');
    return Boolean(ENV_BILLING_ENABLED)
  }
}

export default {
  isAIEnabled,
  isPublishingEnabled,
  isBillingEnabled,
}
