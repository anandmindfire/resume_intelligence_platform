import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { randomUUID } from 'crypto';
import { config } from '@resume-platform/config';
import { logger } from '@resume-platform/logger';
import { registerRoutes } from './routes';
import { errorHandler } from './middleware/errorHandler';
import { registerSwagger } from './plugins/swagger';
import { sharedSchemas } from './schemas/models.schemas';

/** Helmet security options (industry-standard HTTP headers). */
const helmetOptions = {
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

/** Rate limit for analytics API (per IP). */
const rateLimitOptions = {
  max: parseInt(process.env.RATE_LIMIT_MAX || '1000', 10),
  timeWindow: process.env.RATE_LIMIT_WINDOW || '15 minutes',
};

const corsOptions = {
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

/** Build the Fastify app without listening, so it can be started by index.ts or exercised in tests. */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    requestIdLogLabel: 'reqId',
    genReqId: () => randomUUID(),
  });

  // Route schemas document the API for Swagger only: controllers validate their own input and
  // responses are serialized as-is, so adding a schema never changes runtime behaviour.
  app.setValidatorCompiler(() => () => true);
  app.setSerializerCompiler(() => (data) => JSON.stringify(data));

  for (const schema of sharedSchemas) {
    app.addSchema(schema);
  }

  // Security: Helmet (HTTP headers), rate-limit, CORS
  await app.register(helmet, helmetOptions);
  await app.register(rateLimit, rateLimitOptions);
  await app.register(cors, corsOptions);

  if (config.apiDocs.enabled) {
    await registerSwagger(app);
  }

  // Request logging
  type RequestWithStartTime = { startTime?: number };
  app.addHook('onRequest', async (request, _reply) => {
    const start = Date.now();
    (request as RequestWithStartTime).startTime = start;
  });

  app.addHook('onSend', async (request, reply) => {
    const startTime = (request as RequestWithStartTime).startTime ?? Date.now();
    const duration = Date.now() - startTime;
    logger.info('HTTP Request', {
      method: request.method,
      path: request.url,
      statusCode: reply.statusCode,
      duration: `${duration}ms`,
      ip: request.ip,
    });
  });

  // Register routes (api/v1 structure)
  await registerRoutes(app);

  // Error handler
  app.setErrorHandler(errorHandler);

  return app;
}
