import { beforeEach, describe, expect, it, vi } from 'vitest';

const { MockQueue, queueInstances } = vi.hoisted(() => {
  const queueInstances: Array<{
    name: string;
    opts: unknown;
    add: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  }> = [];
  const MockQueue = vi.fn().mockImplementation((name: string, opts: unknown) => {
    const instance = {
      name,
      opts,
      add: vi.fn().mockResolvedValue({ id: `job-${queueInstances.length + 1}` }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    queueInstances.push(instance);
    return instance;
  });
  return { MockQueue, queueInstances };
});

vi.mock('bullmq', () => ({ Queue: MockQueue }));
vi.mock('@resume-platform/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
  getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
  getErrorStack: (e: unknown) => (e instanceof Error ? e.stack : undefined),
}));

import { config } from '@resume-platform/config';
import { logger } from '@resume-platform/logger';
import { QueueProducer, queueProducer, type QueueJobData } from './index';

const jobData: QueueJobData = {
  resumeId: 'resume-1',
  filePath: '/uploads/a.pdf',
  fileName: 'a.pdf',
  mimeType: 'application/pdf',
};

describe('QueueProducer', () => {
  beforeEach(() => {
    queueInstances.length = 0;
  });

  it('creates a BullMQ queue connected to the configured Redis on first use', async () => {
    const producer = new QueueProducer();
    await producer.addJob('ocr-queue', 'process-ocr', jobData);

    expect(MockQueue).toHaveBeenCalledWith('ocr-queue', {
      connection: {
        host: config.queue.redis.host,
        port: config.queue.redis.port,
        password: config.queue.redis.password,
      },
    });
  });

  it('reuses the same queue instance for repeated jobs on the same queue', async () => {
    const producer = new QueueProducer();
    await producer.addJob('ocr-queue', 'process-ocr', jobData);
    await producer.addJob('ocr-queue', 'process-ocr', { ...jobData, resumeId: 'resume-2' });

    expect(MockQueue).toHaveBeenCalledTimes(1);
    expect(queueInstances[0].add).toHaveBeenCalledTimes(2);
  });

  it('creates one queue per queue name', async () => {
    const producer = new QueueProducer();
    await producer.addJob('ocr-queue', 'process-ocr', jobData);
    await producer.addJob('parser-queue', 'process-parser', jobData);

    expect(queueInstances.map((q) => q.name)).toEqual(['ocr-queue', 'parser-queue']);
  });

  it('applies default attempts and exponential backoff from config', async () => {
    const producer = new QueueProducer();
    await producer.addJob('ocr-queue', 'process-ocr', jobData);

    expect(queueInstances[0].add).toHaveBeenCalledWith('process-ocr', jobData, {
      priority: undefined,
      delay: undefined,
      attempts: config.queue.attempts,
      backoff: { type: 'exponential', delay: config.queue.backoffDelay },
    });
  });

  it('passes through explicit job options', async () => {
    const producer = new QueueProducer();
    await producer.addJob('ocr-queue', 'process-ocr', jobData, {
      priority: 1,
      delay: 500,
      attempts: 7,
      backoff: { type: 'fixed', delay: 100 },
    });

    expect(queueInstances[0].add).toHaveBeenCalledWith('process-ocr', jobData, {
      priority: 1,
      delay: 500,
      attempts: 7,
      backoff: { type: 'fixed', delay: 100 },
    });
  });

  it('returns the created job and logs it', async () => {
    const producer = new QueueProducer();
    const job = await producer.addJob('ocr-queue', 'process-ocr', jobData);

    expect(job).toEqual({ id: 'job-1' });
    expect(logger.info).toHaveBeenCalledWith('Job added to queue ocr-queue', {
      jobId: 'job-1',
      jobName: 'process-ocr',
      resumeId: 'resume-1',
    });
  });

  it('propagates errors from BullMQ', async () => {
    const producer = new QueueProducer();
    MockQueue.mockImplementationOnce(() => ({
      add: vi.fn().mockRejectedValue(new Error('redis down')),
      close: vi.fn(),
    }));

    await expect(producer.addJob('ocr-queue', 'process-ocr', jobData)).rejects.toThrow(
      'redis down'
    );
  });

  it('closes every queue and forgets them so new ones are created afterwards', async () => {
    const producer = new QueueProducer();
    await producer.addJob('ocr-queue', 'process-ocr', jobData);
    await producer.addJob('parser-queue', 'process-parser', jobData);

    await producer.close();
    expect(queueInstances[0].close).toHaveBeenCalled();
    expect(queueInstances[1].close).toHaveBeenCalled();

    await producer.addJob('ocr-queue', 'process-ocr', jobData);
    expect(MockQueue).toHaveBeenCalledTimes(3);
  });

  it('exports a shared singleton producer', () => {
    expect(queueProducer).toBeInstanceOf(QueueProducer);
  });
});
