/**
 * Server-only helper to apply conservative security headers to API responses.
 *
 * - Runs on the server and must not log or expose secret values.
 * - Adds a safe Content-Security-Policy plus common hardening headers.
 * - Sets Strict-Transport-Security only when NODE_ENV=production.
 */
export function applySecurityHeaders(headers: Headers) {
  // Conservative CSP: block everything by default, allow same-origin for
  // connections and images needed by the app. Keep this minimal so it is
  // safe for server responses and doesn't accidentally expose secrets.
  const csp = [
    "default-src 'none'",
    "base-uri 'self'",
    "connect-src 'self'",
    "img-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join('; ')

  headers.set('Content-Security-Policy', csp)
  headers.set('X-Frame-Options', 'DENY')
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')

  // Only enable HSTS in real production builds where TLS is expected
  try {
    if (process.env.NODE_ENV === 'production') {
      // 1 year, include subdomains, preload safe default
      headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')
    }
  } catch (e) {
    // keep this helper safe to import in test environments
  }
}

export default applySecurityHeaders
