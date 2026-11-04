import Fastify, { type FastifyInstance } from 'fastify';
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWK,
  type KeyLike,
} from 'jose';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@resume-platform/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));

import { createIssuerKeyResolver, registerJwtAuth } from './jwtAuth';

const ISSUER = 'https://idp.example.test/realms/resumes';
const AUDIENCE = 'resume-api';

let privateKey: KeyLike;
let otherKey: KeyLike;
let jwk: JWK;
let app: FastifyInstance;

async function token(
  claims: Record<string, unknown> = {},
  {
    key = privateKey,
    issuer = ISSUER,
    audience = AUDIENCE,
    expiresIn = '5m' as string | number,
    alg = 'RS256',
  } = {}
) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg, kid: 'test-key' })
    .setSubject('user-42')
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key);
}

function get(url: string, authorization?: string) {
  return app.inject({ method: 'GET', url, headers: authorization ? { authorization } : {} });
}

beforeAll(async () => {
  // A second key the gateway doesn't trust, for forged-signature tests.
  ({ privateKey: otherKey } = await generateKeyPair('RS256'));
});

describe('registerJwtAuth', () => {
  beforeAll(async () => {
    const pair = await generateKeyPair('RS256', { extractable: true });
    privateKey = pair.privateKey;
    jwk = { ...(await exportJWK(pair.publicKey)), kid: 'test-key', alg: 'RS256' };

    app = Fastify();
    registerJwtAuth(app, {
      issuer: ISSUER,
      audience: AUDIENCE,
      keys: createLocalJWKSet({ keys: [jwk] }),
      requiredScope: 'resumes',
      publicRoutes: ['/health', '/docs/*'],
    });
    app.get('/health', async () => ({ ok: true }));
    app.get('/docs/json', async () => ({ ok: true }));
    app.get('/api/resumes', async (request) => ({ user: request.user }));
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('accepts a valid token and exposes the subject and scopes', async () => {
    const res = await get('/api/resumes', `Bearer ${await token({ scope: 'openid resumes' })}`);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ user: { sub: 'user-42', scopes: ['openid', 'resumes'] } });
  });

  it('accepts the scope as an `scp` array too', async () => {
    const res = await get('/api/resumes', `Bearer ${await token({ scp: ['resumes'] })}`);
    expect(res.statusCode).toBe(200);
  });

  it('leaves public routes open', async () => {
    expect((await get('/health')).statusCode).toBe(200);
    expect((await get('/docs/json')).statusCode).toBe(200);
  });

  it('rejects a request without a token with a Bearer challenge', async () => {
    const res = await get('/api/resumes');
    expect(res.statusCode).toBe(401);
    expect(res.headers['www-authenticate']).toBe('Bearer error="invalid_token"');
    expect(res.json()).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('protects unknown routes too (default deny)', async () => {
    expect((await get('/api/something-new')).statusCode).toBe(401);
  });

  it.each([
    ['a non-Bearer scheme', async () => `Basic ${Buffer.from('a:b').toString('base64')}`],
    ['a malformed token', async () => 'Bearer not-a-jwt'],
    [
      'a token signed by another key',
      async () => `Bearer ${await token({ scope: 'resumes' }, { key: otherKey })}`,
    ],
    [
      'a token from another issuer',
      async () => `Bearer ${await token({ scope: 'resumes' }, { issuer: 'https://evil.test' })}`,
    ],
    [
      'a token for another audience',
      async () => `Bearer ${await token({ scope: 'resumes' }, { audience: 'other-api' })}`,
    ],
    [
      'an expired token',
      async () =>
        `Bearer ${await token({ scope: 'resumes' }, { expiresIn: Math.floor(Date.now() / 1000) - 120 })}`,
    ],
  ])('rejects %s', async (_label, header) => {
    const res = await get('/api/resumes', await header());
    expect(res.statusCode).toBe(401);
  });

  it('rejects an unsigned (alg: none) token', async () => {
    const encode = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${encode({ alg: 'none' })}.${encode({ sub: 'admin', iss: ISSUER, aud: AUDIENCE, exp: now + 300, scope: 'resumes' })}.`;
    expect((await get('/api/resumes', `Bearer ${unsigned}`)).statusCode).toBe(401);
  });

  it('rejects an HS256 token (algorithm confusion)', async () => {
    const hs = await token(
      { scope: 'resumes' },
      { key: new TextEncoder().encode('x'.repeat(32)) as never, alg: 'HS256' }
    );
    expect((await get('/api/resumes', `Bearer ${hs}`)).statusCode).toBe(401);
  });

  it('returns 403 when the required scope is missing', async () => {
    const res = await get('/api/resumes', `Bearer ${await token({ scope: 'openid' })}`);
    expect(res.statusCode).toBe(403);
    expect(res.headers['www-authenticate']).toBe('Bearer error="insufficient_scope"');
  });

  it('cannot reach a protected route through percent-encoding', async () => {
    expect((await get('/api/%72esumes')).statusCode).toBe(401);
  });
});

describe('createIssuerKeyResolver', () => {
  it('refuses discovery metadata that names a different issuer', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify({ issuer: 'https://evil.test', jwks_uri: 'https://evil.test/jwks' })
        )
      );
    const resolve = createIssuerKeyResolver(ISSUER);
    await expect(resolve({ alg: 'RS256' }, {} as never)).rejects.toThrow('different issuer');
    expect(fetchMock).toHaveBeenCalledWith(
      `${ISSUER}/.well-known/openid-configuration`,
      expect.anything()
    );
    fetchMock.mockRestore();
  });

  it('retries discovery after a failure', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('', { status: 503 }));
    const resolve = createIssuerKeyResolver(ISSUER);
    await expect(resolve({ alg: 'RS256' }, {} as never)).rejects.toThrow('HTTP 503');
    await expect(resolve({ alg: 'RS256' }, {} as never)).rejects.toThrow('HTTP 503');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockRestore();
  });
});
