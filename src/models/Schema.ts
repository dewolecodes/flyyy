import {
  bigint,
  pgTable,
  serial,
  text,
  uuid,
  timestamp,
  uniqueIndex,
  json,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Type-safe plan union for organizations
export type OrganizationPlan = 'free' | 'basic' | 'pro';

export const organizationSchema = pgTable(
  'organization',
  {
    id: text('id').primaryKey(),
    plan: text('plan').default('free').notNull(),
    stripeCustomerId: text('stripe_customer_id'),
    stripeSubscriptionId: text('stripe_subscription_id'),
    stripeSubscriptionPriceId: text('stripe_subscription_price_id'),
    stripeSubscriptionStatus: text('stripe_subscription_status'),
    subscriptionStatus: text('subscription_status'),
    stripeSubscriptionCurrentPeriodEnd: bigint(
      'stripe_subscription_current_period_end',
      { mode: 'number' },
    ),
    updatedAt: timestamp('updated_at', { mode: 'date' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (table) => ({
    stripeCustomerIdIdx: uniqueIndex('stripe_customer_id_idx').on(
      table.stripeCustomerId,
    ),
  }),
);

export const todoSchema = pgTable('todo', {
  id: serial('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  title: text('title').notNull(),
  message: text('message').notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

export const landingPagesSchema = pgTable(
  'landing_pages',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    organizationId: text('organization_id').notNull(),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    headline: text('headline').notNull(),
    description: text('description').notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (table) => ({
    slugIdx: uniqueIndex('landing_pages_slug_idx').on(table.slug),
  }),
);

// Landing page core table
export const landingPageSchema = pgTable(
  'landing_page',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    organizationId: text('organization_id').notNull(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    status: text('status').default('draft').notNull(), // draft | published
    updatedAt: timestamp('updated_at', { mode: 'date' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (table) => ({
    slugIdx: uniqueIndex('landing_page_slug_idx').on(table.slug),
  }),
);

// Landing page versions (schema snapshots)
export const landingPageVersionSchema = pgTable('landing_page_version', {
  id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
  landingPageId: uuid('landing_page_id').notNull(),
  schema: json('schema').notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  publishedAt: timestamp('published_at', { mode: 'date' }), // nullable by default ✅
});

export const aiUsageSchema = pgTable('ai_usage', {
  organizationId: text('organization_id').notNull(),
  period: text('period').notNull(), // YYYY-MM
  count: serial('count').default(0).notNull(),
});
