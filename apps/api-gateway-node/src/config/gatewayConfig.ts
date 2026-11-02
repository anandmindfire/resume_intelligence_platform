import { config } from '@resume-platform/config';
import type { GatewayRouteConfig } from '../types';

/** Helmet security options (industry-standard HTTP headers). */
export const helmetConfig = {
  contentSecurityPolicy: false, // API gateway proxies; CSP applied at frontend if needed
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'same-site' as const },
  crossOriginOpenerPolicy: { policy: 'same-origin' as const },
  dnsPrefetchControl: { allow: false },
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  ieNoOpen: true,
  noSniff: true,
  originAgentCluster: true,
  permittedCrossDomainPolicies: { permittedPolicies: 'none' as const },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' as const },
};

/** All backend services expose APIs under /api/v1; gateway rewrites client paths to these. */
export const gatewayRoutes: Record<string, GatewayRouteConfig> = {
  upload: {
    upstream: config.uploadService.url,
    prefix: '/api/upload',
    rewritePrefix: '/api/v1/upload',
    timeout: 60000, // 60s for batch uploads; scale upload-service replicas for capacity
  },
  analytics: {
    upstream: config.analyticsApi.url,
    prefix: '/api/analytics',
    rewritePrefix: '/api/v1',
    timeout: 10000,
  },
  jobs: {
    upstream: config.analyticsApi.url,
    prefix: '/api/jobs',
    rewritePrefix: '/api/v1/jobs',
    timeout: 10000,
  },
  resumes: {
    upstream: config.analyticsApi.url,
    prefix: '/api/resumes',
    rewritePrefix: '/api/v1/resumes',
    timeout: 10000,
  },
};

// Rate limit: set RATE_LIMIT_MAX high (e.g. 10000) for load testing so uploads don't get 429
export const rateLimitConfig = {
  max: parseInt(process.env.RATE_LIMIT_MAX || '10000', 10),
  timeWindow: process.env.RATE_LIMIT_WINDOW || '15 minutes',
};

export const corsConfig = {
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

/**
 * Upstream services whose OpenAPI specs the gateway re-publishes with gateway paths.
 * Each spec is fetched from the upstream of its first route.
 */
export const docsSources: Record<string, { title: string; routes: GatewayRouteConfig[] }> = {
  upload: {
    title: 'Upload Service',
    routes: [gatewayRoutes.upload],
  },
  analytics: {
    title: 'Analytics API',
    routes: [gatewayRoutes.analytics, gatewayRoutes.jobs, gatewayRoutes.resumes],
  },
};
