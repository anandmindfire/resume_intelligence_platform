import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

vi.mock('@resume-platform/logger', () => ({ logger: { error: vi.fn() } }));

import { logger } from '@resume-platform/logger';
import { errorHandler } from './errorHandler';

function makeReply() {
  const reply = { status: vi.fn(), send: vi.fn() };
  reply.status.mockReturnValue(reply);
  reply.send.mockReturnValue(reply);
  return reply;
}

const request = { url: '/api/v1/dashboard', method: 'GET' } as FastifyRequest;
const makeError = (message: string, statusCode?: number) =>
  Object.assign(new Error(message), { statusCode }) as FastifyError;

describe('analytics errorHandler', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('logs the error with request context', () => {
    errorHandler(makeError('boom', 503), request, makeReply() as unknown as FastifyReply);
    expect(logger.error).toHaveBeenCalledWith(
      'Analytics API error',
      expect.objectContaining({ error: 'boom', path: '/api/v1/dashboard', method: 'GET', statusCode: 503 })
    );
  });

  it('hides the message outside development', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const reply = makeReply();
    errorHandler(makeError('secret', 503), request, reply as unknown as FastifyReply);

    expect(reply.status).toHaveBeenCalledWith(503);
    expect(reply.send).toHaveBeenCalledWith({ error: 'Internal server error', statusCode: 503 });
  });

  it('defaults to 500 and includes the message in development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const reply = makeReply();
    errorHandler(makeError('detail'), request, reply as unknown as FastifyReply);

    expect(reply.status).toHaveBeenCalledWith(500);
    expect(reply.send).toHaveBeenCalledWith({ error: 'Internal server error', statusCode: 500, message: 'detail' });
  });
});
