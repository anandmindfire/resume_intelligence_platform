import { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import { config } from '@resume-platform/config';
import {
  buildCorsOptions,
  buildRateLimitOptions,
  createBaseApp,
  helmetOptions,
  registerInternalAuth,
  warnIfCorsUnrestricted,
} from '@resume-platform/http-kit';
import { registerRoutes } from './routes';
import { errorHandler } from './middleware/errorHandler';
import { registerSwagger } from './plugins/swagger';

/** Rate limit for the upload service (per client IP; see TRUST_PROXY so that's the real client, not the gateway). */
const rateLimitOptions = buildRateLimitOptions(500, 'upload-service');

const corsOptions = buildCorsOptions(['GET', 'POST', 'OPTIONS']);

/** Build the Fastify app without listening, so it can be started by index.ts or exercised in tests. */
export async function buildApp(): Promise<FastifyInstance> {
  // Request-id correlation, access logging and trustProxy come from the shared kit.
  const app = createBaseApp();
  app.setErrorHandler(errorHandler);

  // Route schemas document the API for Swagger only: controllers validate their own input and
  // responses are serialized as-is, so adding a schema never changes runtime behaviour.
  app.setValidatorCompiler(() => () => true);
  app.setSerializerCompiler(() => (data) => JSON.stringify(data));

  // Security: Helmet (HTTP headers), rate-limit, CORS
  warnIfCorsUnrestricted('upload-service');
  await app.register(helmet, helmetOptions);
  await app.register(rateLimit, rateLimitOptions);
  await app.register(cors, corsOptions);

  // Service-to-service routes (/api/internal/*) require the shared INTERNAL_API_TOKEN.
  registerInternalAuth(app, {
    token: config.internalApi.token,
    requireToken: process.env.NODE_ENV === 'production',
  });

  // Oversized files are flagged `truncated` rather than aborting the request, so the upload handlers can
  // reject them (413 for a single upload, a per-file failure in a batch) without losing the other files.
  // The count/size limits on parts, fields and headers stop a single request from exhausting the
  // process with thousands of tiny parts or huge non-file fields.
  await app.register(multipart, {
    limits: {
      fileSize: config.upload.maxSize,
      files: config.upload.maxFiles,
      fields: 10,
      fieldNameSize: 100,
      fieldSize: 1024,
      parts: config.upload.maxFiles + 10,
      headerPairs: 100,
    },
    throwFileSizeLimit: false,
  });

  if (config.apiDocs.enabled) {
    await registerSwagger(app);
  }

  // Register routes (api/v1 structure)
  await registerRoutes(app);

  return app;
}
