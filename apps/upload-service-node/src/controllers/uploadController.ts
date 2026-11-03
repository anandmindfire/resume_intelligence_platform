import { FastifyRequest, FastifyReply } from 'fastify';
import { logger, getErrorMessage, getErrorStack } from '@resume-platform/logger';
import { uploadService, UPLOAD_CONCURRENCY_LIMIT } from '../services/uploadService';
import { createConcurrencyLimiter } from '../utils/concurrency';

/** Limit concurrent uploads per process when UPLOAD_MAX_CONCURRENT is set; scale via replicas for more capacity. */
const uploadLimiter = createConcurrencyLimiter(UPLOAD_CONCURRENCY_LIMIT);

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
    logger.error('Upload error', { error: getErrorMessage(error), stack: getErrorStack(error) });
    return reply.status(500).send({ error: 'Failed to upload resume' });
  } finally {
    uploadLimiter.release();
  }
}

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

export async function deleteResume(
  request: FastifyRequest<{ Params: { resumeId: string } }>,
  reply: FastifyReply
) {
  try {
    const { resumeId } = request.params;
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

export async function getResumeFile(
  request: FastifyRequest<{ Params: { resumeId: string } }>,
  reply: FastifyReply
) {
  try {
    const { resumeId } = request.params;
    const outcome = await uploadService.getResumeFile(resumeId);

    if (!outcome.found) {
      const message =
        outcome.reason === 'resume_not_found' ? 'Resume not found' : 'File not found on server';
      return reply.status(404).send({ error: message });
    }

    reply.header('Content-Type', outcome.mimeType);
    reply.header('Content-Disposition', `inline; filename="${outcome.fileName}"`);
    return reply.send(outcome.stream);
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
