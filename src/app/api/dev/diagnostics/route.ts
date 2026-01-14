import { NextResponse } from 'next/server'
import requireOrgContext from '@/libs/requireOrgContext'
import { mapErrorToResponse } from '@/libs/ApiErrors'
import { getOrganization } from '@/libs/Org'
import { getEntitlements } from '@/libs/Entitlements'
import { getAIUsage, getPublishedLandingPageCount } from '@/libs/Usage'

// DEV-only diagnostics endpoint. Returns 404 when not in development.
export async function GET() {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 })
  }

  try {
    const { userId, orgId } = await requireOrgContext()

    // Read-only: fetch organization metadata but do not create/modify records
    const org = await getOrganization(orgId)
    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    // Normalize plan values conservatively (do not trust client input)
    function normalizePlan(plan: unknown): 'starter' | 'growth' | 'scale' {
      if (!plan) return 'starter'
      const p = String(plan).toLowerCase()
      if (p === 'starter' || p === 'growth' || p === 'scale') return p as any
      if (p === 'free') return 'starter'
      if (p === 'basic') return 'growth'
      if (p === 'pro') return 'scale'
      return 'starter'
    }

    const currentPlan = normalizePlan(org.plan)
    const entitlements = getEntitlements(currentPlan)

    // Gather current usage counts for the current period
    const aiUsage = await getAIUsage(orgId).catch(() => -1)

    const publishedCount = await getPublishedLandingPageCount(orgId).catch(() => -1)

    const aiAllowed = Boolean(entitlements.ai.enabled && (entitlements.ai.monthlyLimit === Infinity || (typeof aiUsage === 'number' && aiUsage >= 0 && aiUsage < entitlements.ai.monthlyLimit)))
    const publishAllowed = Boolean(entitlements.landingPages.maxPublished === Infinity || (typeof publishedCount === 'number' && publishedCount >= 0 && publishedCount < entitlements.landingPages.maxPublished))

    const payload = {
      organizationId: orgId,
      currentPlan,
      entitlements,
      usage: {
        ai: aiUsage,
        publishedPages: publishedCount,
      },
      allowed: {
        ai: aiAllowed,
        publish: publishAllowed,
      },
      // include some raw metadata to aid debugging (server-side only)
      orgMetadata: {
        id: org.id ?? null,
        plan: org.plan ?? null,
        name: org.name ?? null,
      },
    }

    return NextResponse.json(payload)
  } catch (err: any) {
    const mapped = mapErrorToResponse(err)
    return NextResponse.json(mapped.body, { status: mapped.status })
  }
}

export const runtime = 'nodejs'
