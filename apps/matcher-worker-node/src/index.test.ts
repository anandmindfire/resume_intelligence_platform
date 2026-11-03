import { afterEach, describe, expect, it, vi } from 'vitest';

const { createWorker, close } = vi.hoisted(() => ({ createWorker: vi.fn(), close: vi.fn() }));

vi.mock('@resume-platform/queue-lib', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@resume-platform/queue-lib')>();
  return { ...actual, queueConsumer: { createWorker, close } };
});
vi.mock('./processors/matchProcessor', () => ({ processMatchJob: vi.fn() }));
vi.mock('@resume-platform/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
  getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
  getErrorStack: (e: unknown) => (e instanceof Error ? e.stack : undefined),
}));

describe('matcher worker entrypoint', () => {
  afterEach(() => {
    process.removeAllListeners('SIGTERM');
  });

  it('starts a worker on the matcher queue and closes it on SIGTERM', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const { QUEUE_NAMES } = await import('@resume-platform/queue-lib');
    const { processMatchJob } = await import('./processors/matchProcessor');
    const { matcherQueueConfig } = await import('./queues/queueConfig');

    await import('./index');
    await vi.waitFor(() => expect(createWorker).toHaveBeenCalled());

    expect(createWorker).toHaveBeenCalledWith(QUEUE_NAMES.MATCHER, processMatchJob, {
      concurrency: matcherQueueConfig.concurrency,
    });

    process.emit('SIGTERM');
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
    expect(close).toHaveBeenCalled();
    exit.mockRestore();
  });
});
