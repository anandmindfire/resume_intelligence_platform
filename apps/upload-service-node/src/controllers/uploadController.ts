import { FastifyRequest, FastifyReply } from 'fastify';
import { logger, getErrorMessage, getErrorStack } from '@resume-platform/logger';
import { uploadService, UPLOAD_CONCURRENCY_LIMIT } from '../services/uploadService';
import { createConcurrencyLimiter } from '../utils/concurrency';
import { buildContentDisposition } from '../utils/fileUtils';
import { MIME_TYPES } from '../validators/fileValidator';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Types a browser may render in place; everything else (DOCX) is always downloaded. */
const INLINE_MIME_TYPES = new Set<string>([MIME_TYPES.PDF, MIME_TYPES.PNG, MIME_TYPES.JPEG]);

/** Multipart limit errors raised by @fastify/multipart (too many files / parts / fields). */
const MULTIPART_LIMIT_CODES = new Set(['FST_FILES_LIMIT', 'FST_PARTS_LIMIT', 'FST_FIELDS_LIMIT']);

function isMultipartLimitError(error: unknown): boolean {
  return MULTIPART_LIMIT_CODES.has((error as { code?: string } | null)?.code ?? '');
}

/** Ids are UUIDs; reject anything else before it reaches the database (which would raise a 500). */
function isValidResumeId(resumeId: string | undefined): resumeId is string {
  return typeof resumeId === 'string' && UUID_RE.test(resumeId);
}

/** Limit concurrent uploads per process when UPLOAD_MAX_CONCURRENT is set; scale via replicas for more capacity. */
const uploadLimiter = createConcurrencyLimiter(UPLOAD_CONCURRENCY_LIMIT);

/** Handles single file multipart upload and queues downstream OCR processing. */
export async function uploadSingle(request: FastifyRequest, reply: FastifyReply) {
  await uploadLimiter.acquire();
  try {
    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: 'No file uploaded' });
    }

    const outcome = await uploadService.uploadSingleFile(data);
    if (!outcome.accepted) {
      return reply.status(outcome.statusCode).send({ error: outcome.error });
    }

    return reply.status(201).send({
      resumeId: outcome.resumeId,
      fileName: outcome.fileName,
      status: 'uploaded',
      message: 'Resume uploaded successfully and queued for processing',
    });
  } catch (error) {
    if (isMultipartLimitError(error)) {
      return reply.status(413).send({ error: 'Too many files or form fields in request' });
    }
    logger.error('Upload error', { error: getErrorMessage(error), stack: getErrorStack(error) });
    return reply.status(500).send({ error: 'Failed to upload resume' });
  } finally {
    uploadLimiter.release();
  }
}

/** Handles batch multipart uploads with independent per-file validation and ingestion. */
export async function uploadMultiple(request: FastifyRequest, reply: FastifyReply) {
  await uploadLimiter.acquire();
  try {
    const { results, anyFileAccepted } = await uploadService.uploadMultipleFiles(request.parts());

    if (!anyFileAccepted) {
      // No file passed the type/size checks; still say why each one was rejected.
      return reply.status(400).send({ error: 'No files uploaded', results });
    }

    const successCount = results.filter((r) => r.status === 'uploaded').length;
    return reply.status(201).send({
      total: results.length,
      success: successCount,
      failed: results.length - successCount,
      results,
    });
  } catch (error) {
    if (isMultipartLimitError(error)) {
      return reply.status(413).send({ error: 'Too many files or form fields in request' });
    }
    logger.error('Batch upload error', { error: getErrorMessage(error) });
    return reply.status(500).send({ error: 'Failed to process uploads' });
  } finally {
    uploadLimiter.release();
  }
}

/** Returns the processing pipeline status of an uploaded resume. */
export async function getUploadStatus(
  request: FastifyRequest<{ Params: { resumeId: string } }>,
  reply: FastifyReply
) {
  try {
    const { resumeId } = request.params;
    if (!isValidResumeId(resumeId)) {
      return reply.status(404).send({ error: 'Resume not found' });
    }
    const resume = await uploadService.getUploadStatus(resumeId);

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

/** Deletes a resume record and removes its uploaded file from disk. */
export async function deleteResume(
  request: FastifyRequest<{ Params: { resumeId: string } }>,
  reply: FastifyReply
) {
  try {
    const { resumeId } = request.params;
    if (!isValidResumeId(resumeId)) {
      return reply.status(404).send({ error: 'Resume not found' });
    }
    const outcome = await uploadService.deleteResume(resumeId);

    if (outcome === 'not_found') {
      return reply.status(404).send({ error: 'Resume not found' });
    }

    return reply.send({ success: true, message: 'Resume deleted successfully' });
  } catch (error) {
    logger.error('Error deleting resume', { error: getErrorMessage(error) });
    return reply.status(500).send({ error: 'Failed to delete resume' });
  }
}

/** Streams the stored raw file for download or inline browser viewing. */
export async function getResumeFile(
  request: FastifyRequest<{ Params: { resumeId: string } }>,
  reply: FastifyReply
) {
  try {
    const { resumeId } = request.params;
    if (!isValidResumeId(resumeId)) {
      return reply.status(404).send({ error: 'Resume not found' });
    }
    const outcome = await uploadService.getResumeFile(resumeId);

    if (!outcome.found) {
      const message =
        outcome.reason === 'resume_not_found' ? 'Resume not found' : 'File not found on server';
      return reply.status(404).send({ error: message });
    }

    const inline = INLINE_MIME_TYPES.has(outcome.mimeType);
    reply.header('Content-Type', inline ? outcome.mimeType : 'application/octet-stream');
    reply.header(
      'Content-Disposition',
      buildContentDisposition(inline ? 'inline' : 'attachment', outcome.fileName)
    );
    // User-supplied content: never sniff it, never let it run script or be framed by another site.
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Cache-Control', 'private, no-store');
    if (outcome.mimeType !== MIME_TYPES.PDF) {
      // A sandbox CSP would stop browsers' built-in PDF viewers, so PDFs rely on verified type + nosniff.
      reply.header('Content-Security-Policy', "default-src 'none'; img-src 'self'; sandbox");
    }
    return reply.send(outcome.stream);
  } catch (error) {
    logger.error('Error serving file', { error: getErrorMessage(error) });
    return reply.status(500).send({ error: 'Failed to serve file' });
  }
}

export async function queueMatcherJob(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { resumeId } = (request.body ?? {}) as { resumeId?: string };

    if (!resumeId) {
      return reply.status(400).send({ error: 'resumeId is required' });
    }
    if (!isValidResumeId(resumeId)) {
      return reply.status(400).send({ error: 'resumeId must be a UUID' });
    }

    await uploadService.queueMatcherJob(resumeId);

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
