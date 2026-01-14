"use client";
import * as React from 'react';
import { Router } from 'next/navigation';
import ManageBillingButton from '@/components/ManageBillingButton';
import UpgradePlanButton from '@/components/UpgradePlanButton';

export type ApiUIAction =
  | { type: 'redirect'; href: string }
  | { type: 'showBanner'; element: React.ReactNode }
  | { type: 'none' };

export function mapErrorCodeToUIAction(code: string | undefined, message?: string): ApiUIAction {
  if (!code) return { type: 'none' };
  switch (code) {
    case 'BILLING_REQUIRED':
      return { type: 'redirect', href: '/pricing' };
    case 'SUBSCRIPTION_INACTIVE':
      return { type: 'showBanner', element: <div className="flex items-center gap-4"><div className="text-sm">Subscription inactive. Manage billing to resume access.</div><ManageBillingButton className="ml-4" /></div> };
    case 'USAGE_LIMIT_EXCEEDED':
      return { type: 'showBanner', element: <div className="flex items-center gap-4"><div className="text-sm">Usage limit reached. Upgrade your plan to continue.</div><UpgradePlanButton className="ml-4" /></div> };
    case 'ORG_REQUIRED':
      return { type: 'showBanner', element: <div className="flex items-center gap-4"><div className="text-sm">This action requires selecting an organization.</div><a href="/onboarding/organization-selection" className="underline ml-4">Switch organization</a></div> };
    default:
      // Unknown codes handled by caller
      return { type: 'none' };
  }
}

export function performUIAction(action: ApiUIAction, router?: Router, show: (el: React.ReactNode | null) => void) {
  if (!action) return;
  if (action.type === 'redirect') {
    // Prefer router when available
    try {
      if (router && typeof (router as any).push === 'function') (router as any).push(action.href);
      else window.location.href = action.href;
    } catch (e) {
      window.location.href = action.href;
    }
    return;
  }

  if (action.type === 'showBanner') {
    show(action.element);
    return;
  }
}

export default {
  mapErrorCodeToUIAction,
  performUIAction,
};
