import { NextResponse } from 'next/server';
import requireOrgContext from '@/libs/requireOrgContext'
import { mapErrorToResponse } from '@/libs/ApiErrors'
import { z } from 'zod';

import { db } from '@/libs/DB';
import { landingPageSchema, landingPageVersionSchema, landingPagesSchema } from '@/models/Schema';
import { getOrganization } from '@/libs/Org';
import { eq } from 'drizzle-orm';
import { getEntitlements } from '@/libs/Entitlements';
import { PlanError } from '@/libs/PlanGuard';

const createSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  headline: z.string().min(1),
  description: z.string().min(1),
});

export async function GET() {
  try {
    const { userId, orgId } = await requireOrgContext()

    const pages = await db
      .select()
      .from(landingPageSchema)
      .where(eq(landingPageSchema.organizationId, orgId));

    return NextResponse.json(pages);
  } catch (err: any) {
    const mapped = mapErrorToResponse(err)
    return NextResponse.json(mapped.body, { status: mapped.status })
  }
}

export async function POST(request: Request) {
  try {
    const { userId, orgId } = await requireOrgContext()

  let body: unknown;
    try {
    body = await request.json();
  } catch (_) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Prevent clients from attempting to set an organizationId in the request
  if (body && typeof body === 'object' && ('organizationId' in body || 'organization_id' in body)) {
    return NextResponse.json({ error: 'Cannot set organizationId' }, { status: 403 });
  }

  const parse = createSchema.safeParse(body);
  if (!parse.success) {
    return NextResponse.json({ error: 'Invalid input', details: parse.error.format() }, { status: 400 });
  }

  const { slug, title, headline, description } = parse.data;

    try {
    // Fetch organization row (use tolerant helper)
    const org = await getOrganization(orgId);
    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 403 });
    }

    // Count existing landing pages for this organization
    const existing = await db
      .select()
      .from(landingPagesSchema)
      .where(eq(landingPagesSchema.organizationId, orgId));

    const existingCount = Array.isArray(existing) ? existing.length : 0;

    // Enforce per-plan limits via centralized entitlements.
    const plan = (org.plan ?? 'starter') as any;
    const allowed = getEntitlements(plan).landingPages.maxPublished;
    if (allowed !== Infinity && existingCount >= allowed) {
      // Compute minimal plan that would allow another published page
      const order: Array<any> = ['starter', 'growth', 'scale'];
      let requiredPlan: any = undefined;
      for (const p of order) {
        const ent = getEntitlements(p as any);
        const limit = ent.landingPages.maxPublished;
        if (limit === Infinity || existingCount < limit) {
          requiredPlan = p;
          break;
        }
      }
      const err = new PlanError('Insufficient plan', 403, 'INSUFFICIENT_ENTITLEMENT', requiredPlan ?? undefined, (org.plan as any) ?? 'starter');
      return NextResponse.json(
        {
          error: 'Insufficient plan',
          code: err.code,
          requiredPlan: err.requiredPlan,
          currentPlan: err.currentPlan,
        },
        { status: err.status ?? 403 },
      );
    }

    // Starter JSON schema for a new landing page (colors, fonts, empty sections)
    const starterSchema = {
      meta: { title, headline, description },
      styles: {
        colors: { primary: '#0ea5e9', background: '#ffffff', text: '#0f172a' },
        fonts: { heading: 'Inter', body: 'Inter' }
      },
      layout: { sections: [] }
    };

    const [inserted] = await db
      .insert(landingPageSchema)
      .values({
        organizationId: orgId,
        name: title,
        slug,
        status: 'draft',
      })
      .returning();

    if (!inserted || !inserted.id) {
      return NextResponse.json({ error: 'Failed to create landing page' }, { status: 500 });
    }

    // Create initial version row (if insert succeeded)
    await db.insert(landingPageVersionSchema).values({
      landingPageId: String(inserted.id),
      schema: starterSchema,
    });

    return NextResponse.json(inserted, { status: 201 });
    } catch (err: any) {
    // Handle unique slug constraint
    const msg = (err?.message ?? String(err)).toString();
    if (msg.includes('unique') || msg.includes('already exists')) {
      return NextResponse.json({ error: 'Slug already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to create landing page' }, { status: 500 });
    }
  } catch (err: any) {
    const mapped = mapErrorToResponse(err)
    return NextResponse.json(mapped.body, { status: mapped.status })
  }
}
