import { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

export const DOCS_ROUTE_PREFIX = '/docs';

/** OpenAPI spec at /docs/json and Swagger UI at /docs. Must be registered before routes. */
export async function registerSwagger(app: FastifyInstance) {
  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'Analytics API',
        description:
          'Read models for the dashboard: analytics, resume search, role matches and job roles. ' +
          'Clients normally reach these endpoints through the API gateway at /api/analytics/*, /api/jobs/* and /api/resumes/*.',
        version: '1.0.0',
      },
      tags: [
        { name: 'Analytics', description: 'Aggregated statistics and matches' },
        { name: 'Resumes', description: 'Resume search, details and export' },
        { name: 'Jobs', description: 'Job roles and their matches' },
        { name: 'Health', description: 'Liveness checks' },
      ],
    },
    // Name shared models after their $id (e.g. #/components/schemas/Resume) instead of def-0, def-1, ...
    refResolver: {
      buildLocalReference: (json, _baseUri, _fragment, i) => (json.$id as string) || `def-${i}`,
    },
  });

  await app.register(swaggerUi, { routePrefix: DOCS_ROUTE_PREFIX });
}
