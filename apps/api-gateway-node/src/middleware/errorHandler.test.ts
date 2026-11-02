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

const request = { url: '/api/jobs', method: 'GET' } as FastifyRequest;
const makeError = (message: string, statusCode?: number) =>
  Object.assign(new Error(message), { statusCode }) as FastifyError;

describe('gateway errorHandler', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('logs the error with request context', () => {
    errorHandler(makeError('boom', 502), request, makeReply() as unknown as FastifyReply);
    expect(logger.error).toHaveBeenCalledWith(
      'Request error',
      expect.objectContaining({ error: 'boom', path: '/api/jobs', method: 'GET', statusCode: 502 })
    );
  });

  it('hides details outside development', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const reply = makeReply();
    errorHandler(makeError('secret', 429), request, reply as unknown as FastifyReply);

    expect(reply.status).toHaveBeenCalledWith(429);
    expect(reply.send).toHaveBeenCalledWith({ success: false, error: 'Internal server error' });
  });

  it('defaults to 500 and includes message and stack in development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const reply = makeReply();
    const error = makeError('detail');
    errorHandler(error, request, reply as unknown as FastifyReply);

    expect(reply.status).toHaveBeenCalledWith(500);
    expect(reply.send).toHaveBeenCalledWith({ success: false, error: 'detail', stack: error.stack });
  });
});
