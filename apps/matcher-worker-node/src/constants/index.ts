/** Resume status values this worker reads from and writes to (mirrors upload-service's RESUME_STATUS). */
export const RESUME_STATUS = {
  MATCHED: 'matched',
} as const;

/** Action marker sent with every insights job; the Python worker's model anticipates more values later. */
export const INSIGHTS_ACTIONS = {
  UPDATE_INSIGHTS: 'UPDATE_INSIGHTS',
} as const;
