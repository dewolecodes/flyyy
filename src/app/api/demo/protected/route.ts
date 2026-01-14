import { NextResponse } from 'next/server';
import requireOrgContext from '@/libs/requireOrgContext'
import { mapErrorToResponse } from '@/libs/ApiErrors'
import { requirePlanAllowed } from '@/libs/PlanGuard';
import { applySecurityHeaders } from '@/libs/SecurityHeaders'

export async function GET() {
  try {
    const { userId, orgId } = await requireOrgContext()

    try {
      // Require scale plan for this demo endpoint
      await requirePlanAllowed(orgId, ['scale']);

      const ok = NextResponse.json({ message: 'Access granted to pro-only resource' });
      ok.headers.set('Cache-Control', 'no-store')
      try { applySecurityHeaders(ok.headers) } catch (e) {}
      return ok
    } catch (err: any) {
      if (err?.name === 'PlanError') {
        const r = NextResponse.json({ error: err.message, code: err.code, requiredPlan: err.requiredPlan, currentPlan: err.currentPlan }, { status: err.status ?? 403 });
        r.headers.set('Cache-Control', 'no-store')
        try { applySecurityHeaders(r.headers) } catch (e) {}
        return r
      }
      const r = NextResponse.json({ error: 'Failed to authorize' }, { status: 500 });
      r.headers.set('Cache-Control', 'no-store')
      try { applySecurityHeaders(r.headers) } catch (e) {}
      return r
    }
  } catch (err: any) {
    const mapped = mapErrorToResponse(err)
    const r = NextResponse.json(mapped.body, { status: mapped.status })
    r.headers.set('Cache-Control', 'no-store')
    try { applySecurityHeaders(r.headers) } catch (e) {}
    return r
  }
}

export const runtime = 'nodejs'
