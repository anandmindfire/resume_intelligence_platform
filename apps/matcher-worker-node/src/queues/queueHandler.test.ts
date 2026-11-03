import { afterEach, describe, expect, it, vi } from 'vitest';

const { MockRedis, rpush, quit } = vi.hoisted(() => {
  const rpush = vi.fn().mockResolvedValue(1);
  const quit = vi.fn().mockResolvedValue('OK');
  const MockRedis = vi.fn().mockImplementation(() => ({ rpush, quit }));
  return { MockRedis, rpush, quit };
});

vi.mock('ioredis', () => ({ default: MockRedis }));
vi.mock('@resume-platform/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
  getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
  getErrorStack: (e: unknown) => (e instanceof Error ? e.stack : undefined),
}));

import { config } from '@resume-platform/config';
import { logger } from '@resume-platform/logger';
import { INSIGHTS_ACTIONS } from '../constants';
import { queueHandler } from './queueHandler';

// The client is created once at module load; capture its options before mocks are cleared.
const [redisOptions] = MockRedis.mock.calls[0];

describe('matcher QueueHandler', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('connects to the queue Redis', () => {
    expect(redisOptions).toEqual({
      host: config.queue.redis.host,
      port: config.queue.redis.port,
      password: config.queue.redis.password,
      maxRetriesPerRequest: 3,
    });
  });

  it('pushes an insights job onto the list consumed by the Python insights worker', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-06T07:08:09Z'));

    await queueHandler.triggerInsightsAggregation('r-1');

    expect(rpush).toHaveBeenCalledWith(
      'insights-queue',
      JSON.stringify({
        resumeId: 'r-1',
        timestamp: '2026-05-06T07:08:09.000Z',
        action: INSIGHTS_ACTIONS.UPDATE_INSIGHTS,
      })
    );
  });

  it('logs but swallows Redis failures so the match job still succeeds', async () => {
    rpush.mockRejectedValueOnce(new Error('redis down'));

    await expect(queueHandler.triggerInsightsAggregation('r-1')).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith('Failed to queue insights job', {
      error: 'redis down',
      resumeId: 'r-1',
    });
  });

  it('close quits the Redis client', async () => {
    await queueHandler.close();
    expect(quit).toHaveBeenCalled();
  });
});
