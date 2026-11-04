import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@resume-platform/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));

import { registerInternalAuth, tokensMatch, type InternalAuthOptions } from './internalAuth';

async function buildApp(options: InternalAuthOptions) {
  const app = Fastify();
  registerInternalAuth(app, options);
  app.post('/api/internal/queue/matcher', async () => ({ ok: true }));
  app.get('/api/v1/public', async () => ({ ok: true }));
  await app.ready();
  return app;
}

describe('tokensMatch', () => {
  it('matches identical tokens only', () => {
    expect(tokensMatch('secret', 'secret')).toBe(true);
    expect(tokensMatch('secret', 'secreT')).toBe(false);
    expect(tokensMatch('short', 'longer-token')).toBe(false);
    expect(tokensMatch('', 'x')).toBe(false);
  });
});

describe('registerInternalAuth', () => {
  it('rejects internal requests without the token', async () => {
    const app = await buildApp({ token: 's3cret', requireToken: true });
    const res = await app.inject({ method: 'POST', url: '/api/internal/queue/matcher' });
    expect(res.statusCode).toBe(401);
  });

  it('rejects internal requests with a wrong token', async () => {
    const app = await buildApp({ token: 's3cret', requireToken: true });
    const res = await app.inject({
      method: 'POST',
      url: '/api/internal/queue/matcher',
      headers: { 'x-internal-token': 'nope' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('accepts internal requests with the right token', async () => {
    const app = await buildApp({ token: 's3cret', requireToken: true });
    const res = await app.inject({
      method: 'POST',
      url: '/api/internal/queue/matcher',
      headers: { 'x-internal-token': 's3cret' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('cannot be bypassed by percent-encoding the internal path', async () => {
    const app = await buildApp({ token: 's3cret', requireToken: true });
    for (const url of ['/api/%69nternal/queue/matcher', '/api/internal/queue/%6Datcher']) {
      const res = await app.inject({ method: 'POST', url });
      expect([401, 404]).toContain(res.statusCode);
      expect(res.statusCode).not.toBe(200);
    }
  });

  it('never applies to non-internal routes', async () => {
    const app = await buildApp({ token: 's3cret', requireToken: true });
    const res = await app.inject({ method: 'GET', url: '/api/v1/public' });
    expect(res.statusCode).toBe(200);
  });

  it('fails closed when the token is required but not configured', async () => {
    const app = await buildApp({ token: '', requireToken: true });
    const res = await app.inject({
      method: 'POST',
      url: '/api/internal/queue/matcher',
      headers: { 'x-internal-token': '' },
    });
    expect(res.statusCode).toBe(503);
  });

  it('allows unauthenticated internal calls only when no token is configured and none is required', async () => {
    const app = await buildApp({ token: '', requireToken: false });
    const res = await app.inject({ method: 'POST', url: '/api/internal/queue/matcher' });
    expect(res.statusCode).toBe(200);
  });
});
