import { FastifyInstance } from 'fastify';
import * as healthController from '../controllers/healthController';
import { healthSchema } from '../schemas/gateway.schemas';
import { ROUTES } from '../constants';

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get(ROUTES.HEALTH, { schema: healthSchema }, healthController.getHealth);
}
