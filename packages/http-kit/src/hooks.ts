import type { FastifyInstance } from 'fastify';
import { logger } from '@resume-platform/logger';
import { REQUEST_ID_HEADER } from './requestId';

/** The slice of the shared logger the access log needs (lets tests pass a spy). */
export interface AccessLogger {
  info: (message: string, meta: Record<string, unknown>) => unknown;
}

/** Echo the request id on every response, including rejections (rate limiting, 404, validation) that never reach a handler. */
export function registerRequestContext(app: FastifyInstance): void {
  app.addHook('onRequest', async (request, reply) => {
    reply.header(REQUEST_ID_HEADER, request.id);
  });
}

/** Strip the query string: search terms (names, locations) are personal data that shouldn't sit in logs. */
function pathOf(url: string): string {
  const queryStart = url.indexOf('?');
  return queryStart === -1 ? url : url.slice(0, queryStart);
}

/**
 * One structured access-log line per response, tagged with the request id so a request can be followed
 * across services. `onResponse` fires after the response is written, so the duration is the real one.
 */
export function registerAccessLog(app: FastifyInstance, log: AccessLogger = logger): void {
  app.addHook('onResponse', async (request, reply) => {
    log.info('HTTP Request', {
      reqId: request.id,
      method: request.method,
      path: pathOf(request.url),
      statusCode: reply.statusCode,
      duration: `${Math.round(reply.elapsedTime)}ms`,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });
  });
}
