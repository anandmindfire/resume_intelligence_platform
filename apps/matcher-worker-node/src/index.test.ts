import { afterEach, describe, expect, it, vi } from 'vitest';

const { createWorker, close } = vi.hoisted(() => ({ createWorker: vi.fn(), close: vi.fn() }));

vi.mock('@resume-platform/queue-lib', () => ({ queueConsumer: { createWorker, close } }));
vi.mock('./processors/matchProcessor', () => ({ processMatchJob: vi.fn() }));
vi.mock('@resume-platform/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }));

describe('matcher worker entrypoint', () => {
  afterEach(() => {
    process.removeAllListeners('SIGTERM');
  });

  it('starts a worker on the matcher queue and closes it on SIGTERM', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const { processMatchJob } = await import('./processors/matchProcessor');
    const { matcherQueueConfig } = await import('./queues/queueConfig');

    await import('./index');
    await vi.waitFor(() => expect(createWorker).toHaveBeenCalled());

    expect(createWorker).toHaveBeenCalledWith('matcher-queue', processMatchJob, {
      concurrency: matcherQueueConfig.concurrency,
    });

    process.emit('SIGTERM');
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
    expect(close).toHaveBeenCalled();
    exit.mockRestore();
  });
});
