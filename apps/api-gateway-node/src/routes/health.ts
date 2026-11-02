import { FastifyInstance } from 'fastify';
import * as healthController from '../controllers/healthController';
import { healthSchema } from '../schemas/gateway.schemas';

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get('/health', { schema: healthSchema }, healthController.getHealth);
}
