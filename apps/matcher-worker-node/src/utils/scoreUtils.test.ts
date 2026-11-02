import { describe, expect, it } from 'vitest';
import { categorizeMatch, formatMatchScore, isHighMatch } from './scoreUtils';

describe('formatMatchScore', () => {
  it.each([
    [0, '0.0%'],
    [0.5, '50.0%'],
    [0.8766, '87.7%'],
    [1, '100.0%'],
  ])('formats %d as %s', (score, expected) => {
    expect(formatMatchScore(score)).toBe(expected);
  });
});

describe('isHighMatch', () => {
  it('uses a 0.7 threshold by default, inclusive', () => {
    expect(isHighMatch(0.7)).toBe(true);
    expect(isHighMatch(0.69)).toBe(false);
  });

  it('honours a custom threshold', () => {
    expect(isHighMatch(0.5, 0.5)).toBe(true);
    expect(isHighMatch(0.49, 0.5)).toBe(false);
  });
});

describe('categorizeMatch', () => {
  it.each([
    [1, 'excellent'],
    [0.8, 'excellent'],
    [0.79, 'good'],
    [0.6, 'good'],
    [0.59, 'fair'],
    [0.4, 'fair'],
    [0.39, 'poor'],
    [0, 'poor'],
  ] as const)('%d is %s', (score, category) => {
    expect(categorizeMatch(score)).toBe(category);
  });
});
