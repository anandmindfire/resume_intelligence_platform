import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '@resume-platform/logger';
import { docsSources } from '../config/gatewayConfig';
import { fetchServiceSpec, rewriteSpecForGateway } from '../services/docsService';
import { sendError } from '../utils/response';
import { DOCS_ROUTE_PREFIX } from '../plugins/swagger';

async function getServiceSpec(request: FastifyRequest<{ Params: { service: string } }>, reply: FastifyReply) {
  const source = docsSources[request.params.service];
  if (!source) {
    return sendError(reply, `Unknown service "${request.params.service}"`, 404);
  }

  const upstream = source.routes[0].upstream;
  try {
    const spec = await fetchServiceSpec(upstream);
    return rewriteSpecForGateway(spec, source.routes);
  } catch (error) {
    logger.warn(`Failed to fetch API docs from ${upstream}`, { error });
    return sendError(reply, `${source.title} docs are unavailable`, 502);
  }
}

/** Upstream specs re-published with gateway paths (listed in the Swagger UI definition selector). */
export async function registerDocsRoutes(app: FastifyInstance) {
  app.get(`${DOCS_ROUTE_PREFIX}/services/:service/json`, { schema: { hide: true } }, getServiceSpec);
}
