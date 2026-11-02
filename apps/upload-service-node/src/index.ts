import { FastifyInstance } from 'fastify';
import { config } from '@resume-platform/config';
import { logger } from '@resume-platform/logger';
import { buildApp } from './app';

const PORT = config.uploadService.port;

let app: FastifyInstance | undefined;

const start = async () => {
  try {
    app = await buildApp();
    await app.listen({ port: PORT, host: '0.0.0.0', backlog: 512 });
    logger.info(`Upload Service running on port ${PORT}`);
  } catch (err) {
    logger.error('Error starting server', { error: err });
    process.exit(1);
  }
};

start();

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await app?.close();
  process.exit(0);
});
