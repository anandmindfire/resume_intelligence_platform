import * as dotenv from 'dotenv';

dotenv.config();

export interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  poolMax?: number;
}

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
}

export interface QueueConfig {
  redis: RedisConfig;
  concurrency: number;
  attempts: number;
  backoffDelay: number;
}

export interface UploadConfig {
  maxSize: number;
  allowedTypes: string[];
  directory?: string;
  /** Max concurrent upload requests per process (0 = no limit). Used to avoid OOM under burst. */
  maxConcurrent?: number;
  /** Max files accepted in one multipart request. */
  maxFiles: number;
}

/**
 * Fastify `trustProxy` setting from TRUST_PROXY.
 *
 * - unset / "false" -> false (don't trust X-Forwarded-* headers; the safe default)
 * - "true"          -> true  (trust every hop; only safe if clients can never reach the service directly)
 * - "1", "2", ...   -> number of trusted proxy hops in front of the service
 * - anything else   -> comma-separated list of trusted proxy IPs / CIDRs
 *
 * It decides what `request.ip` is, and therefore who per-IP rate limiting is applied to.
 */
export function parseTrustProxy(value: string | undefined): boolean | number | string[] {
  const raw = value?.trim();
  if (!raw || raw.toLowerCase() === 'false') return false;
  if (raw.toLowerCase() === 'true') return true;
  if (/^\d+$/.test(raw)) return parseInt(raw, 10);
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * CORS `origin` setting from CORS_ORIGINS.
 *
 * - unset           -> true  (reflect any origin; the legacy behaviour, fine behind a same-origin proxy)
 * - "false"         -> false (no cross-origin access)
 * - comma-separated -> exact origin allow-list
 */
export function parseCorsOrigins(value: string | undefined): boolean | string[] {
  const raw = value?.trim();
  if (!raw) return true;
  if (raw.toLowerCase() === 'false') return false;
  if (raw.toLowerCase() === 'true') return true;
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export const config = {
  database: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    user: process.env.POSTGRES_USER || 'resume_user',
    password: process.env.POSTGRES_PASSWORD || 'resume_password',
    database: process.env.POSTGRES_DB || 'resume_db',
    poolMax: parseInt(process.env.DB_POOL_MAX || '20', 10),
  } as DatabaseConfig,

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
  } as RedisConfig,

  queue: {
    redis: {
      host: process.env.QUEUE_REDIS_HOST || process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.QUEUE_REDIS_PORT || process.env.REDIS_PORT || '6379', 10),
      password: process.env.QUEUE_REDIS_PASSWORD || process.env.REDIS_PASSWORD,
    },
    concurrency: parseInt(process.env.QUEUE_CONCURRENCY || '5', 10),
    attempts: parseInt(process.env.QUEUE_ATTEMPTS || '3', 10),
    backoffDelay: parseInt(process.env.QUEUE_BACKOFF_DELAY || '5000', 10),
  } as QueueConfig,

  upload: {
    maxSize: parseInt(process.env.UPLOAD_MAX_SIZE || '10485760', 10), // 10MB default
    allowedTypes: (
      process.env.UPLOAD_ALLOWED_TYPES ||
      'application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png'
    ).split(','),
    directory: process.env.UPLOAD_DIRECTORY || '/app/uploads',
    maxConcurrent: parseInt(process.env.UPLOAD_MAX_CONCURRENT || '0', 10), // 0 = no limit; set per-replica under burst (e.g. 50)
    maxFiles: parseInt(process.env.UPLOAD_MAX_FILES || '20', 10),
  } as UploadConfig,

  internalApi: {
    /**
     * Shared secret service-to-service calls to /api/internal/* must present in `X-Internal-Token`.
     * Required in production (requests are refused when it is unset); optional in development.
     */
    token: process.env.INTERNAL_API_TOKEN || '',
  },

  apiGateway: {
    port: parseInt(process.env.API_GATEWAY_PORT || '3000', 10),
    host: process.env.API_GATEWAY_HOST || '0.0.0.0',
  },

  uploadService: {
    port: parseInt(process.env.UPLOAD_SERVICE_PORT || '3001', 10),
    url: process.env.UPLOAD_SERVICE_URL || 'http://localhost:3001',
  },

  analyticsApi: {
    port: parseInt(process.env.ANALYTICS_API_PORT || '3002', 10),
    url: process.env.ANALYTICS_API_URL || 'http://localhost:3002',
  },

  http: {
    /** See parseTrustProxy. Set per deployment: it depends on how many proxies sit in front of each service. */
    trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
    /** See parseCorsOrigins. In production set an explicit allow-list (or "false" if everything is same-origin). */
    corsOrigins: parseCorsOrigins(process.env.CORS_ORIGINS),
    /** True when CORS_ORIGINS wasn't set explicitly; lets services warn about the permissive default in production. */
    corsOriginsIsDefault: !process.env.CORS_ORIGINS?.trim(),
  },

  apiDocs: {
    /** Serve Swagger UI at /docs and the OpenAPI spec at /docs/json (set API_DOCS_ENABLED=false to disable). */
    enabled: process.env.API_DOCS_ENABLED !== 'false',
  },

  auth: {
    /**
     * OpenID Connect issuer (e.g. https://login.example.com/realms/resumes). When set, the API gateway
     * requires a valid `Authorization: Bearer <access token>` from this issuer on every non-public route.
     * Required in production unless AUTH_DISABLED=true.
     */
    oidcIssuer: (process.env.OIDC_ISSUER || '').trim(),
    /** Expected `aud` claim of access tokens (usually the API's identifier / client id). */
    oidcAudience: (process.env.OIDC_AUDIENCE || '').trim(),
    /** JWKS URL; discovered from the issuer's /.well-known/openid-configuration when unset. */
    oidcJwksUri: (process.env.OIDC_JWKS_URI || '').trim(),
    /** Optional scope every token must carry (space-separated `scope` or `scp` claim). */
    requiredScope: (process.env.OIDC_REQUIRED_SCOPE || '').trim(),
    /** Explicit opt-out (e.g. load tests). Never set in an internet-facing deployment. */
    disabled: process.env.AUTH_DISABLED === 'true',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'your-secret-key',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },

  ocr: {
    concurrency: parseInt(process.env.OCR_WORKER_CONCURRENCY || '3', 10),
    tesseractLang: process.env.TESSERACT_LANG || 'eng',
  },

  parser: {
    concurrency: parseInt(process.env.PARSER_WORKER_CONCURRENCY || '3', 10),
  },

  matcher: {
    concurrency: parseInt(process.env.MATCHER_WORKER_CONCURRENCY || '5', 10),
  },

  insights: {
    concurrency: parseInt(process.env.INSIGHTS_WORKER_CONCURRENCY || '2', 10),
  },
};

export default config;
