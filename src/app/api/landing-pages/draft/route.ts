import { NextResponse } from 'next/server'
import { z } from 'zod'
import requireOrgContext from '@/libs/requireOrgContext'
import { mapErrorToResponse } from '@/libs/ApiErrors'

import { db } from '@/libs/DB'
import { landingPageSchema, landingPageVersionSchema } from '@/models/Schema'
import { eq, desc } from 'drizzle-orm'

const SavePayload = z.object({
  landingPageId: z.string().optional(),
  organizationId: z.string().optional(),
  slug: z.string().optional(),
  name: z.string().optional(),
  schema: z.any()
})

export async function GET(request: Request) {
  try {
    // Require authenticated org via Clerk. Only members of an org may read drafts.
    const { userId, orgId: clerkOrgId } = await requireOrgContext()

    const url = new URL(request.url)
    const landingPageId = url.searchParams.get('landingPageId')
    const slug = url.searchParams.get('slug')

    if (!landingPageId && !slug) {
      return NextResponse.json({ error: 'landingPageId or slug required' }, { status: 400 })
    }

    let whereClause: any
    if (landingPageId) {
      // Ensure the landing page belongs to the authenticated org
      const lp = (await db.select().from(landingPageSchema).where(eq(landingPageSchema.id, String(landingPageId))).limit(1))[0]
      if (!lp) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      if (String(lp.organizationId) !== String(clerkOrgId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      whereClause = eq(landingPageVersionSchema.landingPageId, String(landingPageId))
    } else {
      // slug path: ensure the slug belongs to this org
      const lp = (await db.select().from(landingPageSchema).where(eq(landingPageSchema.slug, String(slug))).limit(1))[0]
      if (!lp) return NextResponse.json({ schema: null })
      if (String(lp.organizationId) !== String(clerkOrgId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      whereClause = eq(landingPageVersionSchema.landingPageId, String(lp.id))
    }

    const rows = await db
      .select()
      .from(landingPageVersionSchema)
      .where(whereClause)
      .orderBy(desc(landingPageVersionSchema.createdAt))
      .limit(1)

    if (!rows || !rows[0]) return NextResponse.json({ schema: null })

    return NextResponse.json({ schema: rows[0].schema ?? null })
  } catch (err: any) {
    const mapped = mapErrorToResponse(err)
    return NextResponse.json(mapped.body, { status: mapped.status })
  }
}

export async function POST(request: Request) {
  try {
    // Require authenticated org via Clerk. Only members of an org may save drafts.
    const { userId, orgId: clerkOrgId } = await requireOrgContext()

    const body = await request.json()
    const parse = SavePayload.safeParse(body)
    if (!parse.success) return NextResponse.json({ error: 'Invalid payload', details: parse.error.format() }, { status: 400 })
    // Ignore any organizationId sent by the client; use Clerk org instead
    const { landingPageId, slug, name, schema } = parse.data

    let lpId = landingPageId

    // If landingPageId not provided, try to find by slug
    if (!lpId && slug) {
      const found = (await db.select().from(landingPageSchema).where(eq(landingPageSchema.slug, slug)).limit(1))[0]
      if (found) lpId = found.id
    }

    // Create landing_page row if missing and we have required fields
    if (!lpId) {
      if (!slug || !name) {
        return NextResponse.json({ error: 'Missing slug or name to create landing page' }, { status: 400 })
      }

      // Create a landing_page owned by the authenticated org
      const [inserted] = await db.insert(landingPageSchema).values({ organizationId: clerkOrgId, name, slug, status: 'draft' }).returning()
      if (!inserted || !inserted.id) return NextResponse.json({ error: 'Failed to create landing page' }, { status: 500 })
      lpId = String(inserted.id)
    }

    // Ensure landing_page belongs to this org before creating/updating versions
    const lp = (await db.select().from(landingPageSchema).where(eq(landingPageSchema.id, String(lpId))).limit(1))[0]
    if (!lp) return NextResponse.json({ error: 'Landing page not found' }, { status: 404 })
    if (String(lp.organizationId) !== String(clerkOrgId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Find existing draft (publishedAt IS NULL) and update it; otherwise insert new draft version
    const existingDraft = (await db.select().from(landingPageVersionSchema).where(eq(landingPageVersionSchema.landingPageId, lpId)).orderBy(desc(landingPageVersionSchema.createdAt)).limit(1))[0]

    if (existingDraft && existingDraft.publishedAt == null) {
      await db.update(landingPageVersionSchema).set({ schema }).where(eq(landingPageVersionSchema.id, existingDraft.id))
    } else {
      await db.insert(landingPageVersionSchema).values({ landingPageId: lpId, schema })
    }

    return NextResponse.json({ landingPageId: lpId })
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 })
  }
}
