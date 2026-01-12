// Canonical env implementation. Expose validated runtime env and derived flags.
import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

// Create a validated env object. Keep keys explicit so runtime values are
// typed and missing optional keys don't crash the app.
export const Env = createEnv({
  server: {
    CLERK_SECRET_KEY: z.string().min(1),
    DATABASE_URL: z.string().optional(),
    LOGTAIL_SOURCE_TOKEN: z.string().optional(),
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_PRICE_BASIC: z.string().optional(),
    STRIPE_PRICE_PRO: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    BILLING_PLAN_ENV: z.enum(['dev', 'test', 'prod']).optional(),
    OPENAI_API_KEY: z.string().optional(),
    NEXT_PHASE: z.string().optional(),
    NEXT_RUNTIME: z.string().optional(),
    VERCEL_ENV: z.string().optional(),
    VERCEL_PROJECT_PRODUCTION_URL: z.string().optional(),
    VERCEL_URL: z.string().optional(),
    APP_URL: z.string().optional(),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.string().optional(),
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().optional(),
    NEXT_PUBLIC_CLERK_SIGN_IN_URL: z.string().optional(),
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
    NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
  },
  shared: {
    NODE_ENV: z.enum(['test', 'development', 'production']).optional(),
  },
  runtimeEnv: {
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
    DATABASE_URL: process.env.DATABASE_URL,
    LOGTAIL_SOURCE_TOKEN: process.env.LOGTAIL_SOURCE_TOKEN,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_PRICE_BASIC: process.env.STRIPE_PRICE_BASIC,
    STRIPE_PRICE_PRO: process.env.STRIPE_PRICE_PRO,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    BILLING_PLAN_ENV: process.env.BILLING_PLAN_ENV,
    APP_URL: process.env.APP_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    NEXT_PUBLIC_CLERK_SIGN_IN_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    NEXT_PHASE: process.env.NEXT_PHASE,
    NEXT_RUNTIME: process.env.NEXT_RUNTIME,
    VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
    VERCEL_URL: process.env.VERCEL_URL,
    NODE_ENV: process.env.NODE_ENV,
  },
})

// Export convenient, well-typed primitives to enforce a single import pattern
export const NODE_ENV = Env.NODE_ENV
export const NEXT_PHASE = Env.NEXT_PHASE
export const NEXT_RUNTIME = Env.NEXT_RUNTIME

export const NEXT_PUBLIC_APP_URL = Env.NEXT_PUBLIC_APP_URL
export const NEXT_PUBLIC_SENTRY_DSN = Env.NEXT_PUBLIC_SENTRY_DSN

export const DATABASE_URL = Env.DATABASE_URL

export const STRIPE_SECRET_KEY = Env.STRIPE_SECRET_KEY
export const STRIPE_WEBHOOK_SECRET = Env.STRIPE_WEBHOOK_SECRET
export const STRIPE_PRICE_BASIC = Env.STRIPE_PRICE_BASIC
export const STRIPE_PRICE_PRO = Env.STRIPE_PRICE_PRO
export const NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = Env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

export const OPENAI_API_KEY = Env.OPENAI_API_KEY

export const VERCEL_ENV = Env.VERCEL_ENV
export const VERCEL_PROJECT_PRODUCTION_URL = Env.VERCEL_PROJECT_PRODUCTION_URL
export const VERCEL_URL = Env.VERCEL_URL

// Feature flags derived from presence of keys (explicit and readable)
export const isAIEnabled = Boolean(OPENAI_API_KEY)
export const isBillingEnabled = Boolean(STRIPE_SECRET_KEY || NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)

// Small helper: safe base URL if configured
export const getConfiguredAppUrl = () => NEXT_PUBLIC_APP_URL ?? Env.APP_URL ?? undefined

// Client-only flags (safe to import in `use client` files)
export const isBillingEnabledClient = Boolean(Env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
export const isAIEnabledClient = Boolean(Env.OPENAI_API_KEY)

export default Env
export * from './env'
