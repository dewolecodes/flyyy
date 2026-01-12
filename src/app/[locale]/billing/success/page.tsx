import { auth } from '@clerk/nextjs/server';
import { getOrganization } from '@/libs/Org';

export default async function BillingSuccessPage() {
  // Server-side: read authenticated Clerk orgId
  let orgId: string | undefined;
  try {
    const a = await auth();
    orgId = a.orgId ?? undefined;
  } catch (e) {
    orgId = undefined;
  }

  if (!orgId) {
    return (
      <div className="prose">
        <h1>Billing</h1>
        <p>No organization associated with the current session.</p>
      </div>
    );
  }

  const org = await getOrganization(orgId);

  if (!org) {
    return (
      <div className="prose">
        <h1>Billing</h1>
        <p>Organization not found.</p>
      </div>
    );
  }

  const plan = (org.plan as string) ?? 'free';

  return (
    <div className="prose">
      <h1>Billing</h1>
      <p>Your current plan: <strong>{plan}</strong></p>
      <p>Stripe checkout completed — subscription state will be reflected once the webhook is processed.</p>
    </div>
  );
}
