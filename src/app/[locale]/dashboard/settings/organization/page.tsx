import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { db } from '@/libs/DB';
import { organizationSchema } from '@/models/Schema';
import { eq } from 'drizzle-orm';
import { getI18nPath } from '@/utils/Helpers';

type Props = { params: { locale: string } };

export default async function OrganizationSettingsPage({ params }: Props) {
  // Server-side auth
  let orgId: string | undefined;
  try {
    const session = await auth();
    orgId = session.orgId ?? undefined;
  } catch (e) {
    orgId = undefined;
  }

  if (!orgId) {
    // Preserve locale when redirecting to organization selection
    redirect(getI18nPath('/onboarding/organization-selection', params.locale));
  }

  // Load organization from DB
  const rows = await db.select().from(organizationSchema).where(eq(organizationSchema.id, String(orgId))).limit(1);
  const org = rows[0] ?? null;

  if (!org) {
    return (
      <div>
        <h1>Organization</h1>
        <p>Organization not found for id: {orgId}</p>
      </div>
    );
  }

  // Attempt to retrieve member count from Clerk server SDK if available.
  // This is optional — if Clerk server client isn't available or the API differs,
  // we gracefully fall back to "Unavailable".
  let memberCount: string | number = 'Unavailable';
  try {
    // Lazy require to ensure this code runs server-side only and won't be bundled for client
    // Try common Clerk server client import locations
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const clerk = require('@clerk/nextjs');
    const clerkClient = clerk?.clerkClient ?? clerk?.Clerk ?? clerk?.default ?? null;

    if (clerkClient && clerkClient.organizations) {
      // Try a few likely method names for listing memberships/members
      const orgApi = clerkClient.organizations;
      const tryFns = [
        'getOrganizationMemberships',
        'getOrganizationMembers',
        'listOrganizationMembers',
        'listOrganizationMemberships',
        'getMemberships',
      ];

      for (const fn of tryFns) {
        if (typeof orgApi[fn] === 'function') {
          try {
            const res = await orgApi[fn](orgId as string);
            // Try to infer count from returned shape
            if (Array.isArray(res)) {
              memberCount = res.length;
            } else if (res && typeof res.total_items === 'number') {
              memberCount = res.total_items;
            } else if (res && Array.isArray(res.members)) {
              memberCount = res.members.length;
            } else if (res && Array.isArray(res.data)) {
              memberCount = res.data.length;
            }
            break;
          } catch (e) {
            // ignore and try next
          }
        }
      }
    }
  } catch (e) {
    // ignore — memberCount remains 'Unavailable'
  }

  const plan = (org.plan ?? 'free') as string;
  const stripeCustomerId = org.stripeCustomerId ?? null;
  const subscriptionStatus = org.subscriptionStatus ?? org.stripeSubscriptionStatus ?? 'none';

  return (
    <div>
      <h1>Organization</h1>
      <table>
        <tbody>
          <tr>
            <td><strong>Organization ID</strong></td>
            <td>{org.id}</td>
          </tr>
          <tr>
            <td><strong>Organization name</strong></td>
            <td>{(org as any).name ?? '—'}</td>
          </tr>
          <tr>
            <td><strong>Current plan</strong></td>
            <td>{plan}</td>
          </tr>
          <tr>
            <td><strong>Stripe customer</strong></td>
            <td>{stripeCustomerId ?? 'Not connected'}</td>
          </tr>
          <tr>
            <td><strong>Subscription status</strong></td>
            <td>{subscriptionStatus}</td>
          </tr>
          <tr>
            <td><strong>Member count</strong></td>
            <td>{String(memberCount)}</td>
          </tr>
          <tr>
            <td><strong>Created</strong></td>
            <td>{(org.createdAt ? new Date(org.createdAt).toISOString() : '—')}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
