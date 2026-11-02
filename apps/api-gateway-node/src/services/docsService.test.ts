import { describe, expect, it, vi } from 'vitest';

vi.mock('axios', () => ({ default: { get: vi.fn() } }));

import axios from 'axios';
import { fetchServiceSpec, rewriteSpecForGateway, type OpenApiDocument } from './docsService';
import type { GatewayRouteConfig } from '../types';

const op = (tag: string) => ({ tags: [tag], responses: {} });

const uploadRoutes: GatewayRouteConfig[] = [
  { upstream: 'http://upload', prefix: '/api/upload', rewritePrefix: '/api/v1/upload' },
];

const analyticsRoutes: GatewayRouteConfig[] = [
  { upstream: 'http://analytics', prefix: '/api/analytics', rewritePrefix: '/api/v1' },
  { upstream: 'http://analytics', prefix: '/api/jobs', rewritePrefix: '/api/v1/jobs' },
  { upstream: 'http://analytics', prefix: '/api/resumes', rewritePrefix: '/api/v1/resumes' },
];

describe('rewriteSpecForGateway', () => {
  it('maps upstream paths to gateway paths and drops unproxied ones', () => {
    const spec: OpenApiDocument = {
      openapi: '3.0.3',
      info: { title: 'Upload Service API', version: '1.0.0' },
      paths: {
        '/api/v1/upload/single': { post: op('Upload') },
        '/api/v1/upload/resumes/{resumeId}/file': { get: op('Upload') },
        '/api/internal/queue/matcher': { post: op('Internal') },
        '/health': { get: op('Health') },
      },
    };

    const result = rewriteSpecForGateway(spec, uploadRoutes);

    expect(Object.keys(result.paths!)).toEqual(['/api/upload/single', '/api/upload/resumes/{resumeId}/file']);
    expect(result.paths!['/api/upload/single']).toBe(spec.paths!['/api/v1/upload/single']);
    expect(result.info).toEqual(spec.info);
  });

  it('prefers the most specific rewrite prefix', () => {
    const spec: OpenApiDocument = {
      paths: {
        '/api/v1/dashboard': { get: op('Analytics') },
        '/api/v1/jobs': { get: op('Jobs') },
        '/api/v1/jobs/{id}/matches': { get: op('Jobs') },
        '/api/v1/resumes': { get: op('Resumes') },
        '/api/v1/resumes/{id}': { get: op('Resumes') },
      },
    };

    expect(Object.keys(rewriteSpecForGateway(spec, analyticsRoutes).paths!)).toEqual([
      '/api/analytics/dashboard',
      '/api/jobs',
      '/api/jobs/{id}/matches',
      '/api/resumes',
      '/api/resumes/{id}',
    ]);
  });

  it('only matches whole path segments', () => {
    const spec: OpenApiDocument = { paths: { '/api/v1/uploader': { get: op('X') } } };
    expect(rewriteSpecForGateway(spec, uploadRoutes).paths).toEqual({});
  });

  it('falls back to the gateway prefix when a route has no rewritePrefix', () => {
    const spec: OpenApiDocument = { paths: { '/api/files/x': { get: op('X') } } };
    const routes = [{ upstream: 'http://files', prefix: '/api/files' }];
    expect(Object.keys(rewriteSpecForGateway(spec, routes).paths!)).toEqual(['/api/files/x']);
  });

  it('removes tags that no longer have operations', () => {
    const spec: OpenApiDocument = {
      tags: [{ name: 'Upload' }, { name: 'Internal' }, { name: 'Health' }],
      paths: {
        '/api/v1/upload/single': { post: op('Upload'), parameters: [] },
        '/api/internal/queue/matcher': { post: op('Internal') },
        '/health': { get: op('Health') },
      },
    };

    expect(rewriteSpecForGateway(spec, uploadRoutes).tags).toEqual([{ name: 'Upload' }]);
  });

  it('removes upstream servers so requests go to the gateway origin', () => {
    const spec: OpenApiDocument = { servers: [{ url: 'http://upload:3001' }], paths: {} };
    expect(rewriteSpecForGateway(spec, uploadRoutes)).not.toHaveProperty('servers');
  });

  it('copes with a spec without paths or tags', () => {
    expect(rewriteSpecForGateway({ openapi: '3.0.3' }, uploadRoutes)).toEqual({ openapi: '3.0.3', paths: {} });
  });

  it('does not mutate the input spec', () => {
    const spec: OpenApiDocument = { servers: [], tags: [{ name: 'Health' }], paths: { '/health': { get: op('Health') } } };
    const copy = structuredClone(spec);
    rewriteSpecForGateway(spec, uploadRoutes);
    expect(spec).toEqual(copy);
  });
});

describe('fetchServiceSpec', () => {
  it('fetches /docs/json from the upstream with a timeout', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({ data: { openapi: '3.0.3' } });

    await expect(fetchServiceSpec('http://upload:3001')).resolves.toEqual({ openapi: '3.0.3' });
    expect(axios.get).toHaveBeenCalledWith('http://upload:3001/docs/json', { timeout: 5000 });
  });

  it('propagates errors', async () => {
    vi.mocked(axios.get).mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(fetchServiceSpec('http://upload:3001', 100)).rejects.toThrow('ECONNREFUSED');
  });
});
