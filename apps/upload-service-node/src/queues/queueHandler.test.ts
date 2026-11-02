import { describe, expect, it, vi } from 'vitest';

const { MockRedis, rpush, addJob } = vi.hoisted(() => {
  const rpush = vi.fn().mockResolvedValue(1);
  const MockRedis = vi.fn().mockImplementation(() => ({ rpush }));
  const addJob = vi.fn().mockResolvedValue({ id: '1' });
  return { MockRedis, rpush, addJob };
});

vi.mock('ioredis', () => ({ default: MockRedis }));
vi.mock('@resume-platform/queue-lib', () => ({ queueProducer: { addJob } }));
vi.mock('@resume-platform/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }));

import { config } from '@resume-platform/config';
import { QueueHandler, queueHandler } from './queueHandler';

// The client is created once at module load; capture its options before mocks are cleared.
const [redisOptions] = MockRedis.mock.calls[0];

const ocrJob = {
  resumeId: 'r-1',
  filePath: '/uploads/r-1.pdf',
  fileName: 'jane.pdf',
  mimeType: 'application/pdf',
};

describe('QueueHandler', () => {
  it('connects its Redis client to the queue Redis without reconnect retries', () => {
    expect(redisOptions).toMatchObject({
      host: config.queue.redis.host,
      port: config.queue.redis.port,
      maxRetriesPerRequest: 3,
    });
    expect(redisOptions.retryStrategy()).toBeNull();
  });

  describe('queueOCRJob', () => {
    it('adds the job to BullMQ and to the Redis list consumed by the Python OCR worker', async () => {
      await queueHandler.queueOCRJob(ocrJob);

      expect(addJob).toHaveBeenCalledWith('ocr-queue', 'process-ocr', ocrJob);
      expect(rpush).toHaveBeenCalledWith('ocr-queue', JSON.stringify(ocrJob));
    });

    it('only forwards the OCR fields', async () => {
      await queueHandler.queueOCRJob({ ...ocrJob, extra: 'ignored' });

      expect(JSON.parse(rpush.mock.calls[0][1])).toEqual(ocrJob);
    });

    it('rethrows BullMQ failures without pushing to Redis', async () => {
      addJob.mockRejectedValueOnce(new Error('bull down'));

      await expect(queueHandler.queueOCRJob(ocrJob)).rejects.toThrow('bull down');
      expect(rpush).not.toHaveBeenCalled();
    });

    it('rethrows Redis list failures', async () => {
      rpush.mockRejectedValueOnce(new Error('redis down'));

      await expect(queueHandler.queueOCRJob(ocrJob)).rejects.toThrow('redis down');
    });
  });

  describe('queueParserJob', () => {
    it('adds the job to BullMQ and the parser Redis list', async () => {
      await queueHandler.queueParserJob('r-1', 'extracted text');

      expect(addJob).toHaveBeenCalledWith('parser-queue', 'process-parser', {
        resumeId: 'r-1',
        extractedText: 'extracted text',
        filePath: '',
        fileName: '',
        mimeType: '',
      });
      expect(rpush).toHaveBeenCalledWith(
        'parser-queue',
        JSON.stringify({ resumeId: 'r-1', extractedText: 'extracted text' })
      );
    });

    it('rethrows failures', async () => {
      rpush.mockRejectedValueOnce(new Error('redis down'));
      await expect(queueHandler.queueParserJob('r-1', 'text')).rejects.toThrow('redis down');
    });
  });

  describe('queueMatcherJob', () => {
    it('adds the job to BullMQ only', async () => {
      await queueHandler.queueMatcherJob('r-1');

      expect(addJob).toHaveBeenCalledWith('matcher-queue', 'process-match', {
        resumeId: 'r-1',
        filePath: '',
        fileName: '',
        mimeType: '',
      });
      expect(rpush).not.toHaveBeenCalled();
    });

    it('rethrows failures', async () => {
      addJob.mockRejectedValueOnce(new Error('bull down'));
      await expect(queueHandler.queueMatcherJob('r-1')).rejects.toThrow('bull down');
    });
  });

  it('exports a singleton', () => {
    expect(queueHandler).toBeInstanceOf(QueueHandler);
  });
});
