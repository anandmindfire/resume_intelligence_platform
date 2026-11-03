import { logger, getErrorMessage } from '@resume-platform/logger';
import { queueConsumer, QUEUE_NAMES } from '@resume-platform/queue-lib';
import { processExportJob } from './processors/exportProcessor';

const main = async () => {
  logger.info('Starting Export Worker');

  queueConsumer.createWorker(QUEUE_NAMES.EXPORT, processExportJob, {
    concurrency: 2,
  });

  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully');
    await queueConsumer.close();
    process.exit(0);
  });
};

main().catch((error: unknown) => {
  logger.error('Failed to start export worker', { error: getErrorMessage(error) });
  process.exit(1);
});
