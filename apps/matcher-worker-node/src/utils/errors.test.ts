import { describe, expect, it } from 'vitest';
import { getErrorMessage, getErrorStack } from './errors';

describe('getErrorMessage', () => {
  it('returns the message of Error instances, including subclasses', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('boom');
    expect(getErrorMessage(new TypeError('bad type'))).toBe('bad type');
  });

  it.each([
    ['a string', 'plain failure', 'plain failure'],
    ['a number', 42, '42'],
    ['null', null, 'null'],
    ['undefined', undefined, 'undefined'],
  ])('stringifies %s thrown values', (_label, value, expected) => {
    expect(getErrorMessage(value)).toBe(expected);
  });
});

describe('getErrorStack', () => {
  it('returns the stack of Error instances', () => {
    const error = new Error('boom');
    expect(getErrorStack(error)).toBe(error.stack);
  });

  it('returns undefined for non-errors', () => {
    expect(getErrorStack('nope')).toBeUndefined();
    expect(getErrorStack({ stack: 'fake' })).toBeUndefined();
  });
});
