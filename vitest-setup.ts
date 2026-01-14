import '@testing-library/jest-dom/vitest';

import failOnConsole from 'vitest-fail-on-console';

failOnConsole({
  shouldFailOnDebug: true,
  shouldFailOnError: true,
  shouldFailOnInfo: true,
  shouldFailOnLog: true,
  shouldFailOnWarn: true,
});

// Set up environment variables for testing
process.env.BILLING_PLAN_ENV = 'test';

// Provide a safe mock for server-side env module so client-side (jsdom)
// tests that import `@/libs/Env` do not attempt to access real server
// environment variables. This prevents "attempted to access server-side
// env on client" errors when components import helpers that pull from
// `@/libs/Env`.
import { vi } from 'vitest'

const mockEnvModule = {
  Env: {
    NODE_ENV: 'test',
    NEXT_PHASE: 'test',
    NEXT_RUNTIME: 'nodejs',
    NEXT_PUBLIC_APP_URL: 'http://localhost',
    NEXT_PUBLIC_SENTRY_DSN: '',
    DATABASE_URL: undefined,
    STRIPE_SECRET_KEY: undefined,
    STRIPE_WEBHOOK_SECRET: undefined,
    STRIPE_PRICE_BASIC: undefined,
    STRIPE_PRICE_PRO: undefined,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: undefined,
    OPENAI_API_KEY: undefined,
    VERCEL_ENV: undefined,
    VERCEL_PROJECT_PRODUCTION_URL: undefined,
    VERCEL_URL: undefined,
    APP_URL: undefined,
  },
  NODE_ENV: 'test',
  NEXT_PHASE: 'test',
  NEXT_RUNTIME: 'nodejs',
  NEXT_PUBLIC_APP_URL: 'http://localhost',
  NEXT_PUBLIC_SENTRY_DSN: '',
  DATABASE_URL: undefined,
  STRIPE_SECRET_KEY: undefined,
  STRIPE_WEBHOOK_SECRET: undefined,
  STRIPE_PRICE_BASIC: undefined,
  STRIPE_PRICE_PRO: undefined,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: undefined,
  OPENAI_API_KEY: undefined,
  VERCEL_ENV: undefined,
  VERCEL_PROJECT_PRODUCTION_URL: undefined,
  VERCEL_URL: undefined,
  isAIEnabled: false,
  isBillingEnabled: false,
  getConfiguredAppUrl: () => undefined,
  isBillingEnabledClient: false,
  isAIEnabledClient: false,
  default: {},
}

vi.mock('@/libs/Env', () => mockEnvModule)
vi.mock('@/libs/env', () => mockEnvModule)
