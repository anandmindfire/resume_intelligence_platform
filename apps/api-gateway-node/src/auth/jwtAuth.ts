import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';
import { logger, getErrorMessage } from '@resume-platform/logger';

/** Identity of the caller, attached to the request once its access token is verified. */
export interface AuthenticatedUser {
  sub: string;
  scopes: string[];
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}

/**
 * Asymmetric algorithms only. Symmetric (HS*) tokens and `alg: none` are rejected, so a token can't be
 * forged with a shared secret or the public key used as an HMAC key (algorithm confusion).
 */
export const ALLOWED_ALGORITHMS = [
  'RS256',
  'RS384',
  'RS512',
  'PS256',
  'PS384',
  'PS512',
  'ES256',
  'ES384',
  'EdDSA',
];

/** Clock skew tolerated on exp / nbf / iat. */
const CLOCK_TOLERANCE_SECONDS = 30;

export interface JwtAuthOptions {
  issuer: string;
  audience: string;
  /** Key resolver (remote JWKS in production, a local key set in tests). */
  keys: JWTVerifyGetKey;
  /** Scope every token must carry; empty = no scope check. */
  requiredScope?: string;
  /** Route patterns reachable without a token (exact match, or prefix when ending in `*`). */
  publicRoutes: string[];
}

function isPublic(route: string, publicRoutes: string[]): boolean {
  return publicRoutes.some((pattern) =>
    pattern.endsWith('*') ? route.startsWith(pattern.slice(0, -1)) : route === pattern
  );
}

function bearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (typeof header !== 'string') return null;
  const match = /^Bearer\s+([A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+)\s*$/i.exec(header);
  return match ? match[1] : null;
}

function scopesOf(payload: JWTPayload): string[] {
  if (typeof payload.scope === 'string') return payload.scope.split(' ').filter(Boolean);
  if (Array.isArray(payload.scp))
    return payload.scp.filter((s): s is string => typeof s === 'string');
  if (typeof payload.scp === 'string') return payload.scp.split(' ').filter(Boolean);
  return [];
}

function reject(
  reply: FastifyReply,
  status: 401 | 403,
  error: 'invalid_token' | 'insufficient_scope'
) {
  // RFC 6750 challenge; the reason stays in our logs, the client only learns the error class.
  reply.header('WWW-Authenticate', `Bearer error="${error}"`);
  return reply
    .status(status)
    .send({ success: false, error: status === 401 ? 'Unauthorized' : 'Forbidden' });
}

/**
 * Requires a valid OIDC access token on every route except `publicRoutes` (default deny: new routes are
 * protected without anyone remembering to opt in). Verifies signature (JWKS), issuer, audience, expiry
 * and not-before, and optionally a scope.
 */
export function registerJwtAuth(app: FastifyInstance, options: JwtAuthOptions): void {
  app.addHook('onRequest', async (request, reply) => {
    // CORS preflights carry no credentials by design.
    if (request.method === 'OPTIONS') return;

    // Routed pattern, not the raw URL, so percent-encoding can't make a protected route look public.
    const route = request.routeOptions?.url ?? request.url.split('?')[0];
    if (isPublic(route, options.publicRoutes)) return;

    const token = bearerToken(request);
    if (!token) return reject(reply, 401, 'invalid_token');

    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(token, options.keys, {
        issuer: options.issuer,
        audience: options.audience,
        algorithms: ALLOWED_ALGORITHMS,
        clockTolerance: CLOCK_TOLERANCE_SECONDS,
        requiredClaims: ['sub', 'exp'],
      }));
    } catch (error) {
      logger.info('Rejected access token', { reqId: request.id, reason: getErrorMessage(error) });
      return reject(reply, 401, 'invalid_token');
    }

    const scopes = scopesOf(payload);
    if (options.requiredScope && !scopes.includes(options.requiredScope)) {
      logger.info('Access token lacks required scope', { reqId: request.id, sub: payload.sub });
      return reject(reply, 403, 'insufficient_scope');
    }

    request.user = { sub: payload.sub as string, scopes };
  });
}

/**
 * JWKS resolver for an issuer. Uses OIDC_JWKS_URI when given, otherwise discovers `jwks_uri` from the
 * issuer's metadata on first use (so the gateway starts even if the IdP is briefly unreachable; a failed
 * discovery is retried on the next request). Keys are cached and refreshed by jose on unknown `kid`.
 */
export function createIssuerKeyResolver(issuer: string, jwksUri?: string): JWTVerifyGetKey {
  let remote: Promise<JWTVerifyGetKey> | undefined;

  const load = async (): Promise<JWTVerifyGetKey> => {
    if (jwksUri) return createRemoteJWKSet(new URL(jwksUri));
    const metadataUrl = `${issuer.replace(/\/+$/, '')}/.well-known/openid-configuration`;
    const res = await fetch(metadataUrl, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`OIDC discovery failed: HTTP ${res.status}`);
    const metadata = (await res.json()) as { issuer?: string; jwks_uri?: string };
    if (metadata.issuer !== issuer) throw new Error('OIDC discovery returned a different issuer');
    if (!metadata.jwks_uri) throw new Error('OIDC discovery returned no jwks_uri');
    return createRemoteJWKSet(new URL(metadata.jwks_uri));
  };

  return async (protectedHeader, token) => {
    remote ??= load().catch((error) => {
      remote = undefined;
      throw error;
    });
    return (await remote)(protectedHeader, token);
  };
}
