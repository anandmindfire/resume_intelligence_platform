import { describe, expect, it } from 'vitest';
import { generateRequestId, isValidRequestId, REQUEST_ID_HEADER } from './requestId';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('isValidRequestId', () => {
  it.each([
    'a1b2c3d4', // 8 chars: the minimum
    '3f2504e0-4f89-41d3-9a0c-0305e82c3301', // uuid
    'f3b1c0a29d7e4c1b8a5d6e7f90123456', // nginx $request_id (32 hex)
    'trace.id:abc_123-xyz',
    'A'.repeat(128),
  ])('accepts %s', (id) => {
    expect(isValidRequestId(id)).toBe(true);
  });

  it.each([
    ['too short', 'abc'],
    ['too long', 'a'.repeat(129)],
    ['empty', ''],
    ['contains a space', 'abcd efgh1234'],
    ['contains a newline (log forging)', 'abcdefgh\nlevel=error'],
    ['contains a comma (duplicated header)', 'abcdefgh1234, abcdefgh5678'],
    ['starts with punctuation', '-abcdefgh'],
    ['not a string', 12345678],
    ['undefined', undefined],
  ])('rejects an id that is %s', (_label, id) => {
    expect(isValidRequestId(id)).toBe(false);
  });
});

describe('generateRequestId', () => {
  it('reuses a well-formed inbound x-request-id', () => {
    expect(generateRequestId({ headers: { [REQUEST_ID_HEADER]: 'edge-proxy-id-1234' } })).toBe(
      'edge-proxy-id-1234'
    );
  });

  it('mints a uuid when the header is absent', () => {
    expect(generateRequestId({ headers: {} })).toMatch(UUID_RE);
  });

  it('mints a uuid instead of trusting a malformed id', () => {
    expect(generateRequestId({ headers: { [REQUEST_ID_HEADER]: 'bad id\nwith newline' } })).toMatch(
      UUID_RE
    );
  });

  it('mints a uuid when the header is repeated (Node exposes it as an array only for set-cookie, otherwise joined)', () => {
    expect(
      generateRequestId({ headers: { [REQUEST_ID_HEADER]: ['abcdefgh1', 'abcdefgh2'] } })
    ).toMatch(UUID_RE);
  });

  it('mints a different id each time', () => {
    expect(generateRequestId({ headers: {} })).not.toBe(generateRequestId({ headers: {} }));
  });
});
