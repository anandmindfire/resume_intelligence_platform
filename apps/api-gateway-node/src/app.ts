import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { randomUUID } from 'crypto';
import { config } from '@resume-platform/config';
import { logger } from '@resume-platform/logger';
import { registerRoutes } from './routes';
import { errorHandler } from './middleware/errorHandler';
import { rateLimitConfig, corsConfig, helmetConfig } from './config/gatewayConfig';
import { registerSwagger } from './plugins/swagger';

/** Build the Fastify app without listening, so it can be started by index.ts or exercised in tests. */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false, // We use our custom logger
    requestIdLogLabel: 'reqId',
    genReqId: () => randomUUID(),
  });

  // Route schemas document the API for Swagger only: requests and responses (including proxied
  // ones) pass through unchanged, so adding a schema never changes runtime behaviour.
  app.setValidatorCompiler(() => () => true);
  app.setSerializerCompiler(() => (data) => JSON.stringify(data));

  // Register plugins
  await app.register(cors, corsConfig);

  await app.register(helmet, helmetConfig);

  await app.register(rateLimit, rateLimitConfig);

  if (config.apiDocs.enabled) {
    await registerSwagger(app);
  }

  // Request logging middleware
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
      userAgent: request.headers['user-agent'],
    });
  });

  // Register routes (health + proxy, plus upstream API docs when enabled)
  await registerRoutes(app, { docs: config.apiDocs.enabled });

  // Error handler
  app.setErrorHandler(errorHandler);

  return app;
}
