import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('axios', () => ({ default: { get: vi.fn() } }));
vi.mock('@resume-platform/logger', () => ({
  logger: { warn: vi.fn() },
  getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
  getErrorStack: (e: unknown) => (e instanceof Error ? e.stack : undefined),
}));

import axios from 'axios';
import { config } from '@resume-platform/config';
import { healthService } from './healthService';

const get = vi.mocked(axios.get);

describe('healthService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('checkServiceHealth', () => {
    it('reports healthy on a 200 from /health', async () => {
      get.mockResolvedValueOnce({ status: 200 });

      await expect(healthService.checkServiceHealth('http://upload:3001')).resolves.toBe('healthy');
      expect(get).toHaveBeenCalledWith('http://upload:3001/health', { timeout: 5000 });
    });

    it('reports unhealthy on any other success status', async () => {
      get.mockResolvedValueOnce({ status: 204 });
      await expect(healthService.checkServiceHealth('http://upload:3001')).resolves.toBe(
        'unhealthy'
      );
    });

    it('reports unhealthy when the request fails', async () => {
      get.mockRejectedValueOnce(new Error('timeout'));
      await expect(healthService.checkServiceHealth('http://upload:3001', 100)).resolves.toBe(
        'unhealthy'
      );
      expect(get).toHaveBeenCalledWith('http://upload:3001/health', { timeout: 100 });
    });
  });

  it('getHealthStatus probes upload and analytics in parallel', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-04T05:06:07Z'));
    get.mockImplementation(async (url: string) => {
      if (url.startsWith(config.uploadService.url)) return { status: 200 };
      throw new Error('down');
    });

    await expect(healthService.getHealthStatus()).resolves.toEqual({
      status: 'ok',
      timestamp: '2026-03-04T05:06:07.000Z',
      services: { upload: 'healthy', analytics: 'unhealthy' },
    });
    expect(get).toHaveBeenCalledWith(`${config.analyticsApi.url}/health`, { timeout: 5000 });
  });
});
