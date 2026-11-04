import { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { config } from '@resume-platform/config';
import {
  buildCorsOptions,
  buildRateLimitOptions,
  createBaseApp,
  helmetOptions,
  warnIfCorsUnrestricted,
} from '@resume-platform/http-kit';
import { registerRoutes } from './routes';
import { errorHandler } from './middleware/errorHandler';
import { registerSwagger } from './plugins/swagger';
import { sharedSchemas } from './schemas/models.schemas';

/** Rate limit for the analytics API (per client IP; see TRUST_PROXY so that's the real client, not the gateway). */
const rateLimitOptions = buildRateLimitOptions(1000, 'analytics-api');

const corsOptions = buildCorsOptions(['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']);

/** Build the Fastify app without listening, so it can be started by index.ts or exercised in tests. */
export async function buildApp(): Promise<FastifyInstance> {
  // Request-id correlation, access logging and trustProxy come from the shared kit.
  const app = createBaseApp();
  app.setErrorHandler(errorHandler);

  // Route schemas document the API for Swagger only: controllers validate their own input and
  // responses are serialized as-is, so adding a schema never changes runtime behaviour.
  app.setValidatorCompiler(() => () => true);
  app.setSerializerCompiler(() => (data) => JSON.stringify(data));

  for (const schema of sharedSchemas) {
    app.addSchema(schema);
  }

  // Security: Helmet (HTTP headers), rate-limit, CORS
  warnIfCorsUnrestricted('analytics-api');
  await app.register(helmet, helmetOptions);
  await app.register(rateLimit, rateLimitOptions);
  await app.register(cors, corsOptions);

  if (config.apiDocs.enabled) {
    await registerSwagger(app);
  }

  // Register routes (api/v1 structure)
  await registerRoutes(app);

  return app;
}
