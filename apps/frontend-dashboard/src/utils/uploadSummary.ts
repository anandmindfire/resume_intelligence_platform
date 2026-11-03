import type { UploadResult } from '../types';

const SUCCESS_STATUSES = ['uploaded', 'success'];
const FAILED_STATUSES = ['failed', 'error'];

export interface UploadSummary {
  successCount: number;
  failedCount: number;
}

/** Summarises bulk upload results into success/failure counts. */
export function summarizeUploadResults(results: UploadResult[]): UploadSummary {
  return {
    successCount: results.filter((r) => SUCCESS_STATUSES.includes(r.status)).length,
    failedCount: results.filter((r) => FAILED_STATUSES.includes(r.status)).length,
  };
}
