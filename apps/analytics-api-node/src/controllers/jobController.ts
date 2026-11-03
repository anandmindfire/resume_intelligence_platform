import { FastifyRequest, FastifyReply } from 'fastify';
import { getErrorMessage } from '@resume-platform/logger';
import { jobService } from '../services/jobService';
import { MOCK_JOBS } from '../data/mockJobs';

export async function getAllJobs(request: FastifyRequest, reply: FastifyReply) {
  try {
    const jobs = await jobService.getAllJobs();
    return jobs;
  } catch (error) {
    return reply.status(500).send({ error: getErrorMessage(error) });
  }
}

export async function getJobsWithMatches(request: FastifyRequest, reply: FastifyReply) {
  try {
    const jobs = await jobService.getAllJobsWithMatches();
    return jobs;
  } catch (error) {
    return reply.status(500).send({ error: getErrorMessage(error) });
  }
}

export async function getJobById(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  try {
    const job = await jobService.getJobById(request.params.id);
    if (!job) {
      return reply.status(404).send({ error: 'Job not found' });
    }
    return job;
  } catch (error) {
    return reply.status(500).send({ error: getErrorMessage(error) });
  }
}

export async function getJobMatches(
  request: FastifyRequest<{
    Params: { id: string };
    Querystring: { minScore?: string };
  }>,
  reply: FastifyReply
) {
  try {
    const minScore = request.query.minScore ? parseFloat(request.query.minScore) : 0;
    const matchDetail = await jobService.getJobMatches(request.params.id, minScore);
    if (!matchDetail) {
      return reply.status(404).send({ error: 'Job not found' });
    }
    return matchDetail;
  } catch (error) {
    return reply.status(500).send({ error: getErrorMessage(error) });
  }
}

export async function seedJobs(request: FastifyRequest, reply: FastifyReply) {
  try {
    const seededJobs = await jobService.seedJobs(MOCK_JOBS);
    return {
      message: 'Jobs seeded successfully',
      count: seededJobs.length,
      jobs: seededJobs,
    };
  } catch (error) {
    return reply.status(500).send({ error: getErrorMessage(error) });
  }
}

export async function createJob(
  request: FastifyRequest<{
    Body: {
      title: string;
      requiredSkills?: string[];
      preferredSkills?: string[];
      requiredExperience?: number;
      keywords?: string[];
      location?: string;
      description?: string;
    };
  }>,
  reply: FastifyReply
) {
  try {
    const job = await jobService.createJob(request.body);
    return reply.status(201).send(job);
  } catch (error) {
    return reply.status(500).send({ error: getErrorMessage(error) });
  }
}
