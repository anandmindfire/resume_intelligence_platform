import Redis from 'ioredis';
import { config } from '@resume-platform/config';
import { logger, getErrorMessage } from '@resume-platform/logger';
import { QUEUE_NAMES } from '@resume-platform/queue-lib';
import { INSIGHTS_ACTIONS } from '../constants';

// Redis client for simple list queues (used by Python workers)
const redisClient = new Redis({
  host: config.queue.redis.host,
  port: config.queue.redis.port,
  password: config.queue.redis.password,
  maxRetriesPerRequest: 3,
});

export class QueueHandler {
  /**
   * Triggers the insights aggregation process.
   * This is processed by the insights-worker-python via a Redis list.
   */
  async triggerInsightsAggregation(resumeId: string): Promise<void> {
    try {
      await redisClient.rpush(
        QUEUE_NAMES.INSIGHTS,
        JSON.stringify({
          resumeId,
          timestamp: new Date().toISOString(),
          action: INSIGHTS_ACTIONS.UPDATE_INSIGHTS,
        })
      );

      logger.info('Insights aggregation job queued', { resumeId });
    } catch (error) {
      logger.error('Failed to queue insights job', {
        error: getErrorMessage(error),
        resumeId,
      });
      // We don't throw here to avoid failing the matching job if insights fail to queue
    }
  }

  async close(): Promise<void> {
    await redisClient.quit();
  }
}

export const queueHandler = new QueueHandler();
