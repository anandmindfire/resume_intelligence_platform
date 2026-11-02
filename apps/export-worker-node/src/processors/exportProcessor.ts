import { Job } from 'bullmq';
import { QueueJobData } from '@resume-platform/queue-lib';
import { logger } from '@resume-platform/logger';
import { createObjectCsvWriter } from 'csv-writer';
import { dbService } from '../services/dbService';
import { ensureDirectoryExists } from '../utils/fileUtils';
import { ExportJobData, ExportResult } from '../types';
import { getErrorMessage, getErrorStack } from '../utils/errors';
import { CSV_EXPORT_HEADERS, EXPORT_STATUS } from '../constants';

/** Queue payloads are untyped at runtime, so check the fields this worker depends on. */
export function parseExportJobData(data: QueueJobData): ExportJobData {
  const { resumeIds, outputPath } = data;

  if (typeof outputPath !== 'string' || outputPath.length === 0) {
    throw new Error('Export job is missing a valid outputPath');
  }
  if (resumeIds !== undefined && !(Array.isArray(resumeIds) && resumeIds.every((id) => typeof id === 'string'))) {
    throw new Error('Export job resumeIds must be an array of strings');
  }

  return { resumeIds, outputPath };
}

export async function processExportJob(job: Job<QueueJobData>): Promise<ExportResult> {
  const { resumeIds, outputPath } = parseExportJobData(job.data);

  logger.info(`Processing export job for ${resumeIds?.length || 'all'} resumes`);

  try {
    await ensureDirectoryExists(outputPath);

    const resumes = await dbService.getResumesForExport(resumeIds);

    const csvWriter = createObjectCsvWriter({
      path: outputPath,
      header: [...CSV_EXPORT_HEADERS],
    });

    await csvWriter.writeRecords(resumes);

    logger.info(`Export completed: ${outputPath}`, {
      recordCount: resumes.length,
      outputPath,
    });

    return {
      outputPath,
      recordCount: resumes.length,
      status: EXPORT_STATUS.COMPLETED,
    };
  } catch (error) {
    logger.error('Export failed', {
      error: getErrorMessage(error),
      stack: getErrorStack(error),
    });
    throw error;
  }
}
