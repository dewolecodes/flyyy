import { notFound } from 'next/navigation';

import { db } from '@/libs/DB';
import { landingPagesSchema, landingPageSchema, landingPageVersionSchema } from '@/models/Schema';
import { eq, desc, and } from 'drizzle-orm';
import LandingPageRenderer from '@/components/landing-renderer/LandingPageRenderer';

type Props = {
  params: { slug: string };
};

export async function generateMetadata({ params }: Props) {
  const { slug } = params;

  // Prefer the new versioned `landing_page` table. Fall back to legacy `landing_pages`.
  let page: any = (await db
    .select()
    .from(landingPageSchema)
    .where(eq(landingPageSchema.slug, slug)))[0];

  if (!page) {
    const legacy = (await db
      .select()
      .from(landingPagesSchema)
      .where(eq(landingPagesSchema.slug, slug)))[0];
    page = legacy as any;
  }

  if (!page) {
    return { title: 'Not Found' };
  }

  // Try to use published version meta if available
  if (page && page.id) {
    const versions = await db
      .select()
      .from(landingPageVersionSchema)
      .where(and(eq(landingPageVersionSchema.landingPageId, String(page.id)), (landingPageVersionSchema.publishedAt as any).notEq(null)))
      .orderBy(desc(landingPageVersionSchema.publishedAt))
      .limit(1);
    if (versions && versions[0] && versions[0].schema) {
      const s = versions[0].schema as any;
      return { title: s?.meta?.title ?? ((page as any).title ?? page.name) };
    }
  }

  return { title: (page as any).title ?? page.name };
}

export default async function LandingPage({ params }: Props) {
  const { slug } = params;

  let [page] = await db
    .select()
    .from(landingPageSchema)
    .where(eq(landingPageSchema.slug, slug));

  if (!page) {
    const legacy = (await db
      .select()
      .from(landingPagesSchema)
      .where(eq(landingPagesSchema.slug, slug)))[0];
    page = legacy as any;
  }

  if (!page) notFound();
  // Load latest published version only
  if (!page || !page.id) notFound();

  const published = await db
    .select()
    .from(landingPageVersionSchema)
    .where(and(eq(landingPageVersionSchema.landingPageId, String(page.id)), (landingPageVersionSchema.publishedAt as any).notEq(null)))
    .orderBy(desc(landingPageVersionSchema.publishedAt))
    .limit(1);

  if (!published || !published[0] || !published[0].schema) {
    // No published version — 404
    notFound();
  }

  const schema = published[0].schema as any;

  return (
    <main className="mx-auto max-w-6xl px-4 py-12">
      <LandingPageRenderer schema={schema} />
    </main>
  );
}
