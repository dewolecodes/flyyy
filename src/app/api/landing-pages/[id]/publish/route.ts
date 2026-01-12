import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/libs/DB'
import { landingPageVersionSchema, landingPageSchema } from '@/models/Schema'
import { eq, desc, and } from 'drizzle-orm'

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const landingPageId = params?.id
  if (!landingPageId) return NextResponse.json({ error: 'Missing landing page id' }, { status: 400 })

  try {
    // Require authenticated org via Clerk. Only members of an org may publish.
    const a = await auth();
    const clerkOrgId = a.orgId;
    if (!clerkOrgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

    // Ensure the landing page belongs to this org
    const lp = (await db.select().from(landingPageSchema).where(eq(landingPageSchema.id, String(landingPageId))).limit(1))[0]
    if (!lp) return NextResponse.json({ error: 'Landing page not found' }, { status: 404 })
    if (String(lp.organizationId) !== String(clerkOrgId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

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
        return NextResponse.json({ published: true })
      }

      return NextResponse.json({ error: 'No draft to publish' }, { status: 404 })
    }

    const now = new Date()

    // Mark the selected draft as published
    await db.update(landingPageVersionSchema).set({ publishedAt: now }).where(eq(landingPageVersionSchema.id, draft.id))

    // Unpublish any other versions for this landing page (ensure single published version)
    await db.update(landingPageVersionSchema).set({ publishedAt: null }).where(and(eq(landingPageVersionSchema.landingPageId, String(landingPageId)), (landingPageVersionSchema.id as any).notEq(draft.id)))

    // Update landing_page status
    await db.update(landingPageSchema).set({ status: 'published' }).where(eq(landingPageSchema.id, String(landingPageId)))

    return NextResponse.json({ published: true })
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 })
  }
}
