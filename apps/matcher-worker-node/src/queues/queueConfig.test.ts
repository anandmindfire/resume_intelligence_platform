import { describe, expect, it } from 'vitest';
import { config } from '@resume-platform/config';
import { matcherQueueConfig, queueJobTypes } from './queueConfig';

describe('matcherQueueConfig', () => {
  it('consumes the matcher queue with the configured concurrency', () => {
    expect(matcherQueueConfig).toEqual({
      queueName: 'matcher-queue',
      concurrency: config.matcher.concurrency,
      retryAttempts: 3,
      retryDelay: 5000,
    });
  });

  it('matches the job name used by producers', () => {
    expect(queueJobTypes.PROCESS_MATCH).toBe('process-match');
  });
});
