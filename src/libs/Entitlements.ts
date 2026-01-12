import type { Plan } from '@/libs/PlanGuard';

export type Feature = 'landing_pages' | 'ai_generation';

const ENTITLEMENTS: Record<Plan, Record<Feature, number>> = {
  free: {
    landing_pages: 1,
    ai_generation: 0,
  },
  basic: {
    landing_pages: 2,
    ai_generation: 50,
  },
  pro: {
    landing_pages: Infinity,
    ai_generation: Infinity,
  },
};

export function getLimit(plan: Plan | string | null | undefined, feature: Feature): number {
  const p = (plan ?? 'free') as Plan;
  const limits = ENTITLEMENTS[p] ?? ENTITLEMENTS.free;
  return limits[feature];
}

export function canUseFeature(plan: Plan | string | null | undefined, feature: Feature): boolean {
  const limit = getLimit(plan, feature);
  return limit === Infinity || (typeof limit === 'number' && limit > 0);
}

/**
 * Given a feature and a current count, return the minimal plan that allows count+1 usage.
 * Returns null if no plan satisfies the requested count (shouldn't happen with current plans).
 */
export function getRequiredPlanForCount(feature: Feature, currentCount: number): Plan | null {
  const order: Plan[] = ['free', 'basic', 'pro'];
  for (const p of order) {
    const limit = ENTITLEMENTS[p][feature];
    if (limit === Infinity || limit > currentCount) return p;
  }
  return null;
}

/**
 * Return the minimum plan that grants any access to the feature (limit > 0).
 */
export function getMinimumPlanForFeature(feature: Feature): Plan | null {
  const order: Plan[] = ['free', 'basic', 'pro'];
  for (const p of order) {
    const limit = ENTITLEMENTS[p][feature];
    if (limit === Infinity || limit > 0) return p;
  }
  return null;
}

export default {
  getLimit,
  canUseFeature,
  getRequiredPlanForCount,
  getMinimumPlanForFeature,
};
