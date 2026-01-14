const VALIDATED_KEY = Symbol.for('flyyy.envValidated')

const REQUIRED_KEYS = [
  'NODE_ENV',
  'DATABASE_URL',
  'CLERK_SECRET_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
]

export function validateEnv(): void {
  // Ensure this runs only once per process
  const g = globalThis as any
  if (g[VALIDATED_KEY]) return

  const missing = REQUIRED_KEYS.filter((k) => !process.env[k])
  if (missing.length > 0) {
    // Log server-side only; do NOT include secret values
    try {
      // eslint-disable-next-line no-console
      console.error('Missing required environment variables', { missing })
    } catch (e) {
      // ignore logging failures
    }

    const err = new Error(`Missing required environment variables: ${missing.join(', ')}`)
    g[VALIDATED_KEY] = true
    throw err
  }

  g[VALIDATED_KEY] = true
}

export default validateEnv
