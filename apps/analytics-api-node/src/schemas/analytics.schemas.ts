/** OpenAPI route schemas for analytics and resume endpoints (documentation only; see app.ts). */
import { errorRef, resumeMatchRef, resumeRef, skillCountRef } from './models.schemas';

const serverError = { description: 'Database failure', ...errorRef };

const paginationQuery = {
  page: { type: 'integer', minimum: 1, default: 1, description: 'Page number (invalid values fall back to 1)' },
  limit: {
    type: 'integer',
    minimum: 1,
    maximum: 100,
    default: 10,
    description: 'Page size (invalid values fall back to 10, larger values are capped at 100)',
  },
} as const;

const minScoreQuery = {
  type: 'number',
  minimum: 0,
  maximum: 100,
  default: 0,
  description: 'Minimum match score 0-100 (invalid values fall back to 0)',
} as const;

const paginationMeta = {
  total: { type: 'integer', example: 57 },
  page: { type: 'integer', example: 1 },
  limit: { type: 'integer', example: 10 },
  totalPages: { type: 'integer', example: 6 },
} as const;

export const getDashboardSchema = {
  tags: ['Analytics'],
  summary: 'Dashboard summary',
  description: 'Resume totals, the top 10 skills and per-role match summary.',
  response: {
    200: {
      description: 'Dashboard summary',
      type: 'object',
      properties: {
        totalResumes: { type: 'integer', example: 120 },
        processedResumes: { type: 'integer', description: 'Resumes with status "matched"', example: 97 },
        topSkills: { type: 'array', items: skillCountRef },
        roleMatches: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              role_title: { type: 'string', example: 'Frontend Web Developer' },
              match_count: { type: 'string', description: 'COUNT(*) as string', example: '97' },
              avg_score: { type: 'string', description: 'Average score 0-100 (NUMERIC)', example: '64.21' },
            },
          },
        },
      },
    },
    500: serverError,
  },
};

export const getTopSkillsSchema = {
  tags: ['Analytics'],
  summary: 'Most common skills',
  querystring: {
    type: 'object',
    properties: {
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 100,
        default: 10,
        description: 'Number of skills (invalid values fall back to 10, capped at 100)',
      },
    },
  },
  response: {
    200: { description: 'Skills ordered by frequency', type: 'array', items: skillCountRef },
    500: serverError,
  },
};

export const getExperienceStatsSchema = {
  tags: ['Analytics'],
  summary: 'Years-of-experience statistics',
  description: 'Average, minimum and maximum total years of experience across parsed resumes (0 when no data).',
  response: {
    200: {
      description: 'Experience statistics',
      type: 'object',
      properties: {
        avg_years: { type: 'number', example: 4.7 },
        min_years: { type: 'number', example: 0.5 },
        max_years: { type: 'number', example: 15 },
      },
    },
    500: serverError,
  },
};

export const getEducationStatsSchema = {
  tags: ['Analytics'],
  summary: 'Most common institutions',
  description: 'Top 10 institutions across parsed resumes.',
  response: {
    200: {
      description: 'Institutions ordered by frequency',
      type: 'array',
      items: {
        type: 'object',
        properties: {
          institution: { type: 'string', example: 'Stanford University' },
          count: { type: 'integer', example: 12 },
        },
      },
    },
    500: serverError,
  },
};

export const getRoleMatchesSchema = {
  tags: ['Analytics'],
  summary: 'Resume-to-role matches',
  description: 'Paginated matches ordered by score, optionally filtered by role and minimum score.',
  querystring: {
    type: 'object',
    properties: {
      roleId: { type: 'string', format: 'uuid', description: 'Only matches for this job role' },
      minScore: minScoreQuery,
      ...paginationQuery,
    },
  },
  response: {
    200: {
      description: 'A page of matches',
      type: 'object',
      properties: {
        data: { type: 'array', items: resumeMatchRef },
        ...paginationMeta,
        uniqueRoles: {
          type: 'array',
          description: 'Roles that have at least one match at or above minScore (for filter dropdowns)',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              title: { type: 'string' },
            },
          },
        },
      },
    },
    500: serverError,
  },
};

export const getResumesSchema = {
  tags: ['Resumes'],
  summary: 'Search resumes',
  description: 'Paginated, sortable resume list with optional keyword, location, role and score filters.',
  querystring: {
    type: 'object',
    properties: {
      keyword: { type: 'string', maxLength: 100, description: 'Matches name or file name (case-insensitive)' },
      location: { type: 'string', maxLength: 100, description: 'Matches location (case-insensitive)' },
      roleId: { type: 'string', format: 'uuid', description: 'Only resumes matched to this role' },
      minScore: { ...minScoreQuery, description: 'Only resumes with a match at or above this score' },
      ...paginationQuery,
      sortBy: {
        type: 'string',
        enum: ['created_at', 'name', 'file_name', 'status'],
        default: 'created_at',
        description: 'Unknown values fall back to created_at',
      },
      sortOrder: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
    },
  },
  response: {
    200: {
      description: 'A page of resumes',
      type: 'object',
      properties: {
        data: { type: 'array', items: resumeRef },
        ...paginationMeta,
      },
    },
    500: serverError,
  },
};

export const getResumeByIdSchema = {
  tags: ['Resumes'],
  summary: 'Get a resume',
  params: {
    type: 'object',
    properties: { id: { type: 'string', format: 'uuid' } },
    required: ['id'],
  },
  response: {
    200: { description: 'The resume', ...resumeRef },
    404: { description: 'Resume not found', ...errorRef },
    500: serverError,
  },
};

export const exportResumesCsvSchema = {
  tags: ['Resumes'],
  summary: 'Export resumes',
  description:
    'Returns resume rows (newest first, at most 1000) for client-side CSV generation. ' +
    'When resumeIds is given only those resumes are returned.',
  body: {
    type: 'object',
    nullable: true,
    properties: {
      resumeIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
    },
  },
  response: {
    200: { description: 'Resume rows', type: 'array', items: resumeRef },
    500: serverError,
  },
};

export const healthSchema = {
  tags: ['Health'],
  summary: 'Liveness check',
  response: {
    200: {
      description: 'Service is up',
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        service: { type: 'string', example: 'analytics-api' },
        timestamp: { type: 'string', format: 'date-time' },
      },
    },
  },
};
