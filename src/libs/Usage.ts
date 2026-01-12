import { db } from '@/libs/DB'
import { aiUsageSchema, landingPageSchema } from '@/models/Schema'
import { sql, eq, and } from 'drizzle-orm'
import type { Plan } from '@/libs/Entitlements'
import { getEntitlements } from '@/libs/Entitlements'

// Return YYYY-MM for current UTC month
export function getCurrentUsageWindow(): string {
  const now = new Date()
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}

export async function getAIUsage(orgId: string): Promise<number> {
  const period = getCurrentUsageWindow()
  const rows = await db
    .select()
    .from(aiUsageSchema)
    .where(and(eq(aiUsageSchema.organizationId, String(orgId)), eq(aiUsageSchema.period, period)))

  if (!rows || rows.length === 0) return 0
  // `count` column may be returned as string/number depending on driver
  const r: any = rows[0]
  return Number(r.count ?? 0)
}

export async function incrementAIUsage(orgId: string): Promise<void> {
  const period = getCurrentUsageWindow()

  // Try upsert: update if exists, otherwise insert
  try {
    await db
      .insert(aiUsageSchema)
      .values({ organizationId: String(orgId), period, count: 1 })
      .onConflictDoUpdate({ target: [aiUsageSchema.organizationId, aiUsageSchema.period], set: { count: sql`${aiUsageSchema.count} + 1` } })
  } catch (e) {
    // As a last resort, attempt an update then insert fallback
    try {
      const updated = await db
        .update(aiUsageSchema)
        .set({ count: sql`${aiUsageSchema.count} + 1` })
        .where(and(eq(aiUsageSchema.organizationId, String(orgId)), eq(aiUsageSchema.period, period)))

      if (!updated || (Array.isArray(updated) && updated.length === 0)) {
        await db.insert(aiUsageSchema).values({ organizationId: String(orgId), period, count: 1 })
      }
    } catch (err) {
      // Do not throw to avoid blocking primary flow; caller may choose to log.
      // Keep deterministic behaviour: swallow DB increment errors.
    }
  }
}

export async function assertAIUsageAllowed(orgId: string, plan: Plan): Promise<void> {
  const usage = await getAIUsage(orgId)
  const ent = getEntitlements(plan)
  if (!ent.ai.enabled) throw new Error('AI usage limit reached for current plan')
  const limit = ent.ai.monthlyLimit
  if (limit !== Infinity && usage >= limit) {
    throw new Error('AI usage limit reached for current plan')
  }
}

export async function getPublishedLandingPageCount(orgId: string): Promise<number> {
  const rows = await db
    .select()
    .from(landingPageSchema)
    .where(and(eq(landingPageSchema.organizationId, String(orgId)), eq(landingPageSchema.status, 'published')))

  return Array.isArray(rows) ? rows.length : 0
}

export async function assertPublishAllowed(orgId: string, plan: Plan): Promise<void> {
  const count = await getPublishedLandingPageCount(orgId)
  const ent = getEntitlements(plan)
  const limit = ent.landingPages.maxPublished
  if (limit !== Infinity && count >= limit) {
    throw new Error('Publishing limit exceeded for current plan')
  }
}

export default {
  getCurrentUsageWindow,
  getAIUsage,
  incrementAIUsage,
  assertAIUsageAllowed,
  getPublishedLandingPageCount,
  assertPublishAllowed,
}
