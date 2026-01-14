/**
 * Plan definitions and entitlements
 *
 * This file is a pure, deterministic source of truth for plan-based feature
 * access and limits. It must not read environment variables or access the
 * database so it remains fully unit-testable and safe to import both on the
 * server and in UI code (read-only).
 */

// 1. Define Plan type (string literals)
export type Plan = 'starter' | 'growth' | 'scale';

// 2. Entitlements shape
export type Entitlements = {
  ai: {
    // Whether AI features are available for this plan.
    enabled: boolean;
    // Monthly generation limit. Use Infinity for unlimited.
    monthlyLimit: number;
  };
  landingPages: {
    // Maximum number of published landing pages. Infinity for unlimited.
    maxPublished: number;
  };
  teams: {
    // Whether team functionality is available.
    enabled: boolean;
    // Maximum number of team members allowed. 0 if teams disabled.
    maxMembers: number;
  };
};

// 3. ENTITLEMENTS map keyed by plan
// The numeric limits chosen below are opinionated defaults intended to
// demonstrate progressive tiers. They can be adjusted without changing
// runtime logic elsewhere. Comments explain rationale for each value.
export const ENTITLEMENTS: Record<Plan, Entitlements> = {
  // Starter: entry-level paid plan. Provides limited AI usage and a small
  // number of published landing pages. Teams are disabled to keep the plan
  // simple and inexpensive for solo users/small projects.
  starter: {
    ai: { enabled: true, monthlyLimit: 100 }, // small monthly quota for experimentation
    landingPages: { maxPublished: 3 }, // keep hosting costs low
    teams: { enabled: false, maxMembers: 0 },
  },

  // Growth: for small teams. Higher AI quota and more published pages.
  // Teams are enabled with a moderate member cap to support collaboration.
  growth: {
    ai: { enabled: true, monthlyLimit: 1_000 }, // reasonable production quota
    landingPages: { maxPublished: 25 }, // suitable for SMBs
    teams: { enabled: true, maxMembers: 10 },
  },

  // Scale: for larger customers. Provide high or unlimited allowances so
  // the product scales with the organization without frequent throttling.
  scale: {
    ai: { enabled: true, monthlyLimit: Infinity }, // effectively unlimited
    landingPages: { maxPublished: Infinity }, // host as many pages as needed
    teams: { enabled: true, maxMembers: Infinity }, // no practical cap
  },
};

// 7. Helper functions

/**
 * Return entitlements for a given plan.
 * If an unknown plan is passed, this function will throw — callers should
 * validate plan identity upstream. This makes failures explicit and easier
 * to test.
 */
export function getEntitlements(plan: Plan): Entitlements {
  const e = ENTITLEMENTS[plan];
  if (!e) throw new Error(`Unknown plan: ${String(plan)}`);
  return e;
}

/**
 * Resolve an external plan identifier (database or legacy string) to the
 * canonical `Plan` union used by the entitlements map. This is a strict
 * resolver intended for server-side enforcement — it throws when the plan
 * cannot be resolved rather than silently defaulting to a permissive tier.
 */
export function resolvePlanStrict(plan?: string | null): Plan {
  if (!plan) throw new Error('Missing plan');
  const p = String(plan).toLowerCase();
  if (p === 'starter' || p === 'growth' || p === 'scale') return p as Plan;
  if (p === 'free') return 'starter';
  if (p === 'basic') return 'growth';
  if (p === 'pro') return 'scale';
  throw new Error(`Unknown plan: ${String(plan)}`);
}

/**
 * Convenience: whether AI features are available for the plan.
 */
export function canUseAI(plan: Plan): boolean {
  return Boolean(getEntitlements(plan).ai.enabled && getEntitlements(plan).ai.monthlyLimit > 0);
}

/**
 * Whether publishing one more landing page is allowed given the current count.
 */
export function canPublishLandingPage(plan: Plan, currentPublishedCount: number): boolean {
  const limit = getEntitlements(plan).landingPages.maxPublished;
  return limit === Infinity || currentPublishedCount < limit;
}

/**
 * Assert that AI usage is allowed given the current usage count for the month.
 * Throws an Error with a clear message when the limit is exceeded. This keeps
 * enforcement explicit on the server-side where requests originate.
 */
export function assertAIAllowed(plan: Plan, usageCountThisMonth: number): void {
  const { ai } = getEntitlements(plan);
  if (!ai.enabled) throw new Error('AI features are disabled for this plan');
  if (ai.monthlyLimit !== Infinity && usageCountThisMonth >= ai.monthlyLimit) {
    throw new Error('AI monthly quota exceeded');
  }
}

/**
 * Assert that publishing a new landing page is allowed. Throws an Error when
 * the plan's published page limit would be exceeded.
 */
export function assertPublishAllowed(plan: Plan, currentPublishedCount: number): void {
  const { landingPages } = getEntitlements(plan);
  if (landingPages.maxPublished !== Infinity && currentPublishedCount >= landingPages.maxPublished) {
    throw new Error('Published landing pages limit exceeded for this plan');
  }
}

// --- Compatibility helpers ---
// Some parts of the codebase still import older helper names (e.g. getLimit,
// canUseFeature). Provide lightweight adapters so existing imports keep working
// while the code migrates to the new, explicit API.

type LegacyFeature = 'landing_pages' | 'ai_generation';

function normalizePlan(plan?: string | null): Plan {
  // Map legacy plan identifiers to the current plan slugs.
  if (!plan) return 'starter';
  const p = String(plan).toLowerCase();
  if (p === 'starter' || p === 'growth' || p === 'scale') return p as Plan;
  if (p === 'free') return 'starter';
  if (p === 'basic') return 'growth';
  if (p === 'pro') return 'scale';
  // Unknown plans default to the most restrictive paid tier.
  return 'starter';
}

export function getLimit(plan: string | Plan | null | undefined, feature: LegacyFeature): number {
  const p = normalizePlan(plan as any);
  const ent = getEntitlements(p);
  if (feature === 'ai_generation') return ent.ai.monthlyLimit;
  return ent.landingPages.maxPublished;
}

export function canUseFeature(plan: string | Plan | null | undefined, feature: LegacyFeature): boolean {
  const limit = getLimit(plan, feature);
  return limit === Infinity || (typeof limit === 'number' && limit > 0);
}

export default {
  ENTITLEMENTS,
  getEntitlements,
  canUseAI,
  canPublishLandingPage,
  assertAIAllowed,
  assertPublishAllowed,
};
