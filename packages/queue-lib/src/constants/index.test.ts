import { describe, expect, it } from 'vitest';
import { JOB_NAMES, QUEUE_NAMES } from './index';

describe('QUEUE_NAMES', () => {
  it('has no duplicate queue names', () => {
    const names = Object.values(QUEUE_NAMES);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('JOB_NAMES', () => {
  it('has no duplicate job names', () => {
    const names = Object.values(JOB_NAMES);
    expect(new Set(names).size).toBe(names.length);
  });
});
