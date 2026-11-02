import { FastifyInstance } from 'fastify';
import * as analyticsController from '../controllers/analyticsController';
import {
  getDashboardSchema,
  getTopSkillsSchema,
  getExperienceStatsSchema,
  getEducationStatsSchema,
  getRoleMatchesSchema,
  getResumesSchema,
  getResumeByIdSchema,
  exportResumesCsvSchema,
} from '../schemas/analytics.schemas';

export async function registerAnalyticsRoutes(app: FastifyInstance, prefix: string = '/api/v1') {
  app.get(`${prefix}/dashboard`, { schema: getDashboardSchema }, analyticsController.getDashboard);
  app.get(`${prefix}/skills/top`, { schema: getTopSkillsSchema }, analyticsController.getTopSkills);
  app.get(`${prefix}/experience/stats`, { schema: getExperienceStatsSchema }, analyticsController.getExperienceStats);
  app.get(`${prefix}/education/stats`, { schema: getEducationStatsSchema }, analyticsController.getEducationStats);
  app.get(`${prefix}/matches`, { schema: getRoleMatchesSchema }, analyticsController.getRoleMatches);
  app.get(`${prefix}/resumes`, { schema: getResumesSchema }, analyticsController.getResumes);
  app.get(`${prefix}/resumes/:id`, { schema: getResumeByIdSchema }, analyticsController.getResumeById);
  app.post(`${prefix}/export/csv`, { schema: exportResumesCsvSchema }, analyticsController.exportResumesCsv);
}
