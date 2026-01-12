import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

import { requirePlanAllowed } from '@/libs/PlanGuard';

export async function GET() {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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
}
