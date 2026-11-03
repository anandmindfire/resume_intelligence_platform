/**
 * Queue and job names shared by every producer/consumer in the pipeline:
 * upload-service -> ocr-worker -> parser-worker -> upload-service -> matcher-worker -> insights-worker.
 *
 * These are also the exact Redis list names the Python workers poll (BullMQ queue names and plain Redis
 * list names deliberately coincide so a job can be pushed to both at once). Python can't import this
 * module, so keep any change here in sync with apps/*-worker-python/src/constants/config.py.
 */
export const QUEUE_NAMES = {
  OCR: 'ocr-queue',
  PARSER: 'parser-queue',
  MATCHER: 'matcher-queue',
  EXPORT: 'export-queue',
  INSIGHTS: 'insights-queue',
} as const;

/** BullMQ job names, paired one-to-one with the queue each is added to. */
export const JOB_NAMES = {
  PROCESS_OCR: 'process-ocr',
  PROCESS_PARSER: 'process-parser',
  PROCESS_MATCH: 'process-match',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];
