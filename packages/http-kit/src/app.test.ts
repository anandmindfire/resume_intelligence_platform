import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

const { info } = vi.hoisted(() => ({ info: vi.fn() }));
vi.mock('@resume-platform/logger', () => ({ logger: { info } }));

import { createBaseApp } from './app';
import { registerAccessLog } from './hooks';
import { REQUEST_ID_HEADER } from './requestId';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

let app: FastifyInstance | undefined;

async function build(options?: Parameters<typeof createBaseApp>[0]) {
  app = createBaseApp(options);
  app.get('/echo', async (request) => ({ id: request.id, ip: request.ip }));
  app.get('/boom', async () => {
    throw new Error('kaboom');
  });
  await app.ready();
  return app;
}

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('createBaseApp', () => {
  describe('request correlation', () => {
    it('generates a request id, exposes it to handlers and echoes it on the response', async () => {
      const res = await (await build()).inject({ url: '/echo' });

      expect(res.headers[REQUEST_ID_HEADER]).toMatch(UUID_RE);
      expect(res.json().id).toBe(res.headers[REQUEST_ID_HEADER]);
    });

    it('adopts a well-formed inbound x-request-id end to end', async () => {
      const res = await (
        await build()
      ).inject({ url: '/echo', headers: { [REQUEST_ID_HEADER]: 'edge-trace-0001' } });

      expect(res.headers[REQUEST_ID_HEADER]).toBe('edge-trace-0001');
      expect(res.json().id).toBe('edge-trace-0001');
    });

    it('replaces a malformed inbound id rather than echoing attacker-controlled text', async () => {
      const res = await (
        await build()
      ).inject({ url: '/echo', headers: { [REQUEST_ID_HEADER]: 'x y z <script>' } });

      expect(res.headers[REQUEST_ID_HEADER]).toMatch(UUID_RE);
    });

    it('ignores the legacy Fastify "request-id" header so only x-request-id is honoured', async () => {
      const res = await (
        await build()
      ).inject({ url: '/echo', headers: { 'request-id': 'legacy-header-id-1' } });

      expect(res.headers[REQUEST_ID_HEADER]).toMatch(UUID_RE);
    });

    it('still tags 404 responses, which never reach a handler', async () => {
      const res = await (
        await build()
      ).inject({ url: '/nope', headers: { [REQUEST_ID_HEADER]: 'edge-trace-0002' } });

      expect(res.statusCode).toBe(404);
      expect(res.headers[REQUEST_ID_HEADER]).toBe('edge-trace-0002');
    });

    it('still tags error responses', async () => {
      const res = await (await build()).inject({ url: '/boom' });

      expect(res.statusCode).toBe(500);
      expect(res.headers[REQUEST_ID_HEADER]).toMatch(UUID_RE);
    });
  });

  describe('access log', () => {
    it('logs one structured line per response, tagged with the request id', async () => {
      info.mockClear();
      const res = await (
        await build()
      ).inject({
        url: '/echo',
        headers: { [REQUEST_ID_HEADER]: 'edge-trace-0003', 'user-agent': 'vitest' },
      });

      await vi.waitFor(() => expect(info).toHaveBeenCalledTimes(1));
      expect(res.statusCode).toBe(200);
      expect(info).toHaveBeenCalledWith('HTTP Request', {
        reqId: 'edge-trace-0003',
        method: 'GET',
        path: '/echo',
        statusCode: 200,
        duration: expect.stringMatching(/^\d+ms$/),
        ip: expect.any(String),
        userAgent: 'vitest',
      });
    });

    it('never logs the query string (it can carry personal data such as search terms)', async () => {
      info.mockClear();
      await (await build()).inject({ url: '/echo?keyword=Jane%20Doe&location=Pune' });

      await vi.waitFor(() => expect(info).toHaveBeenCalled());
      expect(info.mock.calls[0][1].path).toBe('/echo');
      expect(JSON.stringify(info.mock.calls)).not.toContain('Jane');
    });

    it('logs the real status code for errors and not-found responses', async () => {
      info.mockClear();
      const server = await build();
      await server.inject({ url: '/nope' });
      await server.inject({ url: '/boom' });

      await vi.waitFor(() => expect(info).toHaveBeenCalledTimes(2));
      expect(info.mock.calls.map(([, meta]) => meta.statusCode)).toEqual([404, 500]);
    });

    it('accepts an injected logger', async () => {
      const spy = { info: vi.fn() };
      app = createBaseApp();
      registerAccessLog(app, spy);
      app.get('/x', async () => 'ok');
      await app.inject({ url: '/x' });

      await vi.waitFor(() => expect(spy.info).toHaveBeenCalled());
    });
  });

  describe('trustProxy', () => {
    const headers = { 'x-forwarded-for': '203.0.113.7' };

    it('does not trust x-forwarded-for by default (clients could otherwise choose their own rate-limit identity)', async () => {
      const res = await (await build()).inject({ url: '/echo', headers });

      expect(res.json().ip).not.toBe('203.0.113.7');
    });

    it('uses the forwarded client address when proxies are trusted', async () => {
      const res = await (await build({ trustProxy: true })).inject({ url: '/echo', headers });

      expect(res.json().ip).toBe('203.0.113.7');
    });

    it('supports a hop count', async () => {
      const res = await (await build({ trustProxy: 1 })).inject({ url: '/echo', headers });

      expect(res.json().ip).toBe('203.0.113.7');
    });
  });
});
