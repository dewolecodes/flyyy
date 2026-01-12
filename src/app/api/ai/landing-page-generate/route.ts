import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@clerk/nextjs/server'

import { db } from '@/libs/DB'
import { landingPageSchema } from '@/models/Schema'
import { eq } from 'drizzle-orm'
import { normalizeAIToLandingSchema, generateAISuggestion } from '@/lib/ai/landingPageAI'

const Payload = z.object({
  landingPageId: z.string(),
  mode: z.enum(['from-scratch', 'improve', 'section-only']),
  context: z.record(z.any()).optional(),
})

/**
 * POST /api/ai/landing-page-generate
 * - Requires Clerk org auth; enforces that the landing page belongs to the org.
 * - Calls an AI generator (stubbed here), normalizes the result to a safe
 *   partial LandingPageSchema and returns an `aiDraft` envelope to the client.
 * - IMPORTANT: This route does NOT write to the DB. Persisting the AI draft
 *   must be done by the client using the existing draft save flow
 *   (`/api/landing-pages/draft`) so that DB writes remain centralized and
 *   Drizzle stays authoritative.
 */
export async function POST(request: Request) {
  try {
    const a = await auth()
    const clerkOrgId = a.orgId
    if (!clerkOrgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

    const body = await request.json()
    const parsed = Payload.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Invalid payload', details: parsed.error.format() }, { status: 400 })

    const { landingPageId, mode, context } = parsed.data

    // Ensure landing page exists and belongs to this org
    const lp = (await db.select().from(landingPageSchema).where(eq(landingPageSchema.id, String(landingPageId))).limit(1))[0]
    if (!lp) return NextResponse.json({ error: 'Landing page not found' }, { status: 404 })
    if (String(lp.organizationId) !== String(clerkOrgId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Call AI generator (server-only). The generator returns raw content which
    // we MUST normalize before returning to the client.
    const rawSuggestion = await generateAISuggestion(String(landingPageId), mode as any, context)
    const normalized = normalizeAIToLandingSchema(rawSuggestion)

    // Wrap into an aiDraft envelope. Do NOT persist — caller will save via
    // /api/landing-pages/draft which is the single writer for landing_page_version.schema
    const aiDraft = {
      id: (globalThis as any).crypto?.randomUUID?.() ?? String(Date.now()) + '-' + Math.random().toString(36).slice(2),
      createdAt: new Date().toISOString(),
      mode,
      context: context ?? null,
      suggestion: normalized,
    }

    return NextResponse.json({ aiDraft })
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 })
  }
}
