import { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '@resume-platform/logger';

interface UpstreamFailure {
  statusCode: 502 | 503 | 504;
  message: string;
}

const UPSTREAM_TIMEOUT: UpstreamFailure = {
  statusCode: 504,
  message: 'Upstream service timed out',
};
const UPSTREAM_UNAVAILABLE: UpstreamFailure = {
  statusCode: 503,
  message: 'Upstream service unavailable',
};
const UPSTREAM_BAD_GATEWAY: UpstreamFailure = { statusCode: 502, message: 'Bad gateway' };

/** Error codes @fastify/reply-from / undici raise when the upstream is slow (all of these arrive as 500 or 504). */
const TIMEOUT_CODES = new Set([
  'FST_REPLY_FROM_TIMEOUT',
  'FST_REPLY_FROM_GATEWAY_TIMEOUT',
  'FST_REPLY_FROM_HTTP_REQUEST_TIMEOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
]);

/** Connection-level failures, which reply-from wraps in a generic error whose code hides the cause. */
const CONNECTION_REFUSED = /\b(ECONNREFUSED|ENOTFOUND|EAI_AGAIN|EHOSTUNREACH|ENETUNREACH)\b/;

/**
 * Classify errors that come from talking to an upstream service rather than from the request itself, so
 * clients and alerts see 502/503/504 instead of an opaque 500. Verified against the real failure modes:
 * hung upstream, refused connection, and a socket closed before any response.
 */
export function classifyUpstreamFailure(error: FastifyError): UpstreamFailure | undefined {
  const code = error.code ?? '';
  if (TIMEOUT_CODES.has(code)) return UPSTREAM_TIMEOUT;
  if (code === 'FST_REPLY_FROM_SERVICE_UNAVAILABLE' || CONNECTION_REFUSED.test(error.message)) {
    return UPSTREAM_UNAVAILABLE;
  }
  if (
    code === 'UND_ERR_SOCKET' ||
    code === 'ECONNRESET' ||
    code === 'FST_REPLY_FROM_INTERNAL_SERVER_ERROR'
  ) {
    return UPSTREAM_BAD_GATEWAY;
  }
  return undefined;
}

export function errorHandler(error: FastifyError, request: FastifyRequest, reply: FastifyReply) {
  const upstream = classifyUpstreamFailure(error);
  const statusCode = upstream?.statusCode ?? error.statusCode ?? 500;
  const isClientError = statusCode >= 400 && statusCode < 500;
  const isDevelopment = process.env.NODE_ENV === 'development';

  const logMeta = {
    reqId: request.id,
    error: error.message,
    code: error.code,
    stack: error.stack,
    path: request.url.split('?')[0],
    method: request.method,
    statusCode,
  };
  // Client errors (bad request, rate limited, ...) are routine and not actionable server-side.
  if (isClientError) {
    logger.warn('Request error', logMeta);
  } else {
    logger.error('Request error', logMeta);
  }

  // Upstream failures use fixed, safe messages; client errors (e.g. 429 "Rate limit exceeded") carry a message
  // the caller can act on; anything else is masked so internals never leak.
  const message =
    upstream?.message ?? (isClientError || isDevelopment ? error.message : 'Internal server error');

  return reply.status(statusCode).send({
    success: false,
    error: message,
    requestId: request.id,
    ...(isDevelopment && { stack: error.stack }),
  });
}

/** Unknown routes outside the proxied prefixes. Same envelope as every other gateway error. */
export function notFoundHandler(request: FastifyRequest, reply: FastifyReply) {
  return reply.status(404).send({
    success: false,
    error: 'Route not found',
    requestId: request.id,
  });
}
