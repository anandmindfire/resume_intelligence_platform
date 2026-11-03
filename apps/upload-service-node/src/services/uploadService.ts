import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import { pipeline } from 'stream/promises';
import { createWriteStream, createReadStream, type ReadStream } from 'fs';
import type { Multipart, MultipartFile } from '@fastify/multipart';
import { config } from '@resume-platform/config';
import { logger, getErrorMessage } from '@resume-platform/logger';
import { fileTooLargeMessage, validateFile } from '../validators/fileValidator';
import { dbService } from './dbService';
import { generateUniqueFileName, getUploadPath } from '../utils/fileUtils';
import { queueHandler } from '../queues/queueHandler';
import { UPLOADS, RESUME_STATUS } from '../constants';
import type { ResumeRecord, UploadResult } from '../types';

const uploadsDir = config.upload.directory || UPLOADS.DEFAULT_DIR;
fs.mkdir(uploadsDir, { recursive: true }).catch((err) => {
  logger.error('Failed to create uploads directory', { error: getErrorMessage(err) });
});

/** Limit concurrent uploads per process when UPLOAD_MAX_CONCURRENT is set; scale via replicas for more capacity. */
export const UPLOAD_CONCURRENCY_LIMIT = config.upload.maxConcurrent ?? 0;

export type SingleUploadOutcome =
  | { accepted: true; resumeId: string; fileName: string }
  | { accepted: false; statusCode: 400 | 413; error: string };

export type DeleteResumeOutcome = 'not_found' | 'deleted';

export type ResumeFileOutcome =
  | { found: true; stream: ReadStream; mimeType: string; fileName: string }
  | { found: false; reason: 'resume_not_found' | 'file_missing' };

/**
 * Streams a multipart part to disk and reports whether it was stored in full.
 *
 * The multipart parser does not fail on a file over UPLOAD_MAX_SIZE: it stops reading at the limit and
 * flags the stream as `truncated`. Such a file is incomplete and must be discarded, not stored (its size
 * would sit exactly at the limit and pass validation).
 */
async function storeUpload(file: MultipartFile['file'], filePath: string): Promise<boolean> {
  try {
    await pipeline(file, createWriteStream(filePath));
  } catch (error) {
    await fs.unlink(filePath).catch(() => {});
    throw error;
  }

  if (file.truncated) {
    await fs.unlink(filePath).catch(() => {});
    return false;
  }
  return true;
}

/** Upload business logic: validation rules, disk storage, persistence and queueing. Framework-agnostic beyond the multipart types it reads. */
class UploadService {
  /** Validates, stores, persists and queues a single file. Expected rejections are returned, not thrown. */
  async uploadSingleFile(data: MultipartFile): Promise<SingleUploadOutcome> {
    if (!config.upload.allowedTypes.includes(data.mimetype)) {
      data.file.resume(); // discard the rejected file's bytes so the request can complete
      return { accepted: false, statusCode: 400, error: `File type ${data.mimetype} not allowed` };
    }

    const uniqueName = generateUniqueFileName(data.filename);
    const filePath = getUploadPath(uniqueName);

    if (!(await storeUpload(data.file, filePath))) {
      return {
        accepted: false,
        statusCode: 413,
        error: fileTooLargeMessage(config.upload.maxSize),
      };
    }

    const stats = await fs.stat(filePath);
    const validation = await validateFile(filePath);
    if (!validation.valid) {
      await fs.unlink(filePath).catch(() => {});
      return {
        accepted: false,
        statusCode: 400,
        error: validation.error ?? 'File validation failed',
      };
    }

    const resumeId = uuidv4();
    await dbService.createResume({
      id: resumeId,
      fileName: data.filename,
      filePath,
      mimeType: data.mimetype,
      fileSize: stats.size,
      status: RESUME_STATUS.UPLOADED,
    });

    await queueHandler.queueOCRJob({
      resumeId,
      filePath,
      fileName: data.filename,
      mimeType: data.mimetype,
    });

    logger.info('Resume uploaded and queued for processing', { resumeId, fileName: data.filename });

    return { accepted: true, resumeId, fileName: data.filename };
  }

