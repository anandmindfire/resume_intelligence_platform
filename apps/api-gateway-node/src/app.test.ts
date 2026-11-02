import Fastify, { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@resume-platform/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
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
    for (const [key, upstream] of Object.entries(original.upstreams)) gatewayRoutes[key].upstream = upstream;
  });

  describe('GET /health', () => {
    it('reports every upstream as healthy when they respond', async () => {
      const res = await app.inject({ url: '/health' });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ status: 'ok', services: { upload: 'healthy', analytics: 'healthy' } });
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
    const endpoints = { upload: '/api/upload', analytics: '/api/analytics', jobs: '/api/jobs', resumes: '/api/resumes' };

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
      expect(res.json()).toEqual({ message: 'Resume Intelligence Platform API Gateway', version: '1.0.0', endpoints });
    });
  });

  describe('proxying', () => {
    it.each([
      ['POST', '/api/upload/single', 'upload', '/api/v1/upload/single'],
      ['GET', '/api/upload/abc/status', 'upload', '/api/v1/upload/abc/status'],
      ['DELETE', '/api/upload/resumes/abc', 'upload', '/api/v1/upload/resumes/abc'],
      ['GET', '/api/analytics/dashboard', 'analytics', '/api/v1/dashboard'],
      ['GET', '/api/analytics/resumes?keyword=jane&page=2', 'analytics', '/api/v1/resumes?keyword=jane&page=2'],
      ['GET', '/api/jobs', 'analytics', '/api/v1/jobs'],
      ['GET', '/api/jobs/with-matches', 'analytics', '/api/v1/jobs/with-matches'],
      ['POST', '/api/jobs/seed', 'analytics', '/api/v1/jobs/seed'],
      ['GET', '/api/resumes/r-1', 'analytics', '/api/v1/resumes/r-1'],
    ] as const)('%s %s -> %s %s', async (method, url, service, upstreamUrl) => {
      const res = await app.inject({ method, url, ...(method === 'POST' ? { payload: { a: 1 } } : {}) });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ service, method, url: upstreamUrl });
    });

    it('forwards the client IP on upload requests', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/upload/single', remoteAddress: '10.1.2.3', payload: {} });
      expect(res.json().forwardedFor).toBe('10.1.2.3');
    });

    it('forwards request bodies', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/analytics/export/csv', payload: { resumeIds: ['a'] } });
      expect(res.json()).toMatchObject({ url: '/api/v1/export/csv', body: { resumeIds: ['a'] } });
    });

    it('returns 404 for unknown paths', async () => {
      const res = await app.inject({ url: '/api/unknown' });
      expect(res.statusCode).toBe(404);
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
      expect(initializer).toContain('"name":"Upload Service (via gateway)","url":"/docs/services/upload/json"');
      expect(initializer).toContain('"name":"Analytics API (via gateway)","url":"/docs/services/analytics/json"');
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
      expect(Object.keys(spec.paths)).toEqual(['/api/analytics/dashboard', '/api/jobs/{id}', '/api/resumes']);
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
        expect(res.json()).toEqual({ success: false, error: 'Upload Service docs are unavailable' });
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
