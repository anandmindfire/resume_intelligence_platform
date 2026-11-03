import { beforeEach, describe, expect, it, vi } from 'vitest';

type Processor = (job: unknown) => Promise<unknown>;

const { MockWorker, workerInstances } = vi.hoisted(() => {
  const workerInstances: Array<{
    name: string;
    processor: Processor;
    opts: Record<string, unknown>;
    handlers: Record<string, (...args: unknown[]) => void>;
    close: ReturnType<typeof vi.fn>;
  }> = [];
  const MockWorker = vi
    .fn()
    .mockImplementation((name: string, processor: Processor, opts: Record<string, unknown>) => {
      const instance = {
        name,
        processor,
        opts,
        handlers: {} as Record<string, (...args: unknown[]) => void>,
        close: vi.fn().mockResolvedValue(undefined),
        on(event: string, handler: (...args: unknown[]) => void) {
          instance.handlers[event] = handler;
          return instance;
        },
      };
      workerInstances.push(instance);
      return instance;
    });
  return { MockWorker, workerInstances };
});

vi.mock('bullmq', () => ({ Worker: MockWorker }));
vi.mock('@resume-platform/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
  getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
  getErrorStack: (e: unknown) => (e instanceof Error ? e.stack : undefined),
}));

import { config } from '@resume-platform/config';
import { logger } from '@resume-platform/logger';
import { QueueConsumer, queueConsumer } from './index';

const job = { id: '42', data: { resumeId: 'resume-1', filePath: '', fileName: '', mimeType: '' } };

describe('QueueConsumer', () => {
  beforeEach(() => {
    workerInstances.length = 0;
  });

  it('creates a BullMQ worker with the configured connection and default concurrency', () => {
    const consumer = new QueueConsumer();
    consumer.createWorker('matcher-queue', vi.fn());

    expect(MockWorker).toHaveBeenCalledWith('matcher-queue', expect.any(Function), {
      connection: {
        host: config.queue.redis.host,
        port: config.queue.redis.port,
        password: config.queue.redis.password,
      },
      concurrency: config.queue.concurrency,
      limiter: undefined,
    });
  });

  it('honours custom concurrency and limiter options', () => {
    const consumer = new QueueConsumer();
    const limiter = { max: 10, duration: 1000 };
    consumer.createWorker('matcher-queue', vi.fn(), { concurrency: 2, limiter });

    expect(workerInstances[0].opts).toMatchObject({ concurrency: 2, limiter });
  });

  it('refuses to create two workers for the same queue', () => {
    const consumer = new QueueConsumer();
    consumer.createWorker('matcher-queue', vi.fn());

    expect(() => consumer.createWorker('matcher-queue', vi.fn())).toThrow(
      'Worker for queue matcher-queue already exists'
    );
  });

  it('invokes the processor and returns its result', async () => {
    const processor = vi.fn().mockResolvedValue({ ok: true });
    const consumer = new QueueConsumer();
    consumer.createWorker('matcher-queue', processor);

    const result = await workerInstances[0].processor(job);

    expect(processor).toHaveBeenCalledWith(job);
    expect(result).toEqual({ ok: true });
    expect(logger.info).toHaveBeenCalledWith('Job 42 completed successfully', {
      jobId: '42',
      resumeId: 'resume-1',
    });
  });

  it('logs and rethrows processor failures so BullMQ can retry', async () => {
    const processor = vi.fn().mockRejectedValue(new Error('parse failed'));
    const consumer = new QueueConsumer();
    consumer.createWorker('matcher-queue', processor);

    await expect(workerInstances[0].processor(job)).rejects.toThrow('parse failed');
    expect(logger.error).toHaveBeenCalledWith(
      'Job 42 failed',
      expect.objectContaining({ jobId: '42', resumeId: 'resume-1', error: 'parse failed' })
    );
  });

  it('logs non-Error rejections as strings without a stack', async () => {
    const consumer = new QueueConsumer();
    consumer.createWorker('matcher-queue', vi.fn().mockRejectedValue('plain string failure'));

    await expect(workerInstances[0].processor(job)).rejects.toBe('plain string failure');
    expect(logger.error).toHaveBeenCalledWith(
      'Job 42 failed',
      expect.objectContaining({ error: 'plain string failure', stack: undefined })
    );
  });

  it('registers completed and failed listeners', () => {
    const consumer = new QueueConsumer();
    consumer.createWorker('matcher-queue', vi.fn());
    const { handlers } = workerInstances[0];

    handlers.completed({ id: '1' });
    expect(logger.info).toHaveBeenCalledWith('Job completed: 1');

    handlers.failed({ id: '2' }, new Error('nope'));
    expect(logger.error).toHaveBeenCalledWith('Job failed: 2', { error: 'nope' });

    handlers.failed(undefined, new Error('stalled'));
    expect(logger.error).toHaveBeenCalledWith('Job failed: undefined', { error: 'stalled' });
  });

  it('closes all workers and allows re-creation afterwards', async () => {
    const consumer = new QueueConsumer();
    consumer.createWorker('a', vi.fn());
    consumer.createWorker('b', vi.fn());

    await consumer.close();
    expect(workerInstances[0].close).toHaveBeenCalled();
    expect(workerInstances[1].close).toHaveBeenCalled();

    expect(() => consumer.createWorker('a', vi.fn())).not.toThrow();
  });

  it('exports a shared singleton consumer', () => {
    expect(queueConsumer).toBeInstanceOf(QueueConsumer);
  });
});
