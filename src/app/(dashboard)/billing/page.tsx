import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { TitleBar } from '@/features/dashboard/TitleBar';
import { DashboardSection } from '@/features/dashboard/DashboardSection';
import { getOrganization } from '@/libs/Org';
import ManageBillingButton from '@/components/ManageBillingButton';

export default async function BillingPage() {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) redirect('/sign-in');

  const org = await getOrganization(orgId);
  if (!org) redirect('/sign-in');

  const plan = org.plan ?? 'free';
  const subscriptionStatus = org.subscriptionStatus ?? null;

  return (
    <div>
      <TitleBar title="Billing" description="Manage your organization's subscription and billing." />

      <div className="flex items-center gap-4 mb-4">
        <div />
        <div className="ml-auto">
          <ManageBillingButton />
        </div>
      </div>

      <DashboardSection title="Subscription" description="Current subscription and billing status for your organization.">
        <div className="grid grid-cols-1 gap-4">
          <div>
            <div className="text-sm text-muted-foreground">Current plan</div>
            <div className="font-medium">{plan}</div>
          </div>

          <div>
            <div className="text-sm text-muted-foreground">Subscription status</div>
            <div className="font-medium">{subscriptionStatus ?? 'none'}</div>
          </div>

          {subscriptionStatus === 'past_due' && (
            <div className="text-sm text-warning">Your latest invoice payment failed. Please manage billing to update payment details.</div>
          )}

          {subscriptionStatus === 'canceled' && (
            <div className="text-sm text-muted-foreground">Your subscription has been cancelled. You can re-subscribe via Manage Billing.</div>
          )}

          {subscriptionStatus === null && (
            <div className="text-sm text-muted-foreground">No active subscription. Upgrade to unlock paid features.</div>
          )}
        </div>
      </DashboardSection>
    </div>
  );
}
