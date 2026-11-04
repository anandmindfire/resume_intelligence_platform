/**
 * Shared OpenAPI models, registered with app.addSchema and referenced by $id.
 *
 * Postgres BIGINT, NUMERIC and COUNT(*) values are returned by `pg` as strings and passed
 * through unchanged, so those fields are documented as strings.
 */

export const ErrorResponseSchema = {
  $id: 'ErrorResponse',
  type: 'object',
  properties: {
    error: { type: 'string', example: 'Resume not found' },
    message: { type: 'string', description: 'Error detail (development only)' },
    statusCode: { type: 'integer' },
  },
  required: ['error'],
} as const;

export const ResumeSchema = {
  $id: 'Resume',
  type: 'object',
  description:
    'A resume row as stored in Postgres (parsed fields are null until parsing completes).',
  properties: {
    id: { type: 'string', format: 'uuid' },
    file_name: { type: 'string', example: 'jane-doe.pdf' },
    mime_type: { type: 'string', example: 'application/pdf' },
    file_size: { type: 'string', description: 'Size in bytes (BIGINT)', example: '48213' },
    status: { type: 'string', enum: ['uploaded', 'processing', 'parsed', 'matched', 'failed'] },
    name: { type: 'string', nullable: true, example: 'Jane Doe' },
    email: { type: 'string', nullable: true, example: 'jane@example.com' },
    phone: { type: 'string', nullable: true, example: '+14155552671' },
    location: { type: 'string', nullable: true, example: 'Bangalore' },
    skills: {
      type: 'array',
      items: { type: 'string' },
      nullable: true,
      example: ['python', 'docker'],
    },
    experience: {
      type: 'array',
      nullable: true,
      items: { type: 'object', additionalProperties: true },
      description: 'Experience entries extracted by the parser worker',
    },
    education: {
      type: 'array',
      nullable: true,
      items: { type: 'object', additionalProperties: true },
      description: 'Education entries extracted by the parser worker',
    },
    parsed_data: { type: 'object', nullable: true, additionalProperties: true },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time', nullable: true },
  },
} as const;

export const ResumeMatchSchema = {
  $id: 'ResumeMatch',
  type: 'object',
  description: 'A resume-to-role match joined with resume and role details.',
  properties: {
    id: { type: 'string', format: 'uuid' },
    resume_id: { type: 'string', format: 'uuid' },
    role_id: { type: 'string', format: 'uuid' },
    match_score: { type: 'string', description: 'Overall score 0-100 (NUMERIC)', example: '82.50' },
    matched_skills: { type: 'array', items: { type: 'string' } },
    missing_skills: { type: 'array', items: { type: 'string' } },
    experience_match: { type: 'boolean' },
    skill_score: { type: 'string', example: '90.00' },
    keyword_score: { type: 'string', example: '60.00' },
    experience_score: { type: 'string', example: '75.00' },
    created_at: { type: 'string', format: 'date-time' },
    file_name: { type: 'string' },
    name: { type: 'string', nullable: true },
    email: { type: 'string', nullable: true },
    role_title: { type: 'string', example: 'Backend Engineer (Node.js)' },
  },
} as const;

export const JobRoleSchema = {
  $id: 'JobRole',
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    title: { type: 'string', example: 'Backend Engineer (Node.js)' },
    requiredSkills: {
      type: 'array',
      items: { type: 'string' },
      example: ['Node.js', 'PostgreSQL'],
    },
    preferredSkills: { type: 'array', items: { type: 'string' } },
    requiredExperience: {
      type: 'integer',
      nullable: true,
      description: 'Minimum years',
      example: 3,
    },
    keywords: { type: 'array', items: { type: 'string' } },
    location: { type: 'string', nullable: true, example: 'Remote' },
    description: { type: 'string', nullable: true },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
} as const;

export const SkillCountSchema = {
  $id: 'SkillCount',
  type: 'object',
  properties: {
    skill: { type: 'string', example: 'python' },
    count: { type: 'integer', example: 42 },
  },
} as const;

export const sharedSchemas = [
  ErrorResponseSchema,
  ResumeSchema,
  ResumeMatchSchema,
  JobRoleSchema,
  SkillCountSchema,
];

export const errorRef = { $ref: 'ErrorResponse#' } as const;
export const resumeRef = { $ref: 'Resume#' } as const;
export const resumeMatchRef = { $ref: 'ResumeMatch#' } as const;
export const jobRoleRef = { $ref: 'JobRole#' } as const;
export const skillCountRef = { $ref: 'SkillCount#' } as const;
