import { db } from '@/libs/DB';
import { organizationSchema, landingPageSchema } from '@/models/Schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/libs/Logger';

export async function getOrganization(orgId: string): Promise<any> {
  try {
    const rows = await db.select().from(organizationSchema).where(eq(organizationSchema.id, String(orgId))).limit(1);
    return rows[0] ?? null;
  } catch (err: any) {
    // If the database schema is not fully migrated locally (missing columns),
    // fall back to selecting only the id to avoid crashing the app. Callers
    // should handle missing fields gracefully.
    try {
      const rows = await db.select({ id: organizationSchema.id }).from(organizationSchema).where(eq(organizationSchema.id, String(orgId))).limit(1);
      return rows[0] ?? null;
    } catch (e) {
      return null;
    }
  }
}

export async function getLandingPagesCount(orgId: string) {
  const rows = await db.select().from(landingPageSchema).where(eq(landingPageSchema.organizationId, String(orgId)));
  return Array.isArray(rows) ? rows.length : 0;
}

/**
 * Ensure a database organization exists for the given Clerk organization id.
 * Idempotent and safe to call multiple times. Returns the organization row or null.
 * Logs structured error but does not throw to avoid blocking authenticated requests.
 */
export async function ensureOrganizationRecord(clerkOrgId: string): Promise<any> {
  if (!clerkOrgId) return null;

  try {
    // Check for existing org first
    // Select only the `id` column to avoid referencing columns that may not
    // exist yet in older databases (e.g. `plan`). This makes the check resilient
    // to schema drift during local development.
    const existing = await db.select({ id: organizationSchema.id }).from(organizationSchema).where(eq(organizationSchema.id, String(clerkOrgId))).limit(1);
    if (existing && existing[0]) return existing[0];

    // Try to insert. Rely on primary key constraint to avoid duplicates in races.
    try {
      // Insert only the id. Avoid using `.returning()` because RETURNING * can
      // attempt to reference columns that may not exist in older local schemas
      // (causing errors like "column \"plan\" does not exist"). Instead,
      // insert and then re-query the inserted id using a safe select.
      await db.insert(organizationSchema).values({ id: clerkOrgId });

      const retryAfterInsert = await db
        .select({ id: organizationSchema.id })
        .from(organizationSchema)
        .where(eq(organizationSchema.id, String(clerkOrgId)))
        .limit(1);

      if (retryAfterInsert && retryAfterInsert[0]) return retryAfterInsert[0];
      return null;
    } catch (insertErr: any) {
      // If another process created the org concurrently, re-query and return that row.
      try {
        const retry = await db.select({ id: organizationSchema.id }).from(organizationSchema).where(eq(organizationSchema.id, String(clerkOrgId))).limit(1);
        if (retry && retry[0]) return retry[0];
      } catch (retryErr: any) {
        logger.error({ err: String(retryErr), clerkOrgId }, 'Failed to re-query organization after insert failure');
      }

      // Log the original insert error and return null (do not block the user)
      logger.error({ err: String(insertErr), clerkOrgId }, 'Failed to create organization record');
      return null;
    }
  } catch (err: any) {
    logger.error({ err: String(err), clerkOrgId }, 'Error ensuring organization record exists');
    return null;
  }
}

export default getOrganization;
