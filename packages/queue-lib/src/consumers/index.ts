import { Worker, Job } from 'bullmq';
import { config } from '@resume-platform/config';
import { logger } from '@resume-platform/logger';
import { QueueJobData } from '../producers';

/** Worker handler function that processes a queue job. */
export interface ProcessorFunction {
  (job: Job<QueueJobData>): Promise<unknown>;
}

/** BullMQ worker manager for processing background queue jobs. */
export class QueueConsumer {
  private workers: Map<string, Worker> = new Map();

  /** Creates and starts a BullMQ worker for the specified queue name. */
  createWorker(
    queueName: string,
    processor: ProcessorFunction,
    options?: {
      concurrency?: number;
      limiter?: {
        max: number;
        duration: number;
      };
    }
  ): Worker {
    if (this.workers.has(queueName)) {
      throw new Error(`Worker for queue ${queueName} already exists`);
    }

    const worker = new Worker(
      queueName,
      async (job: Job<QueueJobData>) => {
        logger.info(`Processing job ${job.id} from queue ${queueName}`, {
          jobId: job.id,
          resumeId: job.data.resumeId,
        });

        try {
          const result = await processor(job);
          logger.info(`Job ${job.id} completed successfully`, {
            jobId: job.id,
            resumeId: job.data.resumeId,
          });
          return result;
        } catch (error) {
          logger.error(`Job ${job.id} failed`, {
            jobId: job.id,
            resumeId: job.data.resumeId,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          });
          throw error;
        }
      },
      {
        connection: {
          host: config.queue.redis.host,
          port: config.queue.redis.port,
          password: config.queue.redis.password,
        },
        concurrency: options?.concurrency || config.queue.concurrency,
        limiter: options?.limiter,
      }
    );

    worker.on('completed', (job) => {
      logger.info(`Job completed: ${job.id}`);
    });

    worker.on('failed', (job, err) => {
      logger.error(`Job failed: ${job?.id}`, { error: err.message });
    });

    this.workers.set(queueName, worker);
    return worker;
  }

  /** Gracefully stops and closes all registered BullMQ workers. */
  async close() {
    await Promise.all(Array.from(this.workers.values()).map((w) => w.close()));
    this.workers.clear();
  }
}

/** Shared singleton consumer instance. */
export const queueConsumer = new QueueConsumer();
