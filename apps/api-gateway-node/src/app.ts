import { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { config } from '@resume-platform/config';
import { createBaseApp, warnIfCorsUnrestricted } from '@resume-platform/http-kit';
import { logger } from '@resume-platform/logger';
import { registerRoutes } from './routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { rateLimitConfig, corsConfig, helmetConfig } from './config/gatewayConfig';
import { createIssuerKeyResolver, registerJwtAuth, type JwtAuthOptions } from './auth/jwtAuth';
import { ROUTES } from './constants';
import { DOCS_ROUTE_PREFIX, registerSwagger } from './plugins/swagger';

/** Routes reachable without a token. Everything else (all proxied APIs) requires one. */
export const PUBLIC_ROUTES = [
  ROUTES.HEALTH,
  ROUTES.API_LEGACY,
  ROUTES.API_V1,
  DOCS_ROUTE_PREFIX,
  `${DOCS_ROUTE_PREFIX}/*`,
];

/**
 * Decides how requests are authenticated:
 *  - OIDC_ISSUER + OIDC_AUDIENCE set -> bearer tokens from that issuer are required
 *  - AUTH_DISABLED=true             -> no auth (explicit opt-out, e.g. load tests)
 *  - neither, outside production    -> no auth, with a warning (local development)
 *  - neither, in production         -> refuse to start: never serve the API open by accident
 */
export function resolveAuthOptions(): JwtAuthOptions | null {
  const { oidcIssuer, oidcAudience, oidcJwksUri, requiredScope, disabled } = config.auth;
  if (disabled) {
    logger.warn(
      'AUTH_DISABLED=true: the API gateway is serving every route WITHOUT authentication.'
    );
    return null;
  }
  if (!oidcIssuer || !oidcAudience) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'Authentication is not configured: set OIDC_ISSUER and OIDC_AUDIENCE (or AUTH_DISABLED=true to run without auth).'
      );
    }
    logger.warn(
      'OIDC_ISSUER / OIDC_AUDIENCE not set: API gateway authentication is disabled (development only).'
    );
    return null;
  }
  return {
    issuer: oidcIssuer,
    audience: oidcAudience,
    keys: createIssuerKeyResolver(oidcIssuer, oidcJwksUri || undefined),
    requiredScope: requiredScope || undefined,
    publicRoutes: PUBLIC_ROUTES,
  };
}

/** Build the Fastify app without listening, so it can be started by index.ts or exercised in tests. */
export async function buildApp(
  options: { auth?: JwtAuthOptions | null } = {}
): Promise<FastifyInstance> {
  const authOptions = options.auth !== undefined ? options.auth : resolveAuthOptions();

  // Request-id correlation, access logging and trustProxy come from the shared kit (before any plugin,
  // so they also cover requests that rate limiting or CORS reject).
  const app = createBaseApp();

  // Must come before any plugin is registered: encapsulated plugins (the reverse proxies) capture the
  // handlers that exist when they're created, so registering these last would leave proxied routes on
  // Fastify's defaults, which echo raw upstream error messages to clients.
  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);

  // Route schemas document the API for Swagger only: requests and responses (including proxied
  // ones) pass through unchanged, so adding a schema never changes runtime behaviour.
  app.setValidatorCompiler(() => () => true);
  app.setSerializerCompiler(() => (data) => JSON.stringify(data));

  warnIfCorsUnrestricted('api-gateway');
  await app.register(cors, corsConfig);
  await app.register(helmet, helmetConfig);
  await app.register(rateLimit, rateLimitConfig);

  // After CORS (preflights are answered first) and rate limiting (unauthenticated floods are still
  // throttled), before any route.
  if (authOptions) {
    registerJwtAuth(app, authOptions);
  }

  if (config.apiDocs.enabled) {
    await registerSwagger(app);
  }

  // Register routes (health + proxy, plus upstream API docs when enabled)
  await registerRoutes(app, { docs: config.apiDocs.enabled });

  return app;
}
