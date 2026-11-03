import { config } from '@resume-platform/config';
import { QUEUE_NAMES, JOB_NAMES } from '@resume-platform/queue-lib';
import type { QueueConfig } from '../types';

export const matcherQueueConfig: QueueConfig = {
  queueName: QUEUE_NAMES.MATCHER,
  concurrency: config.matcher?.concurrency || 5,
  retryAttempts: 3,
  retryDelay: 5000, // 5 seconds
};

export const queueJobTypes = {
  PROCESS_MATCH: JOB_NAMES.PROCESS_MATCH,
} as const;
