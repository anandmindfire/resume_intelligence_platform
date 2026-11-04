import type { IncomingHttpHeaders } from 'http';
import type { FastifyRequest } from 'fastify';
import '../auth/jwtAuth'; // FastifyRequest.user augmentation
import { REQUEST_ID_HEADER } from '@resume-platform/http-kit';

/** Header carrying the authenticated subject (`sub`) to upstream services. Only the gateway sets it. */
export const USER_SUB_HEADER = 'x-user-sub';

/**
 * Client headers that must never reach an upstream:
 *  - authorization: the access token is verified here; upstreams don't need it (and shouldn't log it)
 *  - x-internal-token: service-to-service secret; a client must not be able to present one through us
 *  - x-user-sub: identity is asserted by the gateway only, never by the client
 */
const STRIPPED_HEADERS = ['authorization', 'x-internal-token', USER_SUB_HEADER];

/**
 * Headers the gateway sets on every proxied request, replacing whatever the client sent:
 *  - x-forwarded-for: `request.ip`, already resolved against TRUST_PROXY, so upstream services see the
 *    real client (not the gateway) and can rate-limit per client. Client-supplied values never pass through.
 *  - x-request-id: the validated/generated id, so one id follows the request into upstream logs.
 *  - x-user-sub: the verified token subject, when the request was authenticated.
 */
export function rewriteRequestHeaders(
  request: Pick<FastifyRequest, 'ip' | 'id' | 'user'>,
  headers: IncomingHttpHeaders
): IncomingHttpHeaders {
  const forwarded: IncomingHttpHeaders = { ...headers };
  for (const name of STRIPPED_HEADERS) delete forwarded[name];
  return {
    ...forwarded,
    'x-forwarded-for': request.ip,
    [REQUEST_ID_HEADER]: request.id,
    ...(request.user ? { [USER_SUB_HEADER]: request.user.sub } : {}),
  };
}
