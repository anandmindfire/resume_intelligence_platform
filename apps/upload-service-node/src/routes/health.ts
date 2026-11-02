import { FastifyInstance } from 'fastify';
import { healthSchema } from '../schemas/upload.schemas';

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get('/health', { schema: healthSchema }, async () => ({
    status: 'ok',
    service: 'upload-service',
    timestamp: new Date().toISOString(),
  }));
}
