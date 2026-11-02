import { afterEach, describe, expect, it, vi } from 'vitest';

const { createWorker, close } = vi.hoisted(() => ({ createWorker: vi.fn(), close: vi.fn() }));

vi.mock('@resume-platform/queue-lib', () => ({ queueConsumer: { createWorker, close } }));
vi.mock('./processors/exportProcessor', () => ({ processExportJob: vi.fn() }));
vi.mock('@resume-platform/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }));

describe('export worker entrypoint', () => {
  afterEach(() => {
    process.removeAllListeners('SIGTERM');
  });

  it('starts a worker on the export queue and closes it on SIGTERM', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const { processExportJob } = await import('./processors/exportProcessor');

    await import('./index');
    await vi.waitFor(() => expect(createWorker).toHaveBeenCalled());
    expect(createWorker).toHaveBeenCalledWith('export-queue', processExportJob, { concurrency: 2 });

    process.emit('SIGTERM');
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
    expect(close).toHaveBeenCalled();
    exit.mockRestore();
  });
});
