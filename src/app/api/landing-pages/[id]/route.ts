import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';

import { db } from '@/libs/DB';
import { landingPageSchema } from '@/models/Schema';
import { eq, and } from 'drizzle-orm';

const updateSchema = z
  .object({
    slug: z.string().min(1).optional(),
    title: z.string().min(1).optional(),
    headline: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, { message: 'No fields to update' });

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const { id } = params;

  const { userId, orgId } = await auth();
  if (!userId || !orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch (_) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Disallow changing organization
  if (body && typeof body === 'object' && ('organizationId' in body || 'organization_id' in body)) {
    return NextResponse.json({ error: 'Cannot change organizationId' }, { status: 403 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.format() }, { status: 400 });
  }

  const updates = parsed.data;

  try {
    const updated = await db
      .update(landingPageSchema)
      .set(updates)
      .where(and(eq(landingPageSchema.id, String(id)), eq(landingPageSchema.organizationId, String(orgId))))
      .returning();

    if (!updated || updated.length === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json(updated[0]);
  } catch (err: any) {
    const msg = (err?.message ?? String(err)).toString();
    if (msg.includes('unique') || msg.includes('already exists')) {
      return NextResponse.json({ error: 'Slug already exists' }, { status: 409 });
    }

    return NextResponse.json({ error: 'Failed to update landing page' }, { status: 500 });
  }
}
