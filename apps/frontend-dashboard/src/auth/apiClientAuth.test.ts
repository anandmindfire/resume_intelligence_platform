import { describe, expect, it, vi } from 'vitest';

const { oidc } = vi.hoisted(() => ({ oidc: { getAccessToken: vi.fn(), signIn: vi.fn() } }));

vi.mock('./oidc', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./oidc')>()),
  authEnabled: true,
  getAccessToken: oidc.getAccessToken,
  signIn: oidc.signIn,
}));

import { apiClient } from '../services/apiClient';

describe('apiClient with auth enabled', () => {
  it('sends the access token as a Bearer header', async () => {
    oidc.getAccessToken.mockResolvedValue('tok-123');
    const adapter = vi
      .fn()
      .mockResolvedValue({ status: 200, data: {}, headers: {}, config: {}, statusText: 'OK' });
    await apiClient.get('/jobs', { adapter });
    expect(adapter.mock.calls[0][0].headers.get('Authorization')).toBe('Bearer tok-123');
  });

  it('sends no Authorization header when signed out', async () => {
    oidc.getAccessToken.mockResolvedValue(null);
    const adapter = vi
      .fn()
      .mockResolvedValue({ status: 200, data: {}, headers: {}, config: {}, statusText: 'OK' });
    await apiClient.get('/jobs', { adapter });
    expect(adapter.mock.calls[0][0].headers.get('Authorization')).toBeFalsy();
  });

  it('restarts login on a 401', async () => {
    oidc.getAccessToken.mockResolvedValue('expired');
    const adapter = vi.fn().mockImplementation(async (config) => {
      const error = Object.assign(new Error('Unauthorized'), {
        isAxiosError: true,
        config,
        response: { status: 401, data: {}, headers: {}, config, statusText: 'Unauthorized' },
      });
      throw error;
    });
    await expect(apiClient.get('/jobs', { adapter })).rejects.toThrow();
    expect(oidc.signIn).toHaveBeenCalled();
  });
});
