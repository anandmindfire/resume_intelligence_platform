import http from 'http';
import type { AddressInfo } from 'net';
import Fastify, { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@resume-platform/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
  getErrorStack: (e: unknown) => (e instanceof Error ? e.stack : undefined),
}));

import { config } from '@resume-platform/config';
import { buildApp } from './app';
import { gatewayRoutes } from './config/gatewayConfig';

/** A fake upstream that echoes what the gateway forwarded, plus a minimal OpenAPI spec at /docs/json. */
async function startUpstream(service: string, spec: Record<string, unknown>) {
  const upstream = Fastify();
  upstream.get('/health', async () => ({ status: 'ok' }));
  upstream.get('/docs/json', async () => spec);
  upstream.all('/*', async (request) => ({
    service,
    method: request.method,
    url: request.url,
    forwardedFor: request.headers['x-forwarded-for'] ?? null,
    requestId: request.headers['x-request-id'] ?? null,
    body: request.body ?? null,
  }));
  const address = await upstream.listen({ port: 0, host: '127.0.0.1' });
  return { upstream, address };
}

const uploadSpec = {
  openapi: '3.0.3',
  info: { title: 'Upload Service API', version: '1.0.0' },
  servers: [{ url: 'http://upload:3001' }],
  tags: [{ name: 'Upload' }, { name: 'Internal' }, { name: 'Health' }],
  paths: {
    '/api/v1/upload/single': { post: { tags: ['Upload'], responses: {} } },
    '/api/internal/queue/matcher': { post: { tags: ['Internal'], responses: {} } },
    '/health': { get: { tags: ['Health'], responses: {} } },
  },
};

const analyticsSpec = {
  openapi: '3.0.3',
  info: { title: 'Analytics API', version: '1.0.0' },
  paths: {
    '/api/v1/dashboard': { get: { tags: ['Analytics'], responses: {} } },
    '/api/v1/jobs/{id}': { get: { tags: ['Jobs'], responses: {} } },
    '/api/v1/resumes': { get: { tags: ['Resumes'], responses: {} } },
  },
};

