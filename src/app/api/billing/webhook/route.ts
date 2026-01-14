import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { revalidatePath } from 'next/cache';

import { db } from '@/libs/DB';
import { organizationSchema } from '@/models/Schema';
import { STRIPE_PRICE_BASIC, STRIPE_PRICE_PRO, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, isBillingEnabled as ENV_BILLING } from '@/libs/env';
import { isBillingEnabled } from '@/libs/FeatureFlags'
import { eq } from 'drizzle-orm';
import { logger } from '@/libs/Logger';
import { mapErrorToResponse } from '@/libs/ApiErrors'

// Price IDs used to map to plans. Keep in env for production; placeholders are fallback.
const PRICE_BASIC = STRIPE_PRICE_BASIC ?? 'price_basic_placeholder';
const PRICE_PRO = STRIPE_PRICE_PRO ?? 'price_pro_placeholder';

export async function POST(request: Request) {
  if (!ENV_BILLING) return NextResponse.json({ error: 'Billing disabled' }, { status: 501 });

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
      // Validate price IDs strictly: unknown prices must be rejected so we don't
      // silently grant an unintended plan. The environment provides canonical
      // production price ids; fallbacks are development placeholders.
      const priceId = subscription.items?.data?.[0]?.price?.id ?? null;

      // Map of known price IDs -> internal organization plan names.
      const PRICE_MAP: Record<string, 'basic' | 'pro'> = {
        [PRICE_BASIC]: 'basic',
        [PRICE_PRO]: 'pro',
      };

      let plan: string | null = null;
      if (subscription.status === 'active') {
        if (!priceId) {
          // Active subscription but missing price — treat as invalid
          logger.error({ subscriptionId: subscription.id }, 'Active subscription missing price id');
          throw new Error('Unknown or missing subscription price for active subscription');
        }

        const mapped = PRICE_MAP[priceId];
        if (!mapped) {
          // Reject unknown prices explicitly so we don't accidentally map to
          // an unintended plan. This returns an error to the webhook caller
          // (Stripe) and is logged server-side for investigation.
          logger.error({ subscriptionId: subscription.id, priceId }, 'Received unknown Stripe price id');
          const e: any = new Error('Unknown Stripe price id');
          e.code = 'UNKNOWN_PRICE';
          throw e;
        }

        plan = mapped;
      } else {
        // Non-active subscriptions are treated as free per policy
        plan = 'free';
      }

      // Find the organization: prefer matching stripe subscription id, then customer id, then metadata org id
      // Select the current plan and stripe fields so we can perform idempotent
      // comparisons and avoid unnecessary writes on retry.
      async function findOrgFullBySubscriptionId(subId: string) {
        const rows = await db
          .select({ id: organizationSchema.id, plan: organizationSchema.plan, stripeSubscriptionId: organizationSchema.stripeSubscriptionId, stripeSubscriptionPriceId: organizationSchema.stripeSubscriptionPriceId, subscriptionStatus: organizationSchema.subscriptionStatus })
          .from(organizationSchema)
          .where(eq(organizationSchema.stripeSubscriptionId, subId))
          .limit(1);
        return rows[0] ?? null;
      }

      async function findOrgFullByCustomerId(customerId: string) {
        const rows = await db
          .select({ id: organizationSchema.id, plan: organizationSchema.plan, stripeSubscriptionId: organizationSchema.stripeSubscriptionId, stripeSubscriptionPriceId: organizationSchema.stripeSubscriptionPriceId, subscriptionStatus: organizationSchema.subscriptionStatus })
          .from(organizationSchema)
          .where(eq(organizationSchema.stripeCustomerId, customerId))
          .limit(1);
        return rows[0] ?? null;
      }

      async function findOrgFullByMetadataOrgId(metadataOrgId?: string | null) {
        if (!metadataOrgId) return null;
        const rows = await db
          .select({ id: organizationSchema.id, plan: organizationSchema.plan, stripeSubscriptionId: organizationSchema.stripeSubscriptionId, stripeSubscriptionPriceId: organizationSchema.stripeSubscriptionPriceId, subscriptionStatus: organizationSchema.subscriptionStatus })
          .from(organizationSchema)
          .where(eq(organizationSchema.id, String(metadataOrgId)))
          .limit(1);
        return rows[0] ?? null;
      }

      let org = await findOrgFullBySubscriptionId(subscription.id);
      if (!org && customerId) org = await findOrgFullByCustomerId(customerId);
      if (!org && metadataOrgId) org = await findOrgFullByMetadataOrgId(metadataOrgId);

      if (!org) {
        // Nothing to update; acknowledge the event so Stripe won't retry infinitely
        return { updated: false, reason: 'org_not_found' };
      }

      // If billing is disabled for this organization explicitly, refuse to apply subscription updates.
      const billingAllowed = await isBillingEnabled(org.id)
      if (!billingAllowed) {
        logger.warn({ orgId: org.id }, 'Received billing webhook for org with billing disabled; skipping update')
        const e: any = new Error('Billing disabled for organization')
        e.code = 'BILLING_DISABLED'
        throw e
      }

      // Decide update payload. We also persist the canonical Stripe price id
      // to the organization row so subsequent webhooks can be compared and
      // handled idempotently.
      const updates: any = {
        stripeSubscriptionId: subscription.id,
        stripeSubscriptionPriceId: priceId,
        subscriptionStatus: subscription.status,
        plan: plan,
      };

      if (subscription.status === 'canceled') {
        updates.stripeSubscriptionId = null;
        updates.stripeSubscriptionPriceId = null;
        updates.subscriptionStatus = 'canceled';
        updates.plan = 'free';
      }

      // Idempotency: only apply the DB update if any of the canonical fields
      // actually differ. This avoids unnecessary writes and makes retries
      // from Stripe effectively a no-op.
      const noChange =
        org.stripeSubscriptionId === updates.stripeSubscriptionId &&
        org.stripeSubscriptionPriceId === updates.stripeSubscriptionPriceId &&
        org.subscriptionStatus === updates.subscriptionStatus &&
        org.plan === updates.plan;

      if (noChange) {
        // Nothing to do — already up-to-date
        return { updated: false };
      }

      // Perform an atomic compare-and-update inside a DB transaction. We
      // re-fetch the canonical fields and only apply the update when they
      // differ. This keeps the operation atomic and idempotent even under
      // concurrent webhook deliveries.
      await db.transaction(async (tx) => {
        const rows = await tx
          .select({ id: organizationSchema.id, plan: organizationSchema.plan, stripeSubscriptionId: organizationSchema.stripeSubscriptionId, stripeSubscriptionPriceId: organizationSchema.stripeSubscriptionPriceId, subscriptionStatus: organizationSchema.subscriptionStatus })
          .from(organizationSchema)
          .where(eq(organizationSchema.id, org.id))
          .limit(1);

        const current = rows[0] ?? null;
        if (
          current &&
          current.stripeSubscriptionId === updates.stripeSubscriptionId &&
          current.stripeSubscriptionPriceId === updates.stripeSubscriptionPriceId &&
          current.subscriptionStatus === updates.subscriptionStatus &&
          current.plan === updates.plan
        ) {
          // Another process already applied the same values — no-op
          return;
        }

        await tx.update(organizationSchema).set(updates).where(eq(organizationSchema.id, org.id));
      });

      // Revalidate the billing success path so server-rendered pages reflect
      // the updated plan promptly. This runs after a successful DB update.
      try {
        revalidatePath('/billing/success');
      } catch (e) {
        // Swallow any revalidation errors to avoid breaking webhook processing
        logger.warn({ err: String(e) }, 'Failed to revalidate billing success path after webhook');
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
          await syncSubscriptionToOrg(subscriptionId, customerId, null);
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
    // Preserve explicit UNKNOWN_PRICE behavior so Stripe doesn't retry noisy events
    if (err?.code === 'UNKNOWN_PRICE') {
      logger.error({ err: String(err), details: err?.message ?? null }, 'Webhook rejected due to unknown Stripe price id');
      return NextResponse.json({ error: 'Unknown Stripe price id' }, { status: 400 });
    }

    const mapped = mapErrorToResponse(err)
    return NextResponse.json(mapped.body, { status: mapped.status })
  }
}
