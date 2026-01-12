import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { revalidatePath } from 'next/cache';

import { db } from '@/libs/DB';
import { organizationSchema } from '@/models/Schema';
import { STRIPE_PRICE_BASIC, STRIPE_PRICE_PRO, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, isBillingEnabled } from '@/libs/env';
import { eq } from 'drizzle-orm';

// Price IDs used to map to plans. Keep in env for production; placeholders are fallback.
const PRICE_BASIC = STRIPE_PRICE_BASIC ?? 'price_basic_placeholder';
const PRICE_PRO = STRIPE_PRICE_PRO ?? 'price_pro_placeholder';

export async function POST(request: Request) {
  if (!isBillingEnabled) return NextResponse.json({ error: 'Billing disabled' }, { status: 501 });

  const stripeKey = STRIPE_SECRET_KEY;
  const webhookSecret = STRIPE_WEBHOOK_SECRET;

  if (!stripeKey || !webhookSecret) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });

  // Read raw body
  const buf = await request.arrayBuffer();
  const payload = Buffer.from(buf).toString('utf8');

  const sig = request.headers.get('stripe-signature') || request.headers.get('Stripe-Signature');
  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe signature' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, sig, webhookSecret);
  } catch (err: any) {
    return NextResponse.json({ error: `Webhook signature verification failed: ${String(err?.message ?? err)}` }, { status: 400 });
  }

  try {
    async function findOrgBySubscriptionId(subId: string) {
      const rows = await db.select({ id: organizationSchema.id }).from(organizationSchema).where(eq(organizationSchema.stripeSubscriptionId, subId)).limit(1);
      return rows[0] ?? null;
    }

    async function findOrgByCustomerId(customerId: string) {
      const rows = await db.select({ id: organizationSchema.id }).from(organizationSchema).where(eq(organizationSchema.stripeCustomerId, customerId)).limit(1);
      return rows[0] ?? null;
    }

    async function findOrgByMetadataOrgId(metadataOrgId?: string | null) {
      if (!metadataOrgId) return null;
      const rows = await db.select({ id: organizationSchema.id }).from(organizationSchema).where(eq(organizationSchema.id, String(metadataOrgId))).limit(1);
      return rows[0] ?? null;
    }

    async function syncSubscriptionToOrg(subscriptionId: string, customerId?: string | null, metadataOrgId?: string | null) {
      // Fetch canonical subscription from Stripe (authoritative)
      const subscription = await stripe.subscriptions.retrieve(subscriptionId, { expand: ['items.data.price'] });

      // Determine plan from the first price on the subscription (if available)
      const priceId = subscription.items?.data?.[0]?.price?.id;
      let plan: string | null = null;
      if (subscription.status === 'active') {
        if (priceId === PRICE_BASIC) plan = 'basic';
        else if (priceId === PRICE_PRO) plan = 'pro';
      } else {
        // Non-active subscriptions are treated as free per policy
        plan = 'free';
      }

      // Find the organization: prefer matching stripe subscription id, then customer id, then metadata org id
      let org = await findOrgBySubscriptionId(subscription.id);
      if (!org && customerId) org = await findOrgByCustomerId(customerId);
      if (!org && metadataOrgId) org = await findOrgByMetadataOrgId(metadataOrgId);

      if (!org) {
        // Nothing to update; acknowledge the event so Stripe won't retry infinitely
        return { updated: false, reason: 'org_not_found' };
      }

      // Decide update payload
      const updates: any = {
        stripeSubscriptionId: subscription.id,
        subscriptionStatus: subscription.status,
        plan: plan,
      };

      // If subscription is canceled or deleted, clear subscription id and set free
      if (subscription.status === 'canceled') {
        updates.stripeSubscriptionId = null;
        updates.subscriptionStatus = 'canceled';
        updates.plan = 'free';
      }

      // Apply idempotent update
      await db.update(organizationSchema).set(updates).where(eq(organizationSchema.id, org.id));

      // Revalidate the billing success path so server-rendered pages (e.g. /billing/success)
      // reflect the updated plan promptly. This is safe because the webhook is the
      // authoritative source and we only revalidate after a successful DB update.
      try {
        revalidatePath('/billing/success');
      } catch (e) {
        // Swallow any revalidation errors to avoid breaking webhook processing
      }

      return { updated: true };
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const subscriptionId = typeof session.subscription === 'string' ? session.subscription : undefined;
        const customerId = typeof session.customer === 'string' ? session.customer : undefined;
        const metadataOrgId = session.metadata?.organizationId ?? session.metadata?.organization_id ?? null;

        if (subscriptionId) {
          await syncSubscriptionToOrg(subscriptionId, customerId, metadataOrgId);
        } else if (customerId && metadataOrgId) {
          // No subscription on session (possible for non-subscription flows). Update customer id on org if metadata maps to org.
          const orgById = await findOrgByMetadataOrgId(metadataOrgId);
          if (orgById) {
            await db.update(organizationSchema).set({ stripeCustomerId: customerId }).where(eq(organizationSchema.id, orgById.id));
            try {
              revalidatePath('/billing/success');
            } catch (e) {
              // ignore
            }
          }
        }

        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const subscriptionId = subscription.id;
        const customerId = typeof subscription.customer === 'string' ? subscription.customer : undefined;
        const metadataOrgId = subscription.metadata?.organizationId ?? subscription.metadata?.organization_id ?? null;

        await syncSubscriptionToOrg(subscriptionId, customerId, metadataOrgId);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const subscriptionId = subscription.id;
        const customerId = typeof subscription.customer === 'string' ? subscription.customer : undefined;
        const metadataOrgId = subscription.metadata?.organizationId ?? subscription.metadata?.organization_id ?? null;

        // For deletes, ensure organization is downgraded safely and subscription id cleared
        // Attempt to find org
        let org = await findOrgBySubscriptionId(subscriptionId);
        if (!org && customerId) org = await findOrgByCustomerId(customerId);
        if (!org && metadataOrgId) org = await findOrgByMetadataOrgId(metadataOrgId);

        if (org) {
          await db.update(organizationSchema)
            .set({ stripeSubscriptionId: null, subscriptionStatus: 'canceled', plan: 'free' })
            .where(eq(organizationSchema.id, org.id));
          try {
            revalidatePath('/billing/success');
          } catch (e) {
            // ignore
          }
        }

        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : undefined;
        const customerId = typeof invoice.customer === 'string' ? invoice.customer : undefined;

        if (subscriptionId) {
          // Re-fetch subscription to get canonical status and update org accordingly
          try {
            await syncSubscriptionToOrg(subscriptionId, customerId, null);
          } catch (e) {
            // swallow error to avoid retries; Stripe will retry but we don't want to crash
          }
        } else if (customerId) {
          // If no subscription id, try to find org by customer and mark as unpaid/past_due
          const org = await findOrgByCustomerId(customerId);
          if (org) {
            await db.update(organizationSchema)
              .set({ subscriptionStatus: 'past_due', plan: 'free' })
              .where(eq(organizationSchema.id, org.id));
            try {
              revalidatePath('/billing/success');
            } catch (e) {
              // ignore
            }
          }
        }

        break;
      }

      default:
        // Ignore other events
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    return NextResponse.json({ error: 'Webhook handling failed', details: String(err?.message ?? err) }, { status: 500 });
  }
}
