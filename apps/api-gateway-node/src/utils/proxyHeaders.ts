import type { IncomingHttpHeaders } from 'http';
import type { FastifyRequest } from 'fastify';
import { REQUEST_ID_HEADER } from '@resume-platform/http-kit';

/**
 * Headers the gateway sets on every proxied request, replacing whatever the client sent:
 *  - x-forwarded-for: `request.ip`, already resolved against TRUST_PROXY, so upstream services see the
 *    real client (not the gateway) and can rate-limit per client. Client-supplied values never pass through.
 *  - x-request-id: the validated/generated id, so one id follows the request into upstream logs.
 */
export function rewriteRequestHeaders(
  request: Pick<FastifyRequest, 'ip' | 'id'>,
  headers: IncomingHttpHeaders
): IncomingHttpHeaders {
  return {
    ...headers,
    'x-forwarded-for': request.ip,
    [REQUEST_ID_HEADER]: request.id,
  };
}
