import { FastifyInstance } from 'fastify';
import * as jobController from '../controllers/jobController';
import {
  getAllJobsSchema,
  getJobsWithMatchesSchema,
  getJobByIdSchema,
  getJobMatchesSchema,
  seedJobsSchema,
  createJobSchema,
} from '../schemas/job.schemas';

export async function registerJobRoutes(app: FastifyInstance, prefix: string = '/api/v1') {
  app.get(`${prefix}/jobs`, { schema: getAllJobsSchema }, jobController.getAllJobs);
  app.get(`${prefix}/jobs/with-matches`, { schema: getJobsWithMatchesSchema }, jobController.getJobsWithMatches);
  app.get(`${prefix}/jobs/:id`, { schema: getJobByIdSchema }, jobController.getJobById);
  app.get(`${prefix}/jobs/:id/matches`, { schema: getJobMatchesSchema }, jobController.getJobMatches);
  app.post(`${prefix}/jobs/seed`, { schema: seedJobsSchema }, jobController.seedJobs);
  app.post(`${prefix}/jobs`, { schema: createJobSchema }, jobController.createJob);
}
