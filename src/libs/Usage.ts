import { db } from '@/libs/DB'
import { aiUsageSchema, landingPageSchema } from '@/models/Schema'
import { sql, eq, and } from 'drizzle-orm'
import { getEntitlements, resolvePlanStrict } from '@/libs/Entitlements'
import { getOrganization } from '@/libs/Org'
import { logger } from '@/libs/Logger'

// Return YYYY-MM for current UTC month
export const getCurrentUsageWindow = (): string => {
  const now = new Date()
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}

export const getAIUsage = async (orgId: string): Promise<number> => {
  const period = getCurrentUsageWindow()
  const rows = await db
    .select()
    .from(aiUsageSchema)
    .where(and(eq(aiUsageSchema.organizationId, String(orgId)), eq(aiUsageSchema.period, period)))

  if (!rows || rows.length === 0) return 0
  // `count` column may be returned as string/number depending on driver
  const r: any = rows[0]
  const val = Number(r.count ?? NaN)
  if (!Number.isFinite(val)) {
    logger.error({ orgId, period, raw: r }, 'AI usage record corrupt: non-numeric count')
    throw new UsageRecordCorruptError('Invalid count value in usage row')
  }
  return val
}
export class UsageLimitExceededError extends Error {
  code = 'USAGE_LIMIT_EXCEEDED'
  constructor(message?: string) {
    super(message ?? 'Usage limit exceeded')
    this.name = 'UsageLimitExceededError'
  }
}

export class UsageRecordCorruptError extends Error {
  code = 'USAGE_RECORD_CORRUPT'
  constructor(message?: string) {
    super(message ?? 'Usage record corrupt')
    this.name = 'UsageRecordCorruptError'
  }
}

/**
 * Atomically increment AI usage for the current window. Creates the row if needed.
 * Uses an upsert (INSERT ... ON CONFLICT DO UPDATE) to be safe under concurrency.
 * Returns the new usage count as a number.
 */
export const incrementAIUsage = async (orgId: string): Promise<number> => {
  const period = getCurrentUsageWindow()

  try {
    await db
      .insert(aiUsageSchema)
      .values({ organizationId: String(orgId), period, count: 1 })
      .onConflictDoUpdate({
        target: [aiUsageSchema.organizationId, aiUsageSchema.period],
        set: { count: sql`${aiUsageSchema.count} + 1` },
      })

    // Re-read the current value to ensure we return a numeric count.
    const rows = await db
      .select()
      .from(aiUsageSchema)
      .where(and(eq(aiUsageSchema.organizationId, String(orgId)), eq(aiUsageSchema.period, period)))

    if (!rows || rows.length === 0) throw new UsageRecordCorruptError('Missing usage row after upsert')
    const r: any = rows[0]
    const val = Number(r.count ?? NaN)
    if (!Number.isFinite(val)) throw new UsageRecordCorruptError('Invalid count value in usage row')
    return val
  } catch (err: any) {
    // Log full DB error server-side and rethrow a generic, non-leaky error
    logger.error({ err: String(err), orgId }, 'Failed to increment AI usage')
    if (err instanceof UsageRecordCorruptError) throw err
    throw new UsageRecordCorruptError('Internal usage storage error')
  }
}

/**
 * Server-only assertion: throws `UsageLimitExceededError` when AI cannot be used.
 */
export const assertCanUseAI = async (orgId: string): Promise<void> => {
  const org = await getOrganization(orgId)
  if (!org || !org.plan) {
    logger.error({ orgId, org }, 'Organization missing or corrupt when checking AI allowance')
    throw new UsageRecordCorruptError('Organization missing or corrupt')
  }

  let plan: any
  try {
    plan = resolvePlanStrict(org.plan)
  } catch (e: any) {
    logger.error({ orgId, plan: org.plan }, 'Unknown organization plan when checking AI allowance')
    throw new UsageRecordCorruptError('Organization plan unknown')
  }

  const usage = await getAIUsage(orgId)
  const ent = getEntitlements(plan)
  const limit = ent.ai.monthlyLimit
  if (!ent.ai.enabled) {
    // Explicitly block when entitlements disable AI
    throw new UsageLimitExceededError('AI features disabled for this plan')
  }
  if (limit !== Infinity && usage >= limit) throw new UsageLimitExceededError('AI monthly quota exceeded')
}

export const getPublishedLandingPageCount = async (orgId: string): Promise<number> => {
  const rows = await db
    .select()
    .from(landingPageSchema)
    .where(and(eq(landingPageSchema.organizationId, String(orgId)), eq(landingPageSchema.status, 'published')))

  return Array.isArray(rows) ? rows.length : 0
}

/**
 * Server-only assertion: throws `UsageLimitExceededError` when publish is not allowed.
 */
export const assertCanPublish = async (orgId: string): Promise<void> => {
  const org = await getOrganization(orgId)
  if (!org || !org.plan) {
    logger.error({ orgId, org }, 'Organization missing or corrupt when checking publish allowance')
    throw new UsageRecordCorruptError('Organization missing or corrupt')
  }

  let plan: any
  try {
    plan = resolvePlanStrict(org.plan)
  } catch (e: any) {
    logger.error({ orgId, plan: org.plan }, 'Unknown organization plan when checking publish allowance')
    throw new UsageRecordCorruptError('Organization plan unknown')
  }

  const count = await getPublishedLandingPageCount(orgId)
  const ent = getEntitlements(plan)
  const limit = ent.landingPages.maxPublished
  if (limit !== Infinity && count >= limit) throw new UsageLimitExceededError('Publishing limit exceeded for plan')
}

// Backwards-compatible adapters: older callers passed `plan` from client code.
// Do not trust the client-provided `plan` — resolve plan server-side instead.
export async function assertAIUsageAllowed(orgId: string, _plan?: unknown): Promise<void> {
  return assertCanUseAI(orgId)
}

export async function assertPublishAllowed(orgId: string, _plan?: unknown): Promise<void> {
  return assertCanPublish(orgId)
}

export default {
  getCurrentUsageWindow,
  getAIUsage,
  incrementAIUsage,
  assertCanUseAI,
  getPublishedLandingPageCount,
  assertCanPublish,
}