  /**
   * Validates, stores, persists and queues every file part. Each file is handled independently: one
   * failing does not fail the rest. Returns the stored file paths too, so the caller can clean up if the
   * surrounding request aborts before this resolves.
   */
  async uploadMultipleFiles(
    parts: AsyncIterableIterator<Multipart>
  ): Promise<{ results: UploadResult[]; anyFileAccepted: boolean }> {
    const results: UploadResult[] = [];
    const files: Array<{ filename: string; mimetype: string; filePath: string }> = [];

    try {
      for await (const part of parts) {
        if (part.type !== 'file') continue;

        if (!config.upload.allowedTypes.includes(part.mimetype)) {
          // The parser only advances to the next part once this one is fully read.
          part.file.resume();
          results.push({
            fileName: part.filename,
            status: RESUME_STATUS.FAILED,
            error: `File type ${part.mimetype} not allowed`,
          });
          continue;
        }

        const uniqueName = generateUniqueFileName(part.filename);
        const filePath = getUploadPath(uniqueName);
        if (!(await storeUpload(part.file, filePath))) {
          results.push({
            fileName: part.filename,
            status: RESUME_STATUS.FAILED,
            error: fileTooLargeMessage(config.upload.maxSize),
          });
          continue;
        }
        files.push({ filename: part.filename, mimetype: part.mimetype, filePath });
      }
    } catch (error) {
      // Parsing aborted (client disconnect, parts limit...): don't leave stored-but-unrecorded files behind.
      await Promise.all(files.map((file) => fs.unlink(file.filePath).catch(() => {})));
      throw error;
    }

    const anyFileAccepted = files.length > 0;

    for (const file of files) {
      try {
        const stats = await fs.stat(file.filePath);
        const validation = await validateFile(file.filePath);

        if (!validation.valid) {
          await fs.unlink(file.filePath).catch(() => {});
          results.push({
            fileName: file.filename,
            status: RESUME_STATUS.FAILED,
            error: validation.error,
          });
          continue;
        }

        const resumeId = uuidv4();
        await dbService.createResume({
          id: resumeId,
          fileName: file.filename,
          filePath: file.filePath,
          mimeType: file.mimetype,
          fileSize: stats.size,
          status: RESUME_STATUS.UPLOADED,
        });

        await queueHandler.queueOCRJob({
          resumeId,
          filePath: file.filePath,
          fileName: file.filename,
          mimeType: file.mimetype,
        });

        results.push({ resumeId, fileName: file.filename, status: RESUME_STATUS.UPLOADED });
        logger.info('Resume uploaded and queued', { resumeId, fileName: file.filename });
      } catch (error) {
        logger.error('Error processing file', {
          fileName: file.filename,
          error: getErrorMessage(error),
        });
        await fs.unlink(file.filePath).catch(() => {});
        results.push({
          fileName: file.filename,
          status: RESUME_STATUS.FAILED,
          error: getErrorMessage(error),
        });
      }
    }

    return { results, anyFileAccepted };
  }

  async getUploadStatus(resumeId: string): Promise<ResumeRecord | null> {
    return dbService.getResume(resumeId);
  }

  async deleteResume(resumeId: string): Promise<DeleteResumeOutcome> {
    const resume = await dbService.getResume(resumeId);
    if (!resume) return 'not_found';

    await fs.unlink(resume.file_path).catch(() => {
      logger.warn('File not found regarding resume record', {
        resumeId,
        filePath: resume.file_path,
      });
    });
    await dbService.deleteResume(resumeId);

    logger.info('Resume deleted', { resumeId });
    return 'deleted';
  }

  async getResumeFile(resumeId: string): Promise<ResumeFileOutcome> {
    const resume = await dbService.getResume(resumeId);
    if (!resume) return { found: false, reason: 'resume_not_found' };

    try {
      await fs.access(resume.file_path);
    } catch {
      return { found: false, reason: 'file_missing' };
    }

    return {
      found: true,
      stream: createReadStream(resume.file_path),
      mimeType: resume.mime_type,
      fileName: resume.file_name,
    };
  }

  async queueMatcherJob(resumeId: string): Promise<void> {
    await queueHandler.queueMatcherJob(resumeId);
  }
}

export const uploadService = new UploadService();
