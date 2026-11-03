import { queueProducer, QUEUE_NAMES, JOB_NAMES } from '@resume-platform/queue-lib';
import type { QueueJobData } from '@resume-platform/queue-lib';
import { logger, getErrorMessage } from '@resume-platform/logger';
import { config } from '@resume-platform/config';
import Redis from 'ioredis';
import type { OCRJobData } from '../types';

// Redis client for simple list queues (used by Python workers)
const redisClient = new Redis({
  host: config.queue.redis.host,
  port: config.queue.redis.port,
  password: config.queue.redis.password,
  maxRetriesPerRequest: 3,
  retryStrategy: () => null, // Don't retry on connection errors
});

export class QueueHandler {
  async queueOCRJob(data: OCRJobData): Promise<void> {
    try {
      // Queue to BullMQ (for Node.js workers if any)
      await queueProducer.addJob(QUEUE_NAMES.OCR, JOB_NAMES.PROCESS_OCR, {
        resumeId: data.resumeId,
        filePath: data.filePath,
        fileName: data.fileName,
        mimeType: data.mimeType,
      });

      // Also push to simple Redis list for Python workers
      await redisClient.rpush(
        QUEUE_NAMES.OCR,
        JSON.stringify({
          resumeId: data.resumeId,
          filePath: data.filePath,
          fileName: data.fileName,
          mimeType: data.mimeType,
        })
      );

      logger.info('OCR job queued to both BullMQ and Redis list', {
        resumeId: data.resumeId,
        fileName: data.fileName,
      });
    } catch (error) {
      logger.error('Failed to queue OCR job', {
        error: getErrorMessage(error),
        resumeId: data.resumeId,
      });
      throw error;
    }
  }

  async queueParserJob(resumeId: string, extractedText: string): Promise<void> {
    try {
      // Queue to BullMQ
      await queueProducer.addJob(QUEUE_NAMES.PARSER, JOB_NAMES.PROCESS_PARSER, {
        resumeId,
        extractedText,
        filePath: '', // Not needed for parser job
        fileName: '', // Not needed for parser job
        mimeType: '', // Not needed for parser job
      } as QueueJobData);

      // Also push to simple Redis list for Python workers
      await redisClient.rpush(
        QUEUE_NAMES.PARSER,
        JSON.stringify({
          resumeId,
          extractedText,
        })
      );

      logger.info('Parser job queued to both BullMQ and Redis list', { resumeId });
    } catch (error) {
      logger.error('Failed to queue parser job', {
        error: getErrorMessage(error),
        resumeId,
      });
      throw error;
    }
  }

  async queueMatcherJob(resumeId: string): Promise<void> {
    try {
      await queueProducer.addJob(QUEUE_NAMES.MATCHER, JOB_NAMES.PROCESS_MATCH, {
        resumeId,
        filePath: '', // Not needed for matcher job
        fileName: '', // Not needed for matcher job
        mimeType: '', // Not needed for matcher job
      } as QueueJobData);
      logger.info('Matcher job queued', { resumeId });
    } catch (error) {
      logger.error('Failed to queue matcher job', {
        error: getErrorMessage(error),
        resumeId,
      });
      throw error;
    }
  }
}

export const queueHandler = new QueueHandler();
