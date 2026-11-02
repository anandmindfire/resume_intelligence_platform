import { describe, expect, it, vi } from 'vitest';
import type { FastifyReply } from 'fastify';
import { sendError, sendSuccess } from './response';

function makeReply() {
  const reply = { status: vi.fn(), send: vi.fn() };
  reply.status.mockReturnValue(reply);
  reply.send.mockReturnValue(reply);
  return reply;
}

describe('sendSuccess', () => {
  it('wraps data with success: true and defaults to 200', () => {
    const reply = makeReply();
    sendSuccess(reply as unknown as FastifyReply, { id: 1 });
    expect(reply.status).toHaveBeenCalledWith(200);
    expect(reply.send).toHaveBeenCalledWith({ success: true, data: { id: 1 } });
  });

  it('uses the given status code', () => {
    const reply = makeReply();
    sendSuccess(reply as unknown as FastifyReply, null, 201);
    expect(reply.status).toHaveBeenCalledWith(201);
  });
});

describe('sendError', () => {
  it('wraps the message with success: false and defaults to 500', () => {
    const reply = makeReply();
    sendError(reply as unknown as FastifyReply, 'boom');
    expect(reply.status).toHaveBeenCalledWith(500);
    expect(reply.send).toHaveBeenCalledWith({ success: false, error: 'boom' });
  });

  it('uses the given status code', () => {
    const reply = makeReply();
    sendError(reply as unknown as FastifyReply, 'missing', 404);
    expect(reply.status).toHaveBeenCalledWith(404);
  });
});
