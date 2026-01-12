import * as Sentry from '@sentry/nextjs';
import { NEXT_RUNTIME, NEXT_PUBLIC_SENTRY_DSN, NODE_ENV } from '@/libs/env';

export async function register() {
  if (NEXT_RUNTIME === 'nodejs') {
    Sentry.init({
      dsn: NEXT_PUBLIC_SENTRY_DSN,
      spotlight: NODE_ENV === 'development',
      tracesSampleRate: 1,
      debug: false,
    });
  }

  if (NEXT_RUNTIME === 'edge') {
    Sentry.init({
      dsn: NEXT_PUBLIC_SENTRY_DSN,
      spotlight: NODE_ENV === 'development',
      tracesSampleRate: 1,
      debug: false,
    });
  }
}
