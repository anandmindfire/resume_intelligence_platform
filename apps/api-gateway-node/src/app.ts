import { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { config } from '@resume-platform/config';
import { createBaseApp, warnIfCorsUnrestricted } from '@resume-platform/http-kit';
import { registerRoutes } from './routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { rateLimitConfig, corsConfig, helmetConfig } from './config/gatewayConfig';
import { registerSwagger } from './plugins/swagger';

/** Build the Fastify app without listening, so it can be started by index.ts or exercised in tests. */
export async function buildApp(): Promise<FastifyInstance> {
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

  if (config.apiDocs.enabled) {
    await registerSwagger(app);
  }

  // Register routes (health + proxy, plus upstream API docs when enabled)
  await registerRoutes(app, { docs: config.apiDocs.enabled });

  return app;
}
