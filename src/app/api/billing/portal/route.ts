import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { auth } from '@clerk/nextjs/server';

import { db } from '@/libs/DB';
import { organizationSchema } from '@/models/Schema';
import { getOrganization } from '@/libs/Org';
import { STRIPE_SECRET_KEY, NEXT_PUBLIC_APP_URL, isBillingEnabled } from '@/libs/env';
import { eq } from 'drizzle-orm';

export async function POST(_request: Request) {
  if (!isBillingEnabled) return NextResponse.json({ error: 'Billing disabled' }, { status: 501 });
  const { userId, orgId } = await auth();
  if (!userId || !orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const stripeKey = STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });

  // Load organization from DB (do not trust client-provided org ids)
  const org = await getOrganization(orgId);
  if (!org) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }

  let customerId = org.stripeCustomerId;
  try {
    if (!customerId) {
      // Create a customer in Stripe and persist
      const customer = await stripe.customers.create({ metadata: { organizationId: orgId } });
      customerId = customer.id;
      await db.update(organizationSchema).set({ stripeCustomerId: customerId }).where(eq(organizationSchema.id, org.id));
    }

    const returnUrl = NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? 'http://localhost:3000/dashboard';
    const session = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to create customer portal session', details: String(err?.message ?? err) }, { status: 502 });
  }
}
