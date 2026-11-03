import { config } from '@resume-platform/config';
import { logger } from '@resume-platform/logger';

/** Helmet options shared by every HTTP service (industry-standard security headers; CSP is applied at the frontend). */
export const helmetOptions = {
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'same-site' as const },
  crossOriginOpenerPolicy: { policy: 'same-origin' as const },
  dnsPrefetchControl: { allow: false },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  ieNoOpen: true,
  noSniff: true,
  originAgentCluster: true,
  permittedCrossDomainPolicies: { permittedPolicies: 'none' as const },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' as const },
};

/** Per-IP rate limit. `defaultMax` differs per service; RATE_LIMIT_MAX / RATE_LIMIT_WINDOW override it everywhere. */
export function buildRateLimitOptions(defaultMax: number) {
  return {
    max: parseInt(process.env.RATE_LIMIT_MAX || String(defaultMax), 10),
    timeWindow: process.env.RATE_LIMIT_WINDOW || '15 minutes',
  };
}

/**
 * CORS options driven by CORS_ORIGINS. Credentials are only ever allowed together with an explicit
 * origin allow-list: reflecting arbitrary origins *and* allowing credentials would let any website
 * make authenticated requests on a user's behalf.
 */
export function buildCorsOptions(methods: string[]) {
  const origin = config.http.corsOrigins;
  return {
    origin,
    credentials: Array.isArray(origin),
    methods,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    exposedHeaders: ['X-Request-ID'],
  };
}

/** Logs once at startup when production is running with the permissive default CORS policy. */
export function warnIfCorsUnrestricted(service: string): void {
  if (process.env.NODE_ENV === 'production' && config.http.corsOriginsIsDefault) {
    logger.warn(
      `${service}: CORS_ORIGINS is not set, so any origin is allowed. Set it to an explicit allow-list (or "false" if the API is only used same-origin).`
    );
  }
}
