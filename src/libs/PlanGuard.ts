import { getOrganization } from '@/libs/Org';

export type Plan = 'free' | 'basic' | 'pro';

const PLAN_ORDER: Record<Plan, number> = {
  free: 0,
  basic: 1,
  pro: 2,
};

export class PlanError extends Error {
  public status: number;
  public code: string;
  public requiredPlan?: Plan;
  public currentPlan?: Plan | null;

  constructor(message: string, status = 403, code = 'INSUFFICIENT_PLAN', requiredPlan?: Plan, currentPlan?: Plan | null) {
    super(message);
    this.name = 'PlanError';
    this.status = status;
    this.code = code;
    this.requiredPlan = requiredPlan;
    this.currentPlan = currentPlan;
  }
}

/**
 * Check whether `current` plan meets or exceeds `minPlan`.
 */
export function hasMinimumPlan(current: Plan | null | undefined, minPlan: Plan) {
  const currentRank = PLAN_ORDER[(current ?? 'free') as Plan];
  const minRank = PLAN_ORDER[minPlan];
  return currentRank >= minRank;
}

/**
 * Ensure an organization has at least the requested plan.
 *
 * Throws a `PlanError` when the organization does not exist or the plan is insufficient.
 * Returns the organization row when the requirement is satisfied.
 */
export async function requirePlan(orgId: string, options: { minPlan: Plan }) {
  if (!orgId) {
    throw new PlanError('Organization id required', 400, 'ORG_ID_REQUIRED', options.minPlan, null);
  }

  const org = await getOrganization(orgId);
  if (!org) {
    throw new PlanError('Organization not found', 404, 'ORG_NOT_FOUND', options.minPlan, null);
  }

  const currentPlan = (org.plan ?? 'free') as Plan;
  if (!hasMinimumPlan(currentPlan, options.minPlan)) {
    throw new PlanError(
      `Organization plan insufficient: required=${options.minPlan} current=${currentPlan}`,
      403,
      'INSUFFICIENT_PLAN',
      options.minPlan,
      currentPlan,
    );
  }

  return org;
}

export default requirePlan;

/**
 * Require that the organization's plan is one of the allowed plans.
 *
 * If `redirectTo` is provided in options, the function will perform a server-side
 * redirect to that path when the plan is not allowed. Otherwise it will throw a
 * `PlanError`.
 */
export async function requirePlanAllowed(orgId: string, allowedPlans: Plan[], options?: { redirectTo?: string }) {
  if (!orgId) {
    throw new PlanError('Organization id required', 400, 'ORG_ID_REQUIRED', allowedPlans[0], null);
  }

  const org = await getOrganization(orgId);
  if (!org) {
    throw new PlanError('Organization not found', 404, 'ORG_NOT_FOUND', allowedPlans[0], null);
  }

  const currentPlan = (org.plan ?? 'free') as Plan;
  const allowed = allowedPlans.includes(currentPlan);
  if (!allowed) {
    const err = new PlanError(
      `Organization plan not allowed: required=${allowedPlans.join('|')} current=${currentPlan}`,
      403,
      'INSUFFICIENT_PLAN',
      allowedPlans[0],
      currentPlan,
    );

    if (options?.redirectTo) {
      try {
        // Import redirect lazily to keep this helper server-only and avoid client bundling issues
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { redirect } = require('next/navigation');
        redirect(options.redirectTo);
        return org;
      } catch (e) {
        // If redirect isn't available for some reason, throw the error
        throw err;
      }
    }

    throw err;
  }

  return org;
}
