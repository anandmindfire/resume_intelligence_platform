import { FastifyInstance } from 'fastify';
import { healthSchema } from '../schemas/analytics.schemas';

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get('/health', { schema: healthSchema }, async () => ({
    status: 'ok',
    service: 'analytics-api',
    timestamp: new Date().toISOString(),
  }));
}
