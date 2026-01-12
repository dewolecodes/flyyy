import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';

import Stripe from 'stripe';

import { db } from '@/libs/DB';
import { organizationSchema } from '@/models/Schema';
import { eq } from 'drizzle-orm';
import { getOrganization } from '@/libs/Org';
import { STRIPE_PRICE_BASIC, STRIPE_PRICE_PRO, STRIPE_SECRET_KEY, NEXT_PUBLIC_APP_URL, isBillingEnabled } from '@/libs/env';

const bodySchema = z.object({
  plan: z.enum(['basic', 'pro']),
});

// Use environment price IDs or placeholders
const PRICE_BASIC = STRIPE_PRICE_BASIC ?? 'price_basic_placeholder';
const PRICE_PRO = STRIPE_PRICE_PRO ?? 'price_pro_placeholder';

export async function POST(request: Request) {
  if (!isBillingEnabled) return NextResponse.json({ error: 'Billing disabled' }, { status: 501 });
  const { userId, orgId } = await auth();
  if (!userId || !orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch (_) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid plan. Allowed values: basic, pro' }, { status: 400 });
  }

  const { plan } = parsed.data;

  // Fetch organization (use tolerant helper)
  const org = await getOrganization(orgId);
  if (!org) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }

  // Initialize Stripe
  const stripeKey = STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });

  try {
    let customerId = org.stripeCustomerId as string | null | undefined;

    if (!customerId) {
      // Create a Stripe customer and persist the ID
      const customer = await stripe.customers.create({
        metadata: { organizationId: org.id },
      });

      customerId = customer.id;

      // Save customer id to organization
      await db
        .update(organizationSchema)
        .set({ stripeCustomerId: customerId })
        .where(eq(organizationSchema.id, org.id));
    }

    const priceId = plan === 'basic' ? PRICE_BASIC : PRICE_PRO;

    const successUrl = `${NEXT_PUBLIC_APP_URL ?? ''}/billing/success`;
    const cancelUrl = `${NEXT_PUBLIC_APP_URL ?? ''}/dashboard`;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        metadata: { organizationId: org.id },
      },
      metadata: { organizationId: org.id },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to create checkout session', details: String(err?.message ?? err) }, { status: 500 });
  }
}
