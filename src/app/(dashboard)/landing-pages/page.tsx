import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';

import { TitleBar } from '@/features/dashboard/TitleBar';
import { DashboardSection } from '@/features/dashboard/DashboardSection';
import { Button } from '@/components/ui/button';
import { getOrganization, getLandingPagesCount } from '@/libs/Org';
import { Plan, requirePlanAllowed } from '@/libs/PlanGuard';
import { getLimit, getRequiredPlanForCount } from '@/libs/Entitlements';
import { db } from '@/libs/DB';
import { landingPageSchema, landingPageVersionSchema } from '@/models/Schema';
import { eq } from 'drizzle-orm';

export default async function LandingPagesPage() {
  const { userId, orgId } = await auth();

  if (!userId || !orgId) {
    redirect('/sign-in');
  }

  const org = await getOrganization(orgId);
  if (!org) {
    // If org missing, redirect to sign-in or show empty state — keep behavior conservative.
    redirect('/sign-in');
  }

  // Server-side enforcement example: require at least 'basic' or 'pro' to access landing-pages
  // features. If the plan is insufficient, redirect to the pricing page.
  try {
    await requirePlanAllowed(orgId, ['basic', 'pro'], { redirectTo: '/pricing' });
  } catch (e) {
    // If requirePlanAllowed throws (and doesn't redirect), fall back to redirecting.
    redirect('/pricing');
  }

  const pagesCount = await getLandingPagesCount(orgId);

  const currentPlan = (org.plan ?? 'free') as Plan;

  // Determine entitlement-based limit and whether the org can create another page
  const allowed = getLimit(currentPlan, 'landing_pages');
  const canCreate = allowed === Infinity || pagesCount < allowed;
  const requiredForNext = getRequiredPlanForCount('landing_pages', pagesCount) ?? 'pro';

  // Fetch landing pages for this organization (server-side)
  const pages = await db
    .select({ id: landingPageSchema.id, name: landingPageSchema.name, slug: landingPageSchema.slug, status: landingPageSchema.status, updatedAt: landingPageSchema.updatedAt })
    .from(landingPageSchema)
    .where(eq(landingPageSchema.organizationId, orgId));

  const pageIds = Array.isArray(pages) ? pages.map((p) => String(p.id)) : [];

  // Fetch drafts (latest versions where publishedAt IS NULL) for these pages
  const drafts = pageIds.length
    ? await db.select({ landingPageId: landingPageVersionSchema.landingPageId }).from(landingPageVersionSchema).where(eq(landingPageVersionSchema.publishedAt, null as any))
    : [];

  const draftsSet = new Set((drafts || []).map((d: any) => String(d.landingPageId)));

  return (
    <div>
      <TitleBar title="Landing Pages" description="Manage your organization's public landing pages." />

      <div className="flex items-center gap-4 mb-4">
        <div />
        <div className="ml-auto">
          {canCreate ? (
            <Link href="/landing-pages/new" aria-label="Create landing page">
              <Button asChild>
                <a>Create Landing Page</a>
              </Button>
            </Link>
          ) : (
            <div className="flex items-center gap-3">
              <Button disabled>Create Landing Page</Button>
              <div className="text-sm text-muted-foreground">
                Your current plan <strong className="mx-1">{currentPlan}</strong> allows creating up to{' '}
                {requiredForNext === 'basic' ? '1' : requiredForNext === 'pro' ? '2' : '1'} landing page{requiredForNext === 'pro' ? 's' : ''}.
                <div className="mt-1">
                  <Link href="/pricing">
                    <Button variant="outline">Upgrade</Button>
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <DashboardSection title="Your Pages" description="A list of landing pages for your organization.">
        <div className="overflow-auto">
          <table className="w-full table-auto">
            <thead>
              <tr className="text-left text-sm font-medium text-muted-foreground">
                <th className="px-2 py-3">Name</th>
                <th className="px-2 py-3">Slug</th>
                <th className="px-2 py-3">Status</th>
                <th className="px-2 py-3">Updated</th>
                <th className="px-2 py-3">Draft</th>
                <th className="px-2 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(pages || []).map((p: any) => (
                <tr key={p.id} className="border-t">
                  <td className="px-2 py-3">{p.name}</td>
                  <td className="px-2 py-3">{p.slug}</td>
                  <td className="px-2 py-3">{p.status}</td>
                  <td className="px-2 py-3">{new Date(p.updatedAt).toLocaleString()}</td>
                  <td className="px-2 py-3">{draftsSet.has(String(p.id)) ? 'Yes' : 'No'}</td>
                  <td className="px-2 py-3">
                    <a href={`/landing-pages/${p.id}`} className="inline-block">
                      <Button>Edit</Button>
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DashboardSection>
    </div>
  );
}

// (client listing removed — server renders pages with draft flags above)
