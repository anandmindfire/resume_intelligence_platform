import { FastifyInstance } from 'fastify';
import httpProxy from '@fastify/http-proxy';
import { gatewayRoutes } from '../config/gatewayConfig';
import { registerHealthRoutes } from './health';
import { registerDocsRoutes } from './docs';
import { apiInfoSchema, apiV1InfoSchema } from '../schemas/gateway.schemas';

export async function registerRoutes(app: FastifyInstance, options: { docs?: boolean } = {}) {
  await registerHealthRoutes(app);
  if (options.docs) {
    await registerDocsRoutes(app);
  }

  // Proxy to upload service
  await app.register(httpProxy, {
    upstream: gatewayRoutes.upload.upstream,
    prefix: gatewayRoutes.upload.prefix,
    rewritePrefix: gatewayRoutes.upload.rewritePrefix,
    http2: false,
    preHandler: async (request, reply) => {
      // Optional: add custom logic before proxying
    },
    replyOptions: {
      rewriteRequestHeaders: (originalReq, headers) => {
        return {
          ...headers,
          'x-forwarded-for': originalReq.ip || '',
        };
      },
    },
  });

  // Proxy to analytics API (dashboard, skills, experience, education, matches, export)
  await app.register(httpProxy, {
    upstream: gatewayRoutes.analytics.upstream,
    prefix: gatewayRoutes.analytics.prefix,
    rewritePrefix: gatewayRoutes.analytics.rewritePrefix,
    http2: false,
  });

  // Proxy to jobs API (analytics service, /api/v1/jobs)
  await app.register(httpProxy, {
    upstream: gatewayRoutes.jobs.upstream,
    prefix: gatewayRoutes.jobs.prefix,
    rewritePrefix: gatewayRoutes.jobs.rewritePrefix,
    http2: false,
  });

  // Proxy to resumes API (analytics service, /api/v1/resumes)
  await app.register(httpProxy, {
    upstream: gatewayRoutes.resumes.upstream,
    prefix: gatewayRoutes.resumes.prefix,
    rewritePrefix: gatewayRoutes.resumes.rewritePrefix,
    http2: false,
  });

  // API v1 info (primary)
  app.get('/api/v1', { schema: apiV1InfoSchema }, async () => ({
    message: 'Resume Intelligence Platform API',
    version: '1.0.0',
    apiVersion: 'v1',
    endpoints: {
      upload: gatewayRoutes.upload.prefix,
      analytics: gatewayRoutes.analytics.prefix,
      jobs: gatewayRoutes.jobs.prefix,
      resumes: gatewayRoutes.resumes.prefix,
    },
  }));

  // Legacy /api root (backward compatibility)
  app.get('/api', { schema: apiInfoSchema }, async () => ({
    message: 'Resume Intelligence Platform API Gateway',
    version: '1.0.0',
    endpoints: {
      upload: gatewayRoutes.upload.prefix,
      analytics: gatewayRoutes.analytics.prefix,
      jobs: gatewayRoutes.jobs.prefix,
      resumes: gatewayRoutes.resumes.prefix,
    },
  }));
}
