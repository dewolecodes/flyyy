import { NextResponse } from 'next/server';
import requireOrgContext from '@/libs/requireOrgContext'
import { mapErrorToResponse } from '@/libs/ApiErrors'
import { requirePlanAllowed } from '@/libs/PlanGuard';

export async function GET() {
  try {
    const { userId, orgId } = await requireOrgContext()

    try {
      // Require scale plan for this demo endpoint
      await requirePlanAllowed(orgId, ['scale']);

      return NextResponse.json({ message: 'Access granted to pro-only resource' });
    } catch (err: any) {
      if (err?.name === 'PlanError') {
        return NextResponse.json({ error: err.message, code: err.code, requiredPlan: err.requiredPlan, currentPlan: err.currentPlan }, { status: err.status ?? 403 });
      }

      return NextResponse.json({ error: 'Failed to authorize' }, { status: 500 });
    }
  } catch (err: any) {
    const mapped = mapErrorToResponse(err)
    return NextResponse.json(mapped.body, { status: mapped.status })
  }
}
