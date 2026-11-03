import { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { docsSources, gatewayRoutes } from '../config/gatewayConfig';
import { API_VERSION } from '../constants';

export const DOCS_ROUTE_PREFIX = '/docs';

const proxiedPrefixes = Object.values(gatewayRoutes).map((route) => route.prefix);

/**
 * OpenAPI spec for the gateway's own routes at /docs/json, and Swagger UI at /docs with a
 * selector for the upstream service specs re-published under gateway paths. Must be registered
 * before routes.
 */
export async function registerSwagger(app: FastifyInstance) {
  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'Resume Intelligence Platform API Gateway',
        description:
          'Single entry point for the platform. Proxies /api/upload/* to the upload service and ' +
          '/api/analytics/*, /api/jobs/* and /api/resumes/* to the analytics API. ' +
          'Use the "Select a definition" menu to browse those APIs with gateway paths.',
        version: API_VERSION,
      },
      tags: [
        { name: 'Gateway', description: 'API discovery' },
        { name: 'Health', description: 'Aggregated health of the gateway and upstream services' },
      ],
    },
    // Proxied wildcard routes are documented by the upstream specs, not here.
    transform: ({ schema, url }) => ({
      schema: proxiedPrefixes.some((prefix) => url.startsWith(prefix))
        ? { ...schema, hide: true }
        : schema,
      url,
    }),
  });

  await app.register(swaggerUi, {
    routePrefix: DOCS_ROUTE_PREFIX,
    uiConfig: {
      urls: [
        { name: 'API Gateway', url: `${DOCS_ROUTE_PREFIX}/json` },
        ...Object.entries(docsSources).map(([service, source]) => ({
          name: `${source.title} (via gateway)`,
          url: `${DOCS_ROUTE_PREFIX}/services/${service}/json`,
        })),
      ],
    },
  });
}
