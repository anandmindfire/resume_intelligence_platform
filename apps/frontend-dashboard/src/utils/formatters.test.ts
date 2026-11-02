import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatFileSize,
  formatMatchScore,
  formatNumber,
  formatSkills,
  normalizeMatchScore,
  truncateText,
} from './formatters';

describe('formatDate', () => {
  it('returns "-" for missing input', () => {
    expect(formatDate()).toBe('-');
    expect(formatDate('')).toBe('-');
  });

  it('formats an ISO date as "Mon D, YYYY"', () => {
    expect(formatDate('2024-03-15T12:00:00.000Z')).toBe('Mar 15, 2024');
    expect(formatDate('2023-12-01')).toBe('Dec 1, 2023');
  });

  // BUG: src/utils/formatters.ts:3-12 - `new Date('garbage').toLocaleDateString()` does not
  // throw, it returns "Invalid Date", so the catch fallback (return the raw string) is unreachable.
  it.fails('falls back to the raw string for unparseable dates', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date');
  });
});

describe('formatSkills', () => {
  it('returns "-" for undefined or empty list', () => {
    expect(formatSkills()).toBe('-');
    expect(formatSkills([])).toBe('-');
  });

  it('joins up to three skills', () => {
    expect(formatSkills(['A'])).toBe('A');
    expect(formatSkills(['A', 'B', 'C'])).toBe('A, B, C');
  });

  it('summarises the remainder beyond three skills', () => {
    expect(formatSkills(['A', 'B', 'C', 'D', 'E'])).toBe('A, B, C +2 more');
  });
});

describe('normalizeMatchScore', () => {
  it('returns 0 for missing or non-numeric input', () => {
    expect(normalizeMatchScore()).toBe(0);
    expect(normalizeMatchScore(null as unknown as number)).toBe(0);
    expect(normalizeMatchScore('abc')).toBe(0);
    expect(normalizeMatchScore(NaN)).toBe(0);
  });

  it('scales unit-range scores (0, 1] to percentages', () => {
    expect(normalizeMatchScore(0.75)).toBe(75);
    expect(normalizeMatchScore(1)).toBe(100);
    expect(normalizeMatchScore('0.5')).toBe(50);
  });

  it('keeps percentage-range scores as-is', () => {
    expect(normalizeMatchScore(0)).toBe(0);
    expect(normalizeMatchScore(42)).toBe(42);
    expect(normalizeMatchScore(100)).toBe(100);
    expect(normalizeMatchScore('85')).toBe(85);
  });

  it('treats scores above 100 as basis points', () => {
    expect(normalizeMatchScore(7500)).toBe(75);
    expect(normalizeMatchScore('10000')).toBe(100);
  });
});

describe('formatMatchScore', () => {
  it('returns "-" for missing input', () => {
    expect(formatMatchScore()).toBe('-');
    expect(formatMatchScore(null as unknown as number)).toBe('-');
  });

  it('formats normalised scores as rounded percentages', () => {
    expect(formatMatchScore(0.756)).toBe('76%');
    expect(formatMatchScore(64.4)).toBe('64%');
    expect(formatMatchScore(9000)).toBe('90%');
    expect(formatMatchScore('0.2')).toBe('20%');
    expect(formatMatchScore(0)).toBe('0%');
  });
});

describe('formatNumber', () => {
  it('adds thousands separators', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(1234567)).toBe('1,234,567');
    expect(formatNumber(1234.5)).toBe('1,234.5');
  });
});

describe('formatFileSize', () => {
  it('handles zero', () => {
    expect(formatFileSize(0)).toBe('0 Bytes');
  });

  it('picks the appropriate unit and rounds to two decimals', () => {
    expect(formatFileSize(500)).toBe('500 Bytes');
    expect(formatFileSize(1024)).toBe('1 KB');
    expect(formatFileSize(1536)).toBe('1.5 KB');
    expect(formatFileSize(1024 * 1024 * 2.345)).toBe('2.35 MB');
    expect(formatFileSize(1024 ** 3)).toBe('1 GB');
  });
});

describe('truncateText', () => {
  it('returns text unchanged when within the limit', () => {
    expect(truncateText('hello', 5)).toBe('hello');
    expect(truncateText('', 3)).toBe('');
  });

  it('truncates and appends an ellipsis when too long', () => {
    expect(truncateText('hello world', 5)).toBe('hello...');
  });
});
