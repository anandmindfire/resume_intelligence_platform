import { afterEach, describe, expect, it, vi } from 'vitest';

const { auth } = vi.hoisted(() => ({
  auth: {
    oidcIssuer: '',
    oidcAudience: '',
    oidcJwksUri: '',
    requiredScope: '',
    disabled: false,
  },
}));

vi.mock('@resume-platform/config', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@resume-platform/config')>();
  return { ...mod, config: { ...mod.config, auth } };
});

vi.mock('@resume-platform/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  getErrorMessage: (e: unknown) => String(e),
}));

import { PUBLIC_ROUTES, resolveAuthOptions } from '../app';

afterEach(() => {
  vi.unstubAllEnvs();
  Object.assign(auth, {
    oidcIssuer: '',
    oidcAudience: '',
    oidcJwksUri: '',
    requiredScope: '',
    disabled: false,
  });
});

describe('resolveAuthOptions', () => {
  it('refuses to start in production without an issuer and audience', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => resolveAuthOptions()).toThrow(/OIDC_ISSUER and OIDC_AUDIENCE/);
  });

  it('refuses to start in production with an issuer but no audience', () => {
    vi.stubEnv('NODE_ENV', 'production');
    auth.oidcIssuer = 'https://idp.example.test';
    expect(() => resolveAuthOptions()).toThrow();
  });

  it('runs without auth in production only when AUTH_DISABLED=true', () => {
    vi.stubEnv('NODE_ENV', 'production');
    auth.disabled = true;
    expect(resolveAuthOptions()).toBeNull();
  });

  it('runs without auth outside production when unconfigured', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(resolveAuthOptions()).toBeNull();
  });

  it('requires tokens when an issuer and audience are configured', () => {
    vi.stubEnv('NODE_ENV', 'production');
    Object.assign(auth, {
      oidcIssuer: 'https://idp.example.test',
      oidcAudience: 'resume-api',
      requiredScope: 'resumes',
    });
    expect(resolveAuthOptions()).toMatchObject({
      issuer: 'https://idp.example.test',
      audience: 'resume-api',
      requiredScope: 'resumes',
      publicRoutes: PUBLIC_ROUTES,
    });
  });

  it('keeps every proxied API prefix off the public list', () => {
    for (const prefix of ['/api/upload', '/api/analytics', '/api/jobs', '/api/resumes']) {
      expect(
        PUBLIC_ROUTES.some(
          (r) => r === prefix || (r.endsWith('*') && prefix.startsWith(r.slice(0, -1)))
        )
      ).toBe(false);
    }
  });
});
