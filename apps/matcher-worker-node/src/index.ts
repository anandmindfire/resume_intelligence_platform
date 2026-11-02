import { logger } from '@resume-platform/logger';
import { queueConsumer } from '@resume-platform/queue-lib';
import { processMatchJob } from './processors/matchProcessor';
import { matcherQueueConfig } from './queues/queueConfig';

const main = async () => {
  logger.info('Starting Matcher Worker');

  queueConsumer.createWorker(
    matcherQueueConfig.queueName,
    processMatchJob,
    {
      concurrency: matcherQueueConfig.concurrency,
    }
  );

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully');
    await queueConsumer.close();
    process.exit(0);
  });
};

main().catch((error) => {
  logger.error('Failed to start matcher worker', { error: error.message });
  process.exit(1);
});
