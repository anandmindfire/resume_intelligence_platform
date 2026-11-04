import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import { pipeline } from 'stream/promises';
import { createWriteStream, createReadStream, type ReadStream } from 'fs';
import type { Multipart, MultipartFile } from '@fastify/multipart';
import { config } from '@resume-platform/config';
import { logger, getErrorMessage } from '@resume-platform/logger';
import { fileTooLargeMessage, isAllowedMimeType, validateFile } from '../validators/fileValidator';
import { dbService } from './dbService';
import {
  generateStoredFileName,
  generateTempFileName,
  getUploadPath,
  resolveInsideUploads,
  sanitizeDisplayName,
} from '../utils/fileUtils';
import { queueHandler } from '../queues/queueHandler';
import { UPLOADS, RESUME_STATUS } from '../constants';
import type { ResumeRecord, UploadResult } from '../types';

const uploadsDir = config.upload.directory || UPLOADS.DEFAULT_DIR;
fs.mkdir(uploadsDir, { recursive: true, mode: 0o700 }).catch((err) => {
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
    // `wx`: never overwrite an existing file; 0600: only the service user can read the upload.
    await pipeline(file, createWriteStream(filePath, { flags: 'wx', mode: 0o600 }));
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

type FinalizeOutcome =
  | { ok: true; filePath: string; mimeType: string; fileSize: number }
  | { ok: false; error: string };

/**
 * Checks a fully received upload's content and moves it to its permanent name (UUID + extension of the
 * detected type). The detected MIME type, not the client's, is what gets persisted and sent to workers.
 */
async function finalizeUpload(
  tempPath: string,
  declaredMimeType: string
): Promise<FinalizeOutcome> {
  const validation = await validateFile(tempPath, declaredMimeType);
  if (!validation.valid || !validation.detected) {
    await fs.unlink(tempPath).catch(() => {});
    return { ok: false, error: validation.error ?? 'File validation failed' };
  }

  const filePath = getUploadPath(generateStoredFileName(validation.detected.extension));
  await fs.rename(tempPath, filePath);
  const stats = await fs.stat(filePath);
  return { ok: true, filePath, mimeType: validation.detected.mimeType, fileSize: stats.size };
}

/** Upload business logic: validation rules, disk storage, persistence and queueing. Framework-agnostic beyond the multipart types it reads. */
class UploadService {
  /** Validates, stores, persists and queues a single file. Expected rejections are returned, not thrown. */
  async uploadSingleFile(data: MultipartFile): Promise<SingleUploadOutcome> {
    const fileName = sanitizeDisplayName(data.filename);
    if (!isAllowedMimeType(data.mimetype)) {
      data.file.resume(); // discard the rejected file's bytes so the request can complete
      return { accepted: false, statusCode: 400, error: 'File type not allowed' };
    }

    const tempPath = getUploadPath(generateTempFileName());

    if (!(await storeUpload(data.file, tempPath))) {
      return {
        accepted: false,
        statusCode: 413,
        error: fileTooLargeMessage(config.upload.maxSize),
      };
    }

    const stored = await finalizeUpload(tempPath, data.mimetype);
    if (!stored.ok) {
      return { accepted: false, statusCode: 400, error: stored.error };
    }

    const resumeId = uuidv4();
    try {
      await dbService.createResume({
        id: resumeId,
        fileName,
        filePath: stored.filePath,
        mimeType: stored.mimeType,
        fileSize: stored.fileSize,
        status: RESUME_STATUS.UPLOADED,
      });
    } catch (error) {
      await fs.unlink(stored.filePath).catch(() => {});
      throw error;
    }

    await queueHandler.queueOCRJob({
      resumeId,
      filePath: stored.filePath,
      fileName,
      mimeType: stored.mimeType,
    });

    logger.info('Resume uploaded and queued for processing', { resumeId });

    return { accepted: true, resumeId, fileName };
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
    const files: Array<{ fileName: string; declaredMimeType: string; tempPath: string }> = [];

    try {
      for await (const part of parts) {
        if (part.type !== 'file') continue;
        const fileName = sanitizeDisplayName(part.filename);

        if (!isAllowedMimeType(part.mimetype)) {
          // The parser only advances to the next part once this one is fully read.
          part.file.resume();
          results.push({ fileName, status: RESUME_STATUS.FAILED, error: 'File type not allowed' });
          continue;
        }

        const tempPath = getUploadPath(generateTempFileName());
        if (!(await storeUpload(part.file, tempPath))) {
          results.push({
            fileName,
            status: RESUME_STATUS.FAILED,
            error: fileTooLargeMessage(config.upload.maxSize),
          });
          continue;
        }
        files.push({ fileName, declaredMimeType: part.mimetype, tempPath });
      }
    } catch (error) {
      // Parsing aborted (client disconnect, parts limit...): don't leave stored-but-unrecorded files behind.
      await Promise.all(files.map((file) => fs.unlink(file.tempPath).catch(() => {})));
      throw error;
    }

    const anyFileAccepted = files.length > 0;

    for (const file of files) {
      let storedPath: string | undefined;
      try {
        const stored = await finalizeUpload(file.tempPath, file.declaredMimeType);
        if (!stored.ok) {
          results.push({
            fileName: file.fileName,
            status: RESUME_STATUS.FAILED,
            error: stored.error,
          });
          continue;
        }
        storedPath = stored.filePath;

        const resumeId = uuidv4();
        await dbService.createResume({
          id: resumeId,
          fileName: file.fileName,
          filePath: stored.filePath,
          mimeType: stored.mimeType,
          fileSize: stored.fileSize,
          status: RESUME_STATUS.UPLOADED,
        });

        await queueHandler.queueOCRJob({
          resumeId,
          filePath: stored.filePath,
          fileName: file.fileName,
          mimeType: stored.mimeType,
        });

        results.push({ resumeId, fileName: file.fileName, status: RESUME_STATUS.UPLOADED });
        logger.info('Resume uploaded and queued', { resumeId });
      } catch (error) {
        logger.error('Error processing file', { error: getErrorMessage(error) });
        await fs.unlink(storedPath ?? file.tempPath).catch(() => {});
        // Internal error details (paths, SQL, Redis) are logged above, never returned to the client.
        results.push({
          fileName: file.fileName,
          status: RESUME_STATUS.FAILED,
          error: 'Failed to process file',
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

    const filePath = resolveInsideUploads(resume.file_path);
    if (!filePath) {
      logger.warn('Refusing to delete a file outside the uploads directory', { resumeId });
    } else {
      await fs.unlink(filePath).catch(() => {
        logger.warn('File not found regarding resume record', { resumeId });
      });
    }
    await dbService.deleteResume(resumeId);

    logger.info('Resume deleted', { resumeId });
    return 'deleted';
  }

  async getResumeFile(resumeId: string): Promise<ResumeFileOutcome> {
    const resume = await dbService.getResume(resumeId);
    if (!resume) return { found: false, reason: 'resume_not_found' };

    const filePath = resolveInsideUploads(resume.file_path);
    if (!filePath) {
      logger.warn('Refusing to serve a file outside the uploads directory', { resumeId });
      return { found: false, reason: 'file_missing' };
    }

    try {
      await fs.access(filePath);
    } catch {
      return { found: false, reason: 'file_missing' };
    }

    return {
      found: true,
      stream: createReadStream(filePath),
      mimeType: resume.mime_type,
      fileName: resume.file_name,
    };
  }

  async queueMatcherJob(resumeId: string): Promise<void> {
    await queueHandler.queueMatcherJob(resumeId);
  }
}

export const uploadService = new UploadService();
