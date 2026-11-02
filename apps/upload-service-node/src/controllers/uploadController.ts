import { FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs/promises';
import { pipeline } from 'stream/promises';
import { createWriteStream, createReadStream } from 'fs';
import { config } from '@resume-platform/config';
import { logger } from '@resume-platform/logger';
import type { MultipartFile } from '@fastify/multipart';
import { fileTooLargeMessage, validateFile } from '../validators/fileValidator';
import { dbService } from '../services/dbService';
import { generateUniqueFileName, getUploadPath } from '../utils/fileUtils';
import { queueHandler } from '../queues/queueHandler';
import { createConcurrencyLimiter } from '../utils/concurrency';
import type { UploadResult } from '../types';
import { UPLOADS, RESUME_STATUS } from '../constants';
import { getErrorMessage, getErrorStack } from '../utils/errors';

const uploadsDir = config.upload.directory || UPLOADS.DEFAULT_DIR;
fs.mkdir(uploadsDir, { recursive: true }).catch(err => {
  logger.error('Failed to create uploads directory', { error: err.message });
});

/** Limit concurrent uploads per process when UPLOAD_MAX_CONCURRENT is set; scale via replicas for more capacity */
const uploadLimiter = createConcurrencyLimiter(config.upload.maxConcurrent ?? 0);

/**
 * Streams an upload to disk and reports whether it was stored.
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

export async function uploadSingle(request: FastifyRequest, reply: FastifyReply) {
  await uploadLimiter.acquire();
  try {
    const data = await request.file();

    if (!data) {
      return reply.status(400).send({ error: 'No file uploaded' });
    }

    if (!config.upload.allowedTypes.includes(data.mimetype)) {
      data.file.resume(); // discard the rejected file's bytes so the request can complete
      return reply.status(400).send({ error: `File type ${data.mimetype} not allowed` });
    }

    const uniqueName = generateUniqueFileName(data.filename);
    const filePath = getUploadPath(uniqueName);

    if (!(await storeUpload(data.file, filePath))) {
      return reply.status(413).send({ error: fileTooLargeMessage(config.upload.maxSize) });
    }
    const stats = await fs.stat(filePath);

    const validation = await validateFile(filePath);
    if (!validation.valid) {
      await fs.unlink(filePath).catch(() => {});
      return reply.status(400).send({ error: validation.error });
    }

    const resumeId = uuidv4();
    await dbService.createResume({
      id: resumeId,
      fileName: data.filename,
      filePath: filePath,
      mimeType: data.mimetype,
      fileSize: stats.size,
      status: RESUME_STATUS.UPLOADED,
    });

    await queueHandler.queueOCRJob({
      resumeId,
      filePath: filePath,
      fileName: data.filename,
      mimeType: data.mimetype,
    });

    logger.info('Resume uploaded and queued for processing', {
      resumeId,
      fileName: data.filename,
    });

    return reply.status(201).send({
      resumeId,
      fileName: data.filename,
      status: RESUME_STATUS.UPLOADED,
      message: 'Resume uploaded successfully and queued for processing',
    });
  } catch (error) {
    logger.error('Upload error', { error: getErrorMessage(error), stack: getErrorStack(error) });
    return reply.status(500).send({ error: 'Failed to upload resume' });
  } finally {
    uploadLimiter.release();
  }
}

export async function uploadMultiple(request: FastifyRequest, reply: FastifyReply) {
  await uploadLimiter.acquire();
  const results: UploadResult[] = [];
  const files: Array<{ filename: string; mimetype: string; filePath: string }> = [];
  try {
    const parts = request.parts();

    for await (const part of parts) {
      if (part.type === 'file') {
        const data = part;

        if (!config.upload.allowedTypes.includes(data.mimetype)) {
          // The parser only advances to the next part once this one is fully read.
          data.file.resume();
          results.push({
            fileName: data.filename,
            status: RESUME_STATUS.FAILED,
            error: `File type ${data.mimetype} not allowed`,
          });
          continue;
        }

        const uniqueName = `${uuidv4()}${path.extname(data.filename)}`;
        const filePath = path.join(uploadsDir, uniqueName);
        if (!(await storeUpload(data.file, filePath))) {
          results.push({
            fileName: data.filename,
            status: RESUME_STATUS.FAILED,
            error: fileTooLargeMessage(config.upload.maxSize),
          });
          continue;
        }
        files.push({
          filename: data.filename,
          mimetype: data.mimetype,
          filePath,
        });
      }
    }

    if (files.length === 0) {
      // Nothing was accepted; still say why each file was rejected.
      return reply.status(400).send({ error: 'No files uploaded', results });
    }

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

        results.push({
          resumeId,
          fileName: file.filename,
          status: RESUME_STATUS.UPLOADED,
        });

        logger.info('Resume uploaded and queued', {
          resumeId,
          fileName: file.filename,
        });
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

    const successCount = results.filter(r => r.status === RESUME_STATUS.UPLOADED).length;
    const failCount = results.length - successCount;

    return reply.status(201).send({
      total: results.length,
      success: successCount,
      failed: failCount,
      results,
    });
  } catch (error) {
    // Parsing aborted (client disconnect, parts limit...): don't leave stored-but-unrecorded files behind.
    await Promise.all(files.map((file) => fs.unlink(file.filePath).catch(() => {})));
    logger.error('Batch upload error', { error: getErrorMessage(error) });
    return reply.status(500).send({ error: 'Failed to process uploads' });
  } finally {
    uploadLimiter.release();
  }
}

export async function getUploadStatus(
  request: FastifyRequest<{ Params: { resumeId: string } }>,
  reply: FastifyReply
) {
  try {
    const { resumeId } = request.params;
    const resume = await dbService.getResume(resumeId);

    if (!resume) {
      return reply.status(404).send({ error: 'Resume not found' });
    }

    return reply.send({
      resumeId: resume.id,
      status: resume.status,
      fileName: resume.file_name,
      createdAt: resume.created_at,
    });
  } catch (error) {
    logger.error('Error fetching resume status', { error: getErrorMessage(error) });
    return reply.status(500).send({ error: 'Failed to fetch status' });
  }
}

export async function deleteResume(
  request: FastifyRequest<{ Params: { resumeId: string } }>,
  reply: FastifyReply
) {
  try {
    const { resumeId } = request.params;
    const resume = await dbService.getResume(resumeId);

    if (!resume) {
      return reply.status(404).send({ error: 'Resume not found' });
    }

    await fs.unlink(resume.file_path).catch(() => {
      logger.warn('File not found regarding resume record', {
        resumeId,
        filePath: resume.file_path,
      });
    });

    await dbService.deleteResume(resumeId);

    logger.info('Resume deleted', { resumeId });
    return reply.send({ success: true, message: 'Resume deleted successfully' });
  } catch (error) {
    logger.error('Error deleting resume', { error: getErrorMessage(error) });
    return reply.status(500).send({ error: 'Failed to delete resume' });
  }
}

export async function getResumeFile(
  request: FastifyRequest<{ Params: { resumeId: string } }>,
  reply: FastifyReply
) {
  try {
    const { resumeId } = request.params;
    const resume = await dbService.getResume(resumeId);

    if (!resume) {
      return reply.status(404).send({ error: 'Resume not found' });
    }

    try {
      await fs.access(resume.file_path);
    } catch {
      return reply.status(404).send({ error: 'File not found on server' });
    }

    reply.header('Content-Type', resume.mime_type);
    reply.header('Content-Disposition', `inline; filename="${resume.file_name}"`);

    return reply.send(createReadStream(resume.file_path));
  } catch (error) {
    logger.error('Error serving file', { error: getErrorMessage(error) });
    return reply.status(500).send({ error: 'Failed to serve file' });
  }
}

export async function queueMatcherJob(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { resumeId } = request.body as { resumeId: string };

    if (!resumeId) {
      return reply.status(400).send({ error: 'resumeId is required' });
    }

    await queueHandler.queueMatcherJob(resumeId);

    return reply.status(200).send({
      success: true,
      message: 'Matcher job queued',
      resumeId,
    });
  } catch (error) {
    logger.error('Error queueing matcher job', { error: getErrorMessage(error) });
    return reply.status(500).send({ error: 'Failed to queue matcher job' });
  }
}
