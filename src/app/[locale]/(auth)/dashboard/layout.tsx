import { getTranslations } from 'next-intl/server';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getI18nPath } from '@/utils/Helpers';

import { DashboardHeader } from '@/features/dashboard/DashboardHeader';
import { ensureOrganizationRecord } from '@/libs/Org';

export async function generateMetadata(props: { params: { locale: string } }) {
  const t = await getTranslations({
    locale: props.params.locale,
    namespace: 'Dashboard',
  });

  return {
    title: t('meta_title'),
    description: t('meta_description'),
  };
}

export default async function DashboardLayout(props: { children: React.ReactNode; params: { locale: string } }) {
  // Server-side translations
  const t = await getTranslations({ locale: props.params.locale, namespace: 'DashboardLayout' });

  // Server-only auth checks:
  // - If user is not signed in, redirect to sign-in.
  // - If user is signed in but has no org selected, redirect to org selection (preserve locale).
  try {
    const { userId, orgId } = await auth();
    if (!userId) {
      redirect('/sign-in');
    }

    if (userId && !orgId) {
      const target = getI18nPath('/onboarding/organization-selection', props.params.locale);
      redirect(target);
    }

    // Best-effort: ensure DB organization exists for the authenticated Clerk org.
    // Do not await to avoid delaying the response.
    if (orgId) ensureOrganizationRecord(orgId).catch(() => null);
  } catch (e) {
    // auth() may throw in some environments; do not block rendering or redirect.
  }

  return (
    <>
      <div className="shadow-md">
        <div className="mx-auto flex max-w-screen-xl items-center justify-between px-3 py-4">
          <DashboardHeader
            menu={[
              {
                href: '/dashboard',
                label: t('home'),
              },
              // PRO: Link to the /dashboard/todos page
              {
                href: '/dashboard/organization-profile/organization-members',
                label: t('members'),
              },
              {
                href: '/dashboard/organization-profile',
                label: t('settings'),
              },
              // PRO: Link to the /dashboard/billing page
            ]}
          />
        </div>
      </div>

      <div className="min-h-[calc(100vh-72px)] bg-muted">
        <div className="mx-auto max-w-screen-xl px-3 pb-16 pt-6">
          {props.children}
        </div>
      </div>
    </>
  );
}

export const dynamic = 'force-dynamic';
