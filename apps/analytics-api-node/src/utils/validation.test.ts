import { describe, expect, it } from 'vitest';
import { sanitizeKeyword, validateLimit, validateMinScore, validatePage, validateSortOrder } from './validation';

describe('validateLimit', () => {
  it.each([
    [undefined, 10],
    ['', 10],
    ['abc', 10],
    ['0', 10],
    ['-5', 10],
    ['25', 25],
    ['25.9', 25],
    ['1000', 100],
  ])('limit %j -> %i (defaults 10, max 100)', (input, expected) => {
    expect(validateLimit(input)).toBe(expected);
  });

  it('honours custom default and maximum', () => {
    expect(validateLimit(undefined, 5, 20)).toBe(5);
    expect(validateLimit('50', 5, 20)).toBe(20);
  });
});

describe('validateMinScore', () => {
  it.each([
    [undefined, 0],
    ['', 0],
    ['abc', 0],
    ['-1', 0],
    ['0', 0],
    ['72.5', 72.5],
    ['150', 100],
  ])('minScore %j -> %d', (input, expected) => {
    expect(validateMinScore(input)).toBe(expected);
  });

  it('honours a custom default', () => {
    expect(validateMinScore(undefined, 40)).toBe(40);
  });
});

describe('sanitizeKeyword', () => {
  it('returns undefined for empty input', () => {
    expect(sanitizeKeyword(undefined)).toBeUndefined();
    expect(sanitizeKeyword('')).toBeUndefined();
  });

  it('trims whitespace', () => {
    expect(sanitizeKeyword('  react  ')).toBe('react');
  });

  it('truncates to 100 characters', () => {
    expect(sanitizeKeyword('x'.repeat(150))).toHaveLength(100);
  });
});

describe('validatePage', () => {
  it.each([
    [undefined, 1],
    ['abc', 1],
    ['0', 1],
    ['-2', 1],
    ['3', 3],
  ])('page %j -> %i', (input, expected) => {
    expect(validatePage(input)).toBe(expected);
  });

  it('honours a custom default', () => {
    expect(validatePage(undefined, 2)).toBe(2);
  });
});

describe('validateSortOrder', () => {
  it.each([
    ['asc', 'asc'],
    ['ASC', 'asc'],
    ['desc', 'desc'],
    ['DESC', 'desc'],
    [undefined, 'desc'],
    ['sideways', 'desc'],
  ])('%j -> %s', (input, expected) => {
    expect(validateSortOrder(input)).toBe(expected);
  });
});
