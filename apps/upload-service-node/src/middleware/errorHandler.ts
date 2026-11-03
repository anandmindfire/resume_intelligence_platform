import { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '@resume-platform/logger';

export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
) {
  logger.error('Upload service error', {
    error: error.message,
    stack: error.stack,
    path: request.url,
    method: request.method,
    statusCode: error.statusCode,
  });

  if (error.message.includes('File type') || error.message.includes('File size')) {
    return reply.status(400).send({ error: error.message });
  }

  const statusCode = error.statusCode || 500;

  // Client errors raised by Fastify and its plugins (e.g. 413 FST_REQ_FILE_TOO_LARGE) carry a safe,
  // actionable message; only server errors are masked.
  if (statusCode >= 400 && statusCode < 500) {
    return reply.status(statusCode).send({ error: error.message });
  }

  return reply.status(statusCode).send({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : undefined,
  });
}
