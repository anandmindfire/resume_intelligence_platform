import { FastifyInstance } from 'fastify';
import * as uploadController from '../controllers/uploadController';
import {
  uploadSingleSchema,
  uploadMultipleSchema,
  getUploadStatusSchema,
  deleteResumeSchema,
  getResumeFileSchema,
  queueMatcherJobSchema,
} from '../schemas/upload.schemas';

const API_V1_PREFIX = '/api/v1';

export async function registerUploadRoutes(app: FastifyInstance) {
  const uploadPrefix = `${API_V1_PREFIX}/upload`;

  app.post(`${uploadPrefix}/single`, { schema: uploadSingleSchema }, uploadController.uploadSingle);
  app.post(`${uploadPrefix}/multiple`, { schema: uploadMultipleSchema }, uploadController.uploadMultiple);
  app.get(`${uploadPrefix}/:resumeId/status`, { schema: getUploadStatusSchema }, uploadController.getUploadStatus);
  app.delete(`${uploadPrefix}/resumes/:resumeId`, { schema: deleteResumeSchema }, uploadController.deleteResume);
  app.get(`${uploadPrefix}/resumes/:resumeId/file`, { schema: getResumeFileSchema }, uploadController.getResumeFile);

  // Internal endpoint for parser worker (no version prefix for backward compatibility)
  app.post('/api/internal/queue/matcher', { schema: queueMatcherJobSchema }, uploadController.queueMatcherJob);
}
