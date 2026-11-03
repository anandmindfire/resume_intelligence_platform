import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

vi.mock('@resume-platform/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
  getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
  getErrorStack: (e: unknown) => (e instanceof Error ? e.stack : undefined),
}));

import { logger } from '@resume-platform/logger';
import { classifyUpstreamFailure, errorHandler, notFoundHandler } from './errorHandler';

function makeReply() {
  const reply = { status: vi.fn(), send: vi.fn() };
  reply.status.mockReturnValue(reply);
  reply.send.mockReturnValue(reply);
  return reply;
}

const request = {
  id: 'req-1234abcd',
  url: '/api/jobs?keyword=jane',
  method: 'GET',
} as FastifyRequest;

const makeError = (message: string, statusCode?: number, code?: string) =>
  Object.assign(new Error(message), { statusCode, code }) as FastifyError;

function run(error: FastifyError) {
  const reply = makeReply();
  errorHandler(error, request, reply as unknown as FastifyReply);
  return { reply, body: reply.send.mock.calls[0][0], status: reply.status.mock.calls[0][0] };
}

describe('classifyUpstreamFailure', () => {
  it.each([
    ['FST_REPLY_FROM_GATEWAY_TIMEOUT', 'Gateway Timeout'],
    ['FST_REPLY_FROM_TIMEOUT', 'Timeout'],
    ['FST_REPLY_FROM_HTTP_REQUEST_TIMEOUT', 'HTTP request timed out'],
    ['UND_ERR_CONNECT_TIMEOUT', 'Connect Timeout Error'],
    ['UND_ERR_HEADERS_TIMEOUT', 'Headers Timeout Error'],
    ['UND_ERR_BODY_TIMEOUT', 'Body Timeout Error'],
  ])('maps %s to 504', (code, message) => {
    expect(classifyUpstreamFailure(makeError(message, 500, code))).toEqual({
      statusCode: 504,
      message: 'Upstream service timed out',
    });
  });

  it.each([
    ['connect ECONNREFUSED 10.0.0.5:3001'],
    ['getaddrinfo ENOTFOUND upload-service'],
    ['getaddrinfo EAI_AGAIN upload-service'],
    ['connect EHOSTUNREACH 10.0.0.5:3001'],
  ])(
    'maps a refused/unresolvable connection ("%s") to 503 even though reply-from reports it as a generic error',
    (msg) => {
      expect(
        classifyUpstreamFailure(makeError(msg, 500, 'FST_REPLY_FROM_INTERNAL_SERVER_ERROR'))
      ).toEqual({
        statusCode: 503,
        message: 'Upstream service unavailable',
      });
    }
  );

  it('maps reply-from’s own 503 to 503', () => {
    expect(
      classifyUpstreamFailure(
        makeError('Service Unavailable', 503, 'FST_REPLY_FROM_SERVICE_UNAVAILABLE')
      )?.statusCode
    ).toBe(503);
  });

  it.each(['UND_ERR_SOCKET', 'ECONNRESET', 'FST_REPLY_FROM_INTERNAL_SERVER_ERROR'])(
    'maps %s to 502',
    (code) => {
      expect(classifyUpstreamFailure(makeError('socket hang up', 500, code))).toEqual({
        statusCode: 502,
        message: 'Bad gateway',
      });
    }
  );

  it.each([
    ['an ordinary error', makeError('boom', 500)],
    ['a rate limit', makeError('Rate limit exceeded', 429, 'FST_ERR_RATE_LIMIT')],
    ['an error with an unrelated code', makeError('nope', 400, 'FST_ERR_VALIDATION')],
  ])('leaves %s alone', (_label, error) => {
    expect(classifyUpstreamFailure(error)).toBeUndefined();
  });
});

describe('gateway errorHandler', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('turns upstream failures into 502/503/504 with a safe message and the request id', () => {
    vi.stubEnv('NODE_ENV', 'production');

    expect(run(makeError('Gateway Timeout', 504, 'FST_REPLY_FROM_GATEWAY_TIMEOUT'))).toMatchObject({
      status: 504,
      body: { success: false, error: 'Upstream service timed out', requestId: 'req-1234abcd' },
    });
    expect(
      run(
        makeError('connect ECONNREFUSED 10.0.0.5:3001', 500, 'FST_REPLY_FROM_INTERNAL_SERVER_ERROR')
      )
    ).toMatchObject({
      status: 503,
      body: { error: 'Upstream service unavailable' },
    });
    expect(run(makeError('Undici Socket Error', 500, 'UND_ERR_SOCKET'))).toMatchObject({
      status: 502,
      body: { error: 'Bad gateway' },
    });
  });

  it('never leaks upstream addresses in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { body } = run(
      makeError('connect ECONNREFUSED 10.0.0.5:3001', 500, 'FST_REPLY_FROM_INTERNAL_SERVER_ERROR')
    );

    expect(JSON.stringify(body)).not.toContain('10.0.0.5');
  });

  it('passes client errors through with their message, e.g. a rate limit (was masked as "Internal server error")', () => {
    vi.stubEnv('NODE_ENV', 'production');

    expect(
      run(makeError('Rate limit exceeded, retry in 15 minutes', 429, 'FST_ERR_RATE_LIMIT'))
    ).toMatchObject({
      status: 429,
      body: {
        success: false,
        error: 'Rate limit exceeded, retry in 15 minutes',
        requestId: 'req-1234abcd',
      },
    });
  });

  it('masks unexpected server errors in production and omits the stack', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { status, body } = run(makeError('db password is hunter2', 500));

    expect(status).toBe(500);
    expect(body).toEqual({
      success: false,
      error: 'Internal server error',
      requestId: 'req-1234abcd',
    });
  });

  it('defaults to 500 when the error has no status', () => {
    expect(run(makeError('mystery')).status).toBe(500);
  });

  it('includes the message and stack in development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const error = makeError('detail', 500);
    const { body } = run(error);

    expect(body).toMatchObject({ error: 'detail', stack: error.stack, requestId: 'req-1234abcd' });
  });

  it('logs server errors at error level and client errors at warn, without the query string', () => {
    run(makeError('boom', 500));
    run(makeError('Rate limit exceeded', 429));

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      'Request error',
      expect.objectContaining({
        reqId: 'req-1234abcd',
        path: '/api/jobs',
        method: 'GET',
        statusCode: 500,
      })
    );
  });
});

describe('notFoundHandler', () => {
  it('uses the gateway error envelope and includes the request id', () => {
    const reply = makeReply();
    notFoundHandler(request, reply as unknown as FastifyReply);

    expect(reply.status).toHaveBeenCalledWith(404);
    expect(reply.send).toHaveBeenCalledWith({
      success: false,
      error: 'Route not found',
      requestId: 'req-1234abcd',
    });
  });
});
