import { afterEach, describe, expect, it, vi } from 'vitest';

const { warn } = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock('@resume-platform/logger', () => ({ logger: { warn } }));

async function loadSecurity(env: Record<string, string> = {}) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  return import('./security');
}

afterEach(() => {
  vi.unstubAllEnvs();
  warn.mockClear();
});

describe('buildRateLimitOptions', () => {
  it('uses the per-service default and a 15 minute window', async () => {
    const { buildRateLimitOptions } = await loadSecurity({
      RATE_LIMIT_MAX: '',
      RATE_LIMIT_WINDOW: '',
    });
    expect(buildRateLimitOptions(500)).toEqual({ max: 500, timeWindow: '15 minutes' });
  });

  it('is overridden by RATE_LIMIT_MAX / RATE_LIMIT_WINDOW', async () => {
    const { buildRateLimitOptions } = await loadSecurity({
      RATE_LIMIT_MAX: '20',
      RATE_LIMIT_WINDOW: '1 minute',
    });
    expect(buildRateLimitOptions(500)).toEqual({ max: 20, timeWindow: '1 minute' });
  });
});

describe('buildCorsOptions', () => {
  const methods = ['GET', 'POST'];

  it('reflects origins but never allows credentials by default', async () => {
    const { buildCorsOptions } = await loadSecurity({ CORS_ORIGINS: '' });
    expect(buildCorsOptions(methods)).toMatchObject({ origin: true, credentials: false, methods });
  });

  it('allows credentials only with an explicit origin allow-list', async () => {
    const { buildCorsOptions } = await loadSecurity({ CORS_ORIGINS: 'https://app.example.com' });
    expect(buildCorsOptions(methods)).toMatchObject({
      origin: ['https://app.example.com'],
      credentials: true,
    });
  });

  it('can disable cross-origin access entirely', async () => {
    const { buildCorsOptions } = await loadSecurity({ CORS_ORIGINS: 'false' });
    expect(buildCorsOptions(methods)).toMatchObject({ origin: false, credentials: false });
  });

  it('lets browsers send and read the request id', async () => {
    const { buildCorsOptions } = await loadSecurity();
    const options = buildCorsOptions(methods);
    expect(options.allowedHeaders).toContain('X-Request-ID');
    expect(options.exposedHeaders).toEqual(['X-Request-ID']);
  });
});

describe('warnIfCorsUnrestricted', () => {
  it('warns in production when CORS_ORIGINS was left at its permissive default', async () => {
    const { warnIfCorsUnrestricted } = await loadSecurity({
      NODE_ENV: 'production',
      CORS_ORIGINS: '',
    });
    warnIfCorsUnrestricted('api-gateway');
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('api-gateway: CORS_ORIGINS is not set')
    );
  });

  it('stays quiet once CORS_ORIGINS is set explicitly', async () => {
    const { warnIfCorsUnrestricted } = await loadSecurity({
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://a.example.com',
    });
    warnIfCorsUnrestricted('api-gateway');
    expect(warn).not.toHaveBeenCalled();
  });

  it('stays quiet outside production', async () => {
    const { warnIfCorsUnrestricted } = await loadSecurity({
      NODE_ENV: 'development',
      CORS_ORIGINS: '',
    });
    warnIfCorsUnrestricted('api-gateway');
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('helmetOptions', () => {
  it('enforces HSTS and disables sniffing', async () => {
    const { helmetOptions } = await loadSecurity();
    expect(helmetOptions.hsts).toEqual({
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    });
    expect(helmetOptions.noSniff).toBe(true);
  });
});
