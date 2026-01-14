import { db } from '@/libs/DB'
import { validateEnv } from '@/libs/validateEnv'

// Fail fast at module load during server boot
validateEnv()
import { organizationSchema } from '@/models/Schema'
import { getEntitlements, resolvePlanStrict } from '@/libs/Entitlements'
import { mapErrorToResponse } from '@/libs/ApiErrors'
import { logger } from '@/libs/Logger'
import { applySecurityHeaders } from '@/libs/SecurityHeaders'

type CheckState = 'ok' | 'fail'

export async function GET() {
  try {
    const checks: Record<string, CheckState> = {
      env: 'fail',
      db: 'fail',
      auth: 'fail',
      billing: 'fail',
      entitlements: 'fail',
    }

    // 1) Environment sanity
    checks.env = process.env.NODE_ENV ? 'ok' : 'fail'

    // 2) Database connectivity (light, read-only)
    try {
      // Attempt a minimal read which does not expose data
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any).select().from(organizationSchema).limit(1)
      checks.db = 'ok'
    } catch (e: any) {
      logger.error({ err: String(e) }, 'DB health check failed')
      checks.db = 'fail'
    }

    // 3) Clerk availability (import only)
    try {
      // dynamic import to avoid requiring runtime auth
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      await import('@clerk/nextjs/server')
      checks.auth = 'ok'
    } catch (e: any) {
      logger.error({ err: String(e) }, 'Clerk import failed')
      checks.auth = 'fail'
    }

    // 4) Stripe availability (import only)
    try {
      await import('stripe')
      checks.billing = 'ok'
    } catch (e: any) {
      logger.error({ err: String(e) }, 'Stripe import failed')
      checks.billing = 'fail'
    }

    // 5) Entitlements module resolves known plan
    try {
      resolvePlanStrict('starter')
      getEntitlements('starter')
      checks.entitlements = 'ok'
    } catch (e: any) {
      logger.error({ err: String(e) }, 'Entitlements check failed')
      checks.entitlements = 'fail'
    }

    const status = Object.values(checks).every((v) => v === 'ok') ? 'ok' : 'degraded'
    const httpStatus = status === 'ok' ? 200 : 503

    const body = {
      status,
      env: process.env.NODE_ENV ?? null,
      timestamp: new Date().toISOString(),
      checks,
    }

    const res = new Response(JSON.stringify(body), {
      status: httpStatus,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    })
    try {
      applySecurityHeaders(res.headers)
    } catch (e) {
      // ignore header application failures
    }
    return res
  } catch (err: any) {
    const mapped = mapErrorToResponse(err)
    try {
      logger.error({ err: String(err) }, 'Health endpoint error')
    } catch (e) {
      // ignore
    }
    const errRes = new Response(JSON.stringify(mapped.body), {
      status: mapped.status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    })
    try {
      applySecurityHeaders(errRes.headers)
    } catch (e) {
      // ignore
    }
    return errRes
  }
}

export const runtime = 'nodejs'
