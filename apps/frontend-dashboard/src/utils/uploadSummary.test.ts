import { describe, expect, it } from 'vitest';
import { summarizeUploadResults } from './uploadSummary';
import type { UploadResult } from '../types';

describe('summarizeUploadResults', () => {
  it('counts uploaded/success as successful and failed/error as failed', () => {
    const results: UploadResult[] = [
      { fileName: 'a.pdf', status: 'uploaded' },
      { fileName: 'b.pdf', status: 'uploaded' },
      { fileName: 'c.pdf', status: 'failed', error: 'Corrupt file' },
    ];
    expect(summarizeUploadResults(results)).toEqual({ successCount: 2, failedCount: 1 });
  });

  it('returns zero counts for an empty list', () => {
    expect(summarizeUploadResults([])).toEqual({ successCount: 0, failedCount: 0 });
  });

  it('treats everything-succeeded correctly', () => {
    const results: UploadResult[] = [{ fileName: 'only.pdf', status: 'uploaded' }];
    expect(summarizeUploadResults(results)).toEqual({ successCount: 1, failedCount: 0 });
  });
});
