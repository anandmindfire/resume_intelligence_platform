/** OpenAPI route schemas for job role endpoints (documentation only; see app.ts). */
import { errorRef, jobRoleRef } from './models.schemas';

const serverError = { description: 'Database failure', ...errorRef };

const jobIdParams = {
  type: 'object',
  properties: { id: { type: 'string', format: 'uuid', description: 'Job role ID' } },
  required: ['id'],
} as const;

/** Same 0-100 scale as the match scores returned by /matches. */
const SCORE_NOTE = 'Match score on a 0-100 scale, rounded to two decimals (e.g. 82.5).';

export const getAllJobsSchema = {
  tags: ['Jobs'],
  summary: 'List job roles',
  response: {
    200: { description: 'Job roles, newest first', type: 'array', items: jobRoleRef },
    500: serverError,
  },
};

export const getJobsWithMatchesSchema = {
  tags: ['Jobs'],
  summary: 'List job roles with match statistics',
  response: {
    200: {
      description: 'Job roles with match counts',
      type: 'array',
      items: {
        allOf: [
          jobRoleRef,
          {
            type: 'object',
            properties: {
              matchCount: { type: 'integer', example: 14 },
              avgMatchScore: { type: 'number', description: SCORE_NOTE, example: 64.21 },
            },
          },
        ],
      },
    },
    500: serverError,
  },
};

export const getJobByIdSchema = {
  tags: ['Jobs'],
  summary: 'Get a job role',
  params: jobIdParams,
  response: {
    200: { description: 'The job role', ...jobRoleRef },
    404: { description: 'Job not found', ...errorRef },
    500: serverError,
  },
};

export const getJobMatchesSchema = {
  tags: ['Jobs'],
  summary: 'Match details for a job role',
  description: 'Aggregated skills coverage and the resumes matched to this role.',
  params: jobIdParams,
  querystring: {
    type: 'object',
    properties: {
      minScore: { type: 'number', minimum: 0, default: 0, description: 'Minimum match score 0-100' },
    },
  },
  response: {
    200: {
      description: 'Match details',
      type: 'object',
      properties: {
        jobId: { type: 'string', format: 'uuid' },
        jobTitle: { type: 'string' },
        matchScore: { type: 'number', description: `Average across matches. ${SCORE_NOTE}` },
        skillsMatched: { type: 'array', items: { type: 'string' }, description: 'Union of skills matched by any resume' },
        skillsMissing: { type: 'array', items: { type: 'string' }, description: 'Union of required skills missing from any resume' },
        experienceMatch: { type: 'boolean', description: 'At least one resume meets the experience requirement' },
        locationMatch: { type: 'boolean', description: 'Not implemented yet; always false' },
        requirementsMet: { type: 'integer', description: 'Required skills covered by some resume, plus 1 if experience is met' },
        requirementsTotal: { type: 'integer', description: 'Number of required skills plus 1 for experience' },
        matchedResumes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              resumeId: { type: 'string', format: 'uuid' },
              resumeName: { type: 'string', description: 'Candidate name, else file name, else "Unknown"' },
              matchScore: { type: 'number', description: SCORE_NOTE },
              skillsMatched: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
    },
    404: { description: 'Job not found', ...errorRef },
    500: serverError,
  },
};

export const seedJobsSchema = {
  tags: ['Jobs'],
  summary: 'Seed sample job roles',
  description: 'Creates the built-in sample job roles. Idempotent: roles whose title already exists are returned as-is.',
  response: {
    200: {
      description: 'Seeded roles',
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Jobs seeded successfully' },
        count: { type: 'integer', example: 10 },
        jobs: { type: 'array', items: jobRoleRef },
      },
    },
    500: serverError,
  },
};

export const createJobSchema = {
  tags: ['Jobs'],
  summary: 'Create a job role',
  body: {
    type: 'object',
    properties: {
      title: { type: 'string', example: 'Data Engineer' },
      requiredSkills: { type: 'array', items: { type: 'string' }, example: ['Python', 'SQL', 'Airflow'] },
      preferredSkills: { type: 'array', items: { type: 'string' }, example: ['Spark'] },
      requiredExperience: { type: 'integer', minimum: 0, description: 'Minimum years', example: 3 },
      keywords: { type: 'array', items: { type: 'string' }, example: ['etl', 'pipelines'] },
      location: { type: 'string', example: 'Remote' },
      description: { type: 'string' },
    },
    required: ['title'],
  },
  response: {
    201: { description: 'The created job role', ...jobRoleRef },
    500: serverError,
  },
};
