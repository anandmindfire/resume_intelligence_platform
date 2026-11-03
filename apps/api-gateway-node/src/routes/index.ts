import { FastifyInstance } from 'fastify';
import httpProxy from '@fastify/http-proxy';
import { gatewayRoutes } from '../config/gatewayConfig';
import { registerHealthRoutes } from './health';
import { registerDocsRoutes } from './docs';
import { apiInfoSchema, apiV1InfoSchema } from '../schemas/gateway.schemas';
import { API_VERSION, PROXY, ROUTES } from '../constants';
import { rewriteRequestHeaders } from '../utils/proxyHeaders';

export async function registerRoutes(app: FastifyInstance, options: { docs?: boolean } = {}) {
  await registerHealthRoutes(app);
  if (options.docs) {
    await registerDocsRoutes(app);
  }

  // One reverse proxy per upstream route: /api/upload -> upload service, /api/analytics|jobs|resumes -> analytics API.
  for (const route of Object.values(gatewayRoutes)) {
    const responseTimeout = route.timeout ?? PROXY.DEFAULT_RESPONSE_TIMEOUT_MS;
    await app.register(httpProxy, {
      upstream: route.upstream,
      prefix: route.prefix,
      rewritePrefix: route.rewritePrefix,
      http2: false,
      // Without limits a hung upstream would hold gateway requests open indefinitely. A timeout surfaces as
      // 504 (see middleware/errorHandler.ts). Response timeouts cover time-to-first-byte and gaps between chunks.
      undici: {
        headersTimeout: responseTimeout,
        bodyTimeout: responseTimeout,
        connect: { timeout: PROXY.CONNECT_TIMEOUT_MS },
      },
      replyOptions: { rewriteRequestHeaders },
    });
  }

  // API v1 info (primary)
  app.get(ROUTES.API_V1, { schema: apiV1InfoSchema }, async () => ({
    message: 'Resume Intelligence Platform API',
    version: API_VERSION,
    apiVersion: 'v1',
    endpoints: {
      upload: gatewayRoutes.upload.prefix,
      analytics: gatewayRoutes.analytics.prefix,
      jobs: gatewayRoutes.jobs.prefix,
      resumes: gatewayRoutes.resumes.prefix,
    },
  }));

  // Legacy /api root (backward compatibility)
  app.get(ROUTES.API_LEGACY, { schema: apiInfoSchema }, async () => ({
    message: 'Resume Intelligence Platform API Gateway',
    version: API_VERSION,
    endpoints: {
      upload: gatewayRoutes.upload.prefix,
      analytics: gatewayRoutes.analytics.prefix,
      jobs: gatewayRoutes.jobs.prefix,
      resumes: gatewayRoutes.resumes.prefix,
    },
  }));
}
