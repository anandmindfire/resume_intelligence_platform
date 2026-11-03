import { describe, expect, it } from 'vitest';
import { rewriteRequestHeaders } from './proxyHeaders';

describe('rewriteRequestHeaders', () => {
  const request = { ip: '203.0.113.7', id: 'req-1234abcd' };

  it('adds the resolved client ip and the request id', () => {
    expect(rewriteRequestHeaders(request, { accept: 'application/json' })).toEqual({
      accept: 'application/json',
      'x-forwarded-for': '203.0.113.7',
      'x-request-id': 'req-1234abcd',
    });
  });

  it('replaces client-supplied x-forwarded-for / x-request-id instead of passing them through', () => {
    const headers = rewriteRequestHeaders(request, {
      'x-forwarded-for': '6.6.6.6, 7.7.7.7',
      'x-request-id': 'forged\nid',
    });

    expect(headers['x-forwarded-for']).toBe('203.0.113.7');
    expect(headers['x-request-id']).toBe('req-1234abcd');
  });

  it('does not mutate the incoming headers', () => {
    const incoming = { accept: '*/*' };
    rewriteRequestHeaders(request, incoming);
    expect(incoming).toEqual({ accept: '*/*' });
  });
});
