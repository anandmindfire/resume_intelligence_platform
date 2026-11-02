import { Queue } from 'bullmq';
import { config } from '@resume-platform/config';
import { logger } from '@resume-platform/logger';

export interface QueueJobData {
  resumeId: string;
  filePath: string;
  fileName: string;
  mimeType: string;
  [key: string]: unknown;
}

export class QueueProducer {
  private queues: Map<string, Queue> = new Map();

  private getQueue(queueName: string): Queue {
    const existing = this.queues.get(queueName);
    if (existing) return existing;

    const queue = new Queue(queueName, {
      connection: {
        host: config.queue.redis.host,
        port: config.queue.redis.port,
        password: config.queue.redis.password,
      },
    });
    this.queues.set(queueName, queue);
    return queue;
  }

  async addJob(
    queueName: string,
    jobName: string,
    data: QueueJobData,
    options?: {
      priority?: number;
      delay?: number;
      attempts?: number;
      backoff?: {
        type: 'fixed' | 'exponential';
        delay: number;
      };
    }
  ) {
    const queue = this.getQueue(queueName);
    const job = await queue.add(jobName, data, {
      priority: options?.priority,
      delay: options?.delay,
      attempts: options?.attempts || config.queue.attempts,
      backoff: options?.backoff || {
        type: 'exponential',
        delay: config.queue.backoffDelay,
      },
    });

    logger.info(`Job added to queue ${queueName}`, {
      jobId: job.id,
      jobName,
      resumeId: data.resumeId,
    });

    return job;
  }

  async close() {
    await Promise.all(Array.from(this.queues.values()).map(q => q.close()));
    this.queues.clear();
  }
}

export const queueProducer = new QueueProducer();
