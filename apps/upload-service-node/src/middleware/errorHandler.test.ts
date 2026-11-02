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

const request = { url: '/api/v1/upload/single', method: 'POST' } as FastifyRequest;
const makeError = (message: string, statusCode?: number) =>
  Object.assign(new Error(message), { statusCode }) as FastifyError;

describe('upload errorHandler', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('logs the error with request context', () => {
    errorHandler(makeError('boom', 500), request, makeReply() as unknown as FastifyReply);

    expect(logger.error).toHaveBeenCalledWith(
      'Upload service error',
      expect.objectContaining({ error: 'boom', path: request.url, method: 'POST', statusCode: 500 })
    );
  });

  it.each(['File type text/plain not allowed', 'File size limit reached'])(
    'maps "%s" to a 400 with the message',
    (message) => {
      const reply = makeReply();
      errorHandler(makeError(message), request, reply as unknown as FastifyReply);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({ error: message });
    }
  );

  it('uses the error status code and hides the message outside development', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const reply = makeReply();
    errorHandler(makeError('secret detail', 413), request, reply as unknown as FastifyReply);

    expect(reply.status).toHaveBeenCalledWith(413);
    expect(reply.send).toHaveBeenCalledWith({ error: 'Internal server error', message: undefined });
  });

  it('defaults to 500 and exposes the message in development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const reply = makeReply();
    errorHandler(makeError('detail'), request, reply as unknown as FastifyReply);

    expect(reply.status).toHaveBeenCalledWith(500);
    expect(reply.send).toHaveBeenCalledWith({ error: 'Internal server error', message: 'detail' });
  });
});
