import { NextResponse } from 'next/server'
import requireOrgContext from '@/libs/requireOrgContext'
import { db } from '@/libs/DB'
import { landingPageVersionSchema, landingPageSchema } from '@/models/Schema'
import { eq, desc, and } from 'drizzle-orm'
import { assertPublishAllowed } from '@/libs/Usage'
import { isPublishingEnabled } from '@/libs/FeatureFlags'
import { mapErrorToResponse } from '@/libs/ApiErrors'
import { applySecurityHeaders } from '@/libs/SecurityHeaders'
import { getOrganization } from '@/libs/Org'
import type { Plan } from '@/libs/Entitlements'

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const landingPageId = params?.id
  if (!landingPageId) return NextResponse.json({ error: 'Missing landing page id' }, { status: 400 })

  try {
    // Require authenticated org via Clerk. Only members of an org may publish.
    const { userId, orgId: clerkOrgId } = await requireOrgContext()

    // Ensure the landing page belongs to this org
    const lp = (await db.select().from(landingPageSchema).where(eq(landingPageSchema.id, String(landingPageId))).limit(1))[0]
    if (!lp) {
      const r = NextResponse.json({ error: 'Landing page not found' }, { status: 404 })
      r.headers.set('Cache-Control', 'no-store')
      try { applySecurityHeaders(r.headers) } catch (e) {}
      return r
    }
    if (String(lp.organizationId) !== String(clerkOrgId)) {
      const r = NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      r.headers.set('Cache-Control', 'no-store')
      try { applySecurityHeaders(r.headers) } catch (e) {}
      return r
    }

      // Enforce billing, then publishing feature flag per-organization
      const requireActiveBilling = (await import('@/libs/requireActiveBilling')).default
      await requireActiveBilling(clerkOrgId)

      const publishAllowed = await isPublishingEnabled(clerkOrgId)
      if (!publishAllowed) throw new Error('Publishing disabled for organization')

    // Find latest draft (published_at IS NULL)
    const draft = (await db
      .select()
      .from(landingPageVersionSchema)
      .where(and(eq(landingPageVersionSchema.landingPageId, String(landingPageId)), eq(landingPageVersionSchema.publishedAt, null as any)))
      .orderBy(desc(landingPageVersionSchema.createdAt))
      .limit(1))[0]
    // If there's no draft, publishing is idempotent: if a published version already exists, return success.
    if (!draft) {
      const existingPublished = (await db
        .select()
        .from(landingPageVersionSchema)
        .where(and(eq(landingPageVersionSchema.landingPageId, String(landingPageId)), (landingPageVersionSchema.publishedAt as any).notEq(null)))
        .orderBy(desc(landingPageVersionSchema.publishedAt))
        .limit(1))[0]

      if (existingPublished) {
        // Already published — idempotent success
        const r = NextResponse.json({ published: true })
        r.headers.set('Cache-Control', 'no-store')
        try { applySecurityHeaders(r.headers) } catch (e) {}
        return r
      }

      const r = NextResponse.json({ error: 'No draft to publish' }, { status: 404 })
      r.headers.set('Cache-Control', 'no-store')
      try { applySecurityHeaders(r.headers) } catch (e) {}
      return r
    }

    const now = new Date()

    // Enforce publishing limits only if this action will increase the total published count.
    // If the landing page is already `published`, replacing the published version does not change the count.
    if (String(lp.status) !== 'published') {
      function mapOrgPlan(p?: string | null): Plan {
        if (!p) return 'starter'
        const s = String(p).toLowerCase()
        if (s === 'starter' || s === 'growth' || s === 'scale') return s as Plan
        if (s === 'free') return 'starter'
        if (s === 'basic') return 'growth'
        if (s === 'pro') return 'scale'
        return 'starter'
      }

      const orgRow = await getOrganization(clerkOrgId)
      const plan = mapOrgPlan(orgRow?.plan ?? undefined)
      try {
        await assertPublishAllowed(clerkOrgId, plan)
      } catch (err: any) {
        const r = NextResponse.json({ error: String(err?.message ?? err) }, { status: 403 })
        r.headers.set('Cache-Control', 'no-store')
        try { applySecurityHeaders(r.headers) } catch (e) {}
        return r
      }
    }

    // Mark the selected draft as published
    await db.update(landingPageVersionSchema).set({ publishedAt: now }).where(eq(landingPageVersionSchema.id, draft.id))

    // Unpublish any other versions for this landing page (ensure single published version)
    await db.update(landingPageVersionSchema).set({ publishedAt: null }).where(and(eq(landingPageVersionSchema.landingPageId, String(landingPageId)), (landingPageVersionSchema.id as any).notEq(draft.id)))

    // Update landing_page status
    await db.update(landingPageSchema).set({ status: 'published' }).where(eq(landingPageSchema.id, String(landingPageId)))

    const ok = NextResponse.json({ published: true })
    ok.headers.set('Cache-Control', 'no-store')
    try { applySecurityHeaders(ok.headers) } catch (e) {}
    return ok
  } catch (err: any) {
    const mapped = mapErrorToResponse(err)
    const r = NextResponse.json(mapped.body, { status: mapped.status })
    r.headers.set('Cache-Control', 'no-store')
    try { applySecurityHeaders(r.headers) } catch (e) {}
    return r
  }
}

export const runtime = 'nodejs'