describe('api-gateway app', () => {
  let app: FastifyInstance;
  let upload: FastifyInstance;
  let analytics: FastifyInstance;
  const original = {
    uploadUrl: config.uploadService.url,
    analyticsUrl: config.analyticsApi.url,
    upstreams: Object.fromEntries(Object.entries(gatewayRoutes).map(([k, v]) => [k, v.upstream])),
  };

  beforeAll(async () => {
    const u = await startUpstream('upload', uploadSpec);
    const a = await startUpstream('analytics', analyticsSpec);
    upload = u.upstream;
    analytics = a.upstream;

    config.uploadService.url = u.address;
    config.analyticsApi.url = a.address;
    gatewayRoutes.upload.upstream = u.address;
    gatewayRoutes.analytics.upstream = a.address;
    gatewayRoutes.jobs.upstream = a.address;
    gatewayRoutes.resumes.upstream = a.address;

    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await upload.close();
    await analytics.close();
    config.uploadService.url = original.uploadUrl;
    config.analyticsApi.url = original.analyticsUrl;
    for (const [key, upstream] of Object.entries(original.upstreams))
      gatewayRoutes[key].upstream = upstream;
  });

  describe('GET /health', () => {
    it('reports every upstream as healthy when they respond', async () => {
      const res = await app.inject({ url: '/health' });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        status: 'ok',
        services: { upload: 'healthy', analytics: 'healthy' },
      });
    });

    it('reports an unreachable upstream as unhealthy but stays 200', async () => {
      const analyticsUrl = config.analyticsApi.url;
      config.analyticsApi.url = 'http://127.0.0.1:1';
      try {
        const res = await app.inject({ url: '/health' });
        expect(res.statusCode).toBe(200);
        expect(res.json().services).toEqual({ upload: 'healthy', analytics: 'unhealthy' });
      } finally {
        config.analyticsApi.url = analyticsUrl;
      }
    });
  });

  describe('API info', () => {
    const endpoints = {
      upload: '/api/upload',
      analytics: '/api/analytics',
      jobs: '/api/jobs',
      resumes: '/api/resumes',
    };

    it('GET /api/v1 lists the endpoint prefixes', async () => {
      const res = await app.inject({ url: '/api/v1' });
      expect(res.json()).toEqual({
        message: 'Resume Intelligence Platform API',
        version: '1.0.0',
        apiVersion: 'v1',
        endpoints,
      });
    });

    it('GET /api keeps the legacy shape', async () => {
      const res = await app.inject({ url: '/api' });
      expect(res.json()).toEqual({
        message: 'Resume Intelligence Platform API Gateway',
        version: '1.0.0',
        endpoints,
      });
    });
  });

  describe('proxying', () => {
    it.each([
      ['POST', '/api/upload/single', 'upload', '/api/v1/upload/single'],
      ['GET', '/api/upload/abc/status', 'upload', '/api/v1/upload/abc/status'],
      ['DELETE', '/api/upload/resumes/abc', 'upload', '/api/v1/upload/resumes/abc'],
      ['GET', '/api/analytics/dashboard', 'analytics', '/api/v1/dashboard'],
      [
        'GET',
        '/api/analytics/resumes?keyword=jane&page=2',
        'analytics',
        '/api/v1/resumes?keyword=jane&page=2',
      ],
      ['GET', '/api/jobs', 'analytics', '/api/v1/jobs'],
      ['GET', '/api/jobs/with-matches', 'analytics', '/api/v1/jobs/with-matches'],
      ['POST', '/api/jobs/seed', 'analytics', '/api/v1/jobs/seed'],
      ['GET', '/api/resumes/r-1', 'analytics', '/api/v1/resumes/r-1'],
    ] as const)('%s %s -> %s %s', async (method, url, service, upstreamUrl) => {
      const res = await app.inject({
        method,
        url,
        ...(method === 'POST' ? { payload: { a: 1 } } : {}),
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ service, method, url: upstreamUrl });
    });

    it.each([
      ['upload', '/api/upload/abc/status'],
      ['analytics', '/api/analytics/dashboard'],
      ['jobs', '/api/jobs'],
      ['resumes', '/api/resumes/r-1'],
    ])(
      'forwards the client IP to the %s upstream (previously only uploads did)',
      async (_route, url) => {
        const res = await app.inject({ url, remoteAddress: '10.1.2.3' });
        expect(res.json().forwardedFor).toBe('10.1.2.3');
      }
    );

    it('does not let clients spoof x-forwarded-for when proxies are not trusted', async () => {
      const res = await app.inject({
        url: '/api/jobs',
        remoteAddress: '10.1.2.3',
        headers: { 'x-forwarded-for': '6.6.6.6' },
      });
      expect(res.json().forwardedFor).toBe('10.1.2.3');
    });

    it('forwards the client address from x-forwarded-for when TRUST_PROXY is configured', async () => {
      const original = config.http.trustProxy;
      config.http.trustProxy = 1;
      const trusting = await buildApp();
      try {
        const res = await trusting.inject({
          url: '/api/jobs',
          remoteAddress: '10.0.0.1', // the edge proxy
          headers: { 'x-forwarded-for': '203.0.113.7' },
        });
        expect(res.json().forwardedFor).toBe('203.0.113.7');
      } finally {
        config.http.trustProxy = original;
        await trusting.close();
      }
    });

    describe('request correlation', () => {
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

      it('generates a request id, returns it to the client and forwards the same id upstream', async () => {
        const res = await app.inject({ url: '/api/jobs' });

        expect(res.headers['x-request-id']).toMatch(UUID_RE);
        expect(res.json().requestId).toBe(res.headers['x-request-id']);
      });

      it('adopts a well-formed inbound x-request-id (e.g. from the edge proxy) across the whole chain', async () => {
        const res = await app.inject({
          url: '/api/jobs',
          headers: { 'x-request-id': 'nginx-edge-id-0001' },
        });

        expect(res.headers['x-request-id']).toBe('nginx-edge-id-0001');
        expect(res.json().requestId).toBe('nginx-edge-id-0001');
      });

      it('replaces a malformed inbound id instead of forwarding attacker-controlled text', async () => {
        const res = await app.inject({
          url: '/api/jobs',
          headers: { 'x-request-id': 'bad id; drop table' },
        });

        expect(res.headers['x-request-id']).toMatch(UUID_RE);
        expect(res.json().requestId).toBe(res.headers['x-request-id']);
      });

      it('tags gateway-owned routes too', async () => {
        const res = await app.inject({ url: '/api/v1' });
        expect(res.headers['x-request-id']).toMatch(UUID_RE);
      });
    });

    it('forwards request bodies', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/analytics/export/csv',
        payload: { resumeIds: ['a'] },
      });
      expect(res.json()).toMatchObject({ url: '/api/v1/export/csv', body: { resumeIds: ['a'] } });
    });

    it('returns a 404 in the gateway error envelope for unknown paths', async () => {
      const res = await app.inject({
        url: '/api/unknown',
        headers: { 'x-request-id': 'edge-trace-0404' },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({
        success: false,
        error: 'Route not found',
        requestId: 'edge-trace-0404',
      });
    });
  });

  describe('upstream failures', () => {
    /** Builds a gateway whose upload route points at `upstream`, restoring the shared config afterwards. */
    async function withUploadUpstream<T>(
      upstream: string,
      timeout: number,
      run: (gateway: FastifyInstance) => Promise<T>
    ) {
      const original = { ...gatewayRoutes.upload };
      gatewayRoutes.upload.upstream = upstream;
      gatewayRoutes.upload.timeout = timeout;
      const gateway = await buildApp();
      try {
        return await run(gateway);
      } finally {
        Object.assign(gatewayRoutes.upload, original);
        await gateway.close();
      }
    }

    it('answers 504 instead of hanging when an upstream stops responding (the route timeout is applied)', async () => {
      const hanging = http.createServer(() => {
        /* accept the request, never respond */
      });
      await new Promise<void>((resolve) => hanging.listen(0, '127.0.0.1', resolve));
      const { port } = hanging.address() as AddressInfo;
      const started = Date.now();

      try {
        await withUploadUpstream(`http://127.0.0.1:${port}`, 300, async (gateway) => {
          const res = await gateway.inject({
            url: '/api/upload/abc/status',
            headers: { 'x-request-id': 'edge-trace-0504' },
          });

          expect(res.statusCode).toBe(504);
          expect(res.json()).toEqual({
            success: false,
            error: 'Upstream service timed out',
            requestId: 'edge-trace-0504',
          });
          expect(Date.now() - started).toBeLessThan(3000);
        });
      } finally {
        hanging.closeAllConnections();
        await new Promise((resolve) => hanging.close(resolve));
      }
    });

    it('answers 503 when an upstream refuses connections', async () => {
      const closed = http.createServer();
      await new Promise<void>((resolve) => closed.listen(0, '127.0.0.1', resolve));
      const { port } = closed.address() as AddressInfo;
      await new Promise((resolve) => closed.close(resolve));

      await withUploadUpstream(`http://127.0.0.1:${port}`, 1000, async (gateway) => {
        const res = await gateway.inject({ url: '/api/upload/abc/status' });

        expect(res.statusCode).toBe(503);
        expect(res.json()).toMatchObject({ success: false, error: 'Upstream service unavailable' });
        expect(JSON.stringify(res.json())).not.toContain(String(port));
      });
    });

    it('answers 502 when an upstream drops the connection without responding', async () => {
      const dropping = http.createServer((req) => req.socket.destroy());
      await new Promise<void>((resolve) => dropping.listen(0, '127.0.0.1', resolve));
      const { port } = dropping.address() as AddressInfo;

      try {
        await withUploadUpstream(`http://127.0.0.1:${port}`, 1000, async (gateway) => {
          const res = await gateway.inject({ url: '/api/upload/abc/status' });

          expect(res.statusCode).toBe(502);
          expect(res.json()).toMatchObject({ success: false, error: 'Bad gateway' });
        });
      } finally {
        await new Promise((resolve) => dropping.close(resolve));
      }
    });

    it('applies each route’s own timeout (uploads get longer than reads)', () => {
      expect(gatewayRoutes.upload.timeout).toBeGreaterThan(gatewayRoutes.analytics.timeout ?? 0);
    });
  });

  describe('API docs', () => {
    it('documents only the gateway’s own routes in its spec', async () => {
      const res = await app.inject({ url: '/docs/json' });

      expect(res.statusCode).toBe(200);
      const spec = res.json();
      expect(spec.info.title).toBe('Resume Intelligence Platform API Gateway');
      expect(Object.keys(spec.paths).sort()).toEqual(['/api', '/api/v1', '/health']);
      expect(spec.paths['/api'].get.deprecated).toBe(true);
    });

    it('serves Swagger UI with a selector for every API', async () => {
      const page = await app.inject({ url: '/docs' });
      expect(page.statusCode).toBe(200);

      const initializer = (await app.inject({ url: '/docs/static/swagger-initializer.js' })).body;
      expect(initializer).toContain('"name":"API Gateway","url":"/docs/json"');
      expect(initializer).toContain(
        '"name":"Upload Service (via gateway)","url":"/docs/services/upload/json"'
      );
      expect(initializer).toContain(
        '"name":"Analytics API (via gateway)","url":"/docs/services/analytics/json"'
      );
    });

    it('re-publishes the upload service spec with gateway paths', async () => {
      const res = await app.inject({ url: '/docs/services/upload/json' });

      expect(res.statusCode).toBe(200);
      const spec = res.json();
      expect(Object.keys(spec.paths)).toEqual(['/api/upload/single']);
      expect(spec.tags).toEqual([{ name: 'Upload' }]);
      expect(spec).not.toHaveProperty('servers');
    });

    it('re-publishes the analytics spec mapping jobs and resumes to their own prefixes', async () => {
      const spec = (await app.inject({ url: '/docs/services/analytics/json' })).json();
      expect(Object.keys(spec.paths)).toEqual([
        '/api/analytics/dashboard',
        '/api/jobs/{id}',
        '/api/resumes',
      ]);
    });

    it('returns 404 for an unknown service', async () => {
      const res = await app.inject({ url: '/docs/services/nope/json' });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ success: false, error: 'Unknown service "nope"' });
    });

    it('returns 502 when the upstream spec is unavailable', async () => {
      gatewayRoutes.upload.upstream = 'http://127.0.0.1:1';
      try {
        const res = await app.inject({ url: '/docs/services/upload/json' });
        expect(res.statusCode).toBe(502);
        expect(res.json()).toEqual({
          success: false,
          error: 'Upload Service docs are unavailable',
        });
      } finally {
        gatewayRoutes.upload.upstream = config.uploadService.url;
      }
    });

    it('is not registered when API docs are disabled', async () => {
      config.apiDocs.enabled = false;
      const noDocs = await buildApp();
      try {
        expect((await noDocs.inject({ url: '/docs/json' })).statusCode).toBe(404);
        expect((await noDocs.inject({ url: '/docs/services/upload/json' })).statusCode).toBe(404);
      } finally {
        config.apiDocs.enabled = true;
        await noDocs.close();
      }
    });
  });
});
