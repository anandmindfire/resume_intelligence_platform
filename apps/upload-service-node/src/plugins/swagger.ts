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
        title: 'Upload Service API',
        description:
          'Accepts resume files (PDF, DOCX, JPEG, PNG), stores them, records them in Postgres and queues them for OCR. ' +
          'Clients normally reach these endpoints through the API gateway at /api/upload/*.',
        version: '1.0.0',
      },
      tags: [
        { name: 'Upload', description: 'Resume upload and file management' },
        { name: 'Internal', description: 'Service-to-service endpoints (not exposed through the gateway)' },
        { name: 'Health', description: 'Liveness checks' },
      ],
    },
  });

  await app.register(swaggerUi, { routePrefix: DOCS_ROUTE_PREFIX });
}
