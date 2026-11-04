import { timingSafeEqual } from 'crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { logger } from '@resume-platform/logger';

export const INTERNAL_TOKEN_HEADER = 'x-internal-token';
export const INTERNAL_ROUTE_PREFIX = '/api/internal/';

export interface InternalAuthOptions {
  /** Expected token (INTERNAL_API_TOKEN). Empty means "not configured". */
  token: string;
  /** When true (production), an unconfigured token refuses every internal request instead of allowing it. */
  requireToken: boolean;
  /** Path prefix the check applies to. */
  prefix?: string;
}

/** Constant-time string comparison (avoids leaking the token through response timing). */
export function tokensMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function headerValue(request: FastifyRequest): string {
  const value = request.headers[INTERNAL_TOKEN_HEADER];
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

/**
 * Protects service-to-service routes (`/api/internal/*`) with a shared secret, so they can't be called
 * by anything that merely reaches the service's port. Registered as an onRequest hook, so it also runs
 * before body parsing.
 */
export function registerInternalAuth(app: FastifyInstance, options: InternalAuthOptions): void {
  const prefix = options.prefix ?? INTERNAL_ROUTE_PREFIX;

  if (!options.token) {
    if (options.requireToken) {
      logger.error(
        `INTERNAL_API_TOKEN is not set: every request to ${prefix}* will be refused. Set the same value on the service and its internal callers.`
      );
    } else {
      logger.warn(
        `INTERNAL_API_TOKEN is not set: ${prefix}* is unauthenticated (allowed outside production only).`
      );
    }
  }

  app.addHook('onRequest', async (request, reply) => {
    // Match on the *routed* pattern, not the raw URL: the router decodes the path, so a raw-URL check
    // could be skipped with e.g. /api/%69nternal/... while still reaching the internal handler.
    const route = request.routeOptions?.url ?? request.url;
    if (!route.startsWith(prefix)) return;

    if (!options.token) {
      if (!options.requireToken) return;
      return reply.status(503).send({ error: 'Internal API is not configured' });
    }

    if (!tokensMatch(headerValue(request), options.token)) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
  });
}
