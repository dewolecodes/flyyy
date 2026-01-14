import { NextResponse } from 'next/server'
import requireOrgContext from '@/libs/requireOrgContext'
import { mapErrorToResponse } from '@/libs/ApiErrors'
import { db } from '@/libs/DB'
import { landingPageVersionSchema, landingPageSchema } from '@/models/Schema'
import { eq, desc, and } from 'drizzle-orm'

// Unpublish flow:
// - Require Clerk org auth and enforce org ownership of the landing page
// - Find latest published version (publishedAt IS NOT NULL) and set publishedAt = null
// - Update landing_page.status = 'draft'
// - Idempotent: if no published version exists, return success

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const landingPageId = params?.id
  if (!landingPageId) return NextResponse.json({ error: 'Missing landing page id' }, { status: 400 })

  try {
    const { userId, orgId: clerkOrgId } = await requireOrgContext()

    // Ensure the landing page belongs to this org
    const lp = (await db.select().from(landingPageSchema).where(eq(landingPageSchema.id, String(landingPageId))).limit(1))[0]
    if (!lp) return NextResponse.json({ error: 'Landing page not found' }, { status: 404 })
    if (String(lp.organizationId) !== String(clerkOrgId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Find latest published version
    const published = (await db
      .select()
      .from(landingPageVersionSchema)
      .where(and(eq(landingPageVersionSchema.landingPageId, String(landingPageId)), (landingPageVersionSchema.publishedAt as any).notEq(null)))
      .orderBy(desc(landingPageVersionSchema.publishedAt))
      .limit(1))[0]

    if (!published) {
      // Nothing to unpublish — idempotent success
      return NextResponse.json({ unpublished: true })
    }

    // Set the publishedAt to null for that version
    await db.update(landingPageVersionSchema).set({ publishedAt: null }).where(eq(landingPageVersionSchema.id, published.id))

    // Update landing_page status
    await db.update(landingPageSchema).set({ status: 'draft' }).where(eq(landingPageSchema.id, String(landingPageId)))

    return NextResponse.json({ unpublished: true })
  } catch (err: any) {
    const mapped = mapErrorToResponse(err)
    return NextResponse.json(mapped.body, { status: mapped.status })
  }
}
