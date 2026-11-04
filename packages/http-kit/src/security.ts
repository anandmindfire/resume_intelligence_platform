import Redis from 'ioredis';
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

let rateLimitRedis: Redis | undefined;

/** One Redis connection per process for rate-limit counters, created on first use. */
function getRateLimitRedis(): Redis {
  rateLimitRedis ??= new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    // A slow or absent Redis must not stall every request: fail fast, then skipOnError lets it through.
    connectTimeout: 500,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });
  return rateLimitRedis;
}

/**
 * Per-client rate limit. `defaultMax` differs per service; RATE_LIMIT_MAX / RATE_LIMIT_WINDOW override it
 * everywhere.
 *
 * By default counters live in process memory, so with N replicas a client effectively gets N x max.
 * Set RATE_LIMIT_STORE=redis to keep the counters in Redis (REDIS_HOST / REDIS_PORT / REDIS_PASSWORD),
 * shared by every replica of the service. If Redis is unreachable requests are allowed rather than
 * failing (availability over strictness); the error is logged by the plugin.
 *
 * The client is identified by `request.ip`, which honours X-Forwarded-For only as far as TRUST_PROXY
 * allows (see README "Client identity behind proxies").
 */
export interface RateLimitOptions {
  max: number;
  timeWindow: string;
  redis?: Redis;
  nameSpace?: string;
  skipOnError?: boolean;
}

export function buildRateLimitOptions(defaultMax: number, service = 'api'): RateLimitOptions {
  const options: RateLimitOptions = {
    max: parseInt(process.env.RATE_LIMIT_MAX || String(defaultMax), 10),
    timeWindow: process.env.RATE_LIMIT_WINDOW || '15 minutes',
  };
  if (process.env.RATE_LIMIT_STORE?.trim().toLowerCase() !== 'redis') return options;
  return {
    ...options,
    redis: getRateLimitRedis(),
    nameSpace: `rate-limit:${service}:`,
    skipOnError: true,
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
