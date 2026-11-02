import { logger } from '@resume-platform/logger';
import { queueConsumer } from '@resume-platform/queue-lib';
import { processExportJob } from './processors/exportProcessor';

const main = async () => {
  logger.info('Starting Export Worker');

  queueConsumer.createWorker(
    'export-queue',
    processExportJob,
    {
      concurrency: 2,
    }
  );

  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully');
    await queueConsumer.close();
    process.exit(0);
  });
};

main().catch((error) => {
  logger.error('Failed to start export worker', { error: error.message });
  process.exit(1);
});
