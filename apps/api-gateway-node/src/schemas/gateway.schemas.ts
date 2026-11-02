/** OpenAPI route schemas for the gateway's own routes (documentation only; see app.ts). */

const endpointsSchema = {
  type: 'object',
  description: 'Gateway path prefixes for each upstream API',
  properties: {
    upload: { type: 'string', example: '/api/upload' },
    analytics: { type: 'string', example: '/api/analytics' },
    jobs: { type: 'string', example: '/api/jobs' },
    resumes: { type: 'string', example: '/api/resumes' },
  },
} as const;

export const healthSchema = {
  tags: ['Health'],
  summary: 'Gateway and upstream health',
  description:
    'Always 200 while the gateway is up; each upstream is probed at /health with a 5s timeout and reported ' +
    'as "healthy" or "unhealthy".',
  response: {
    200: {
      description: 'Health report',
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        timestamp: { type: 'string', format: 'date-time' },
        services: {
          type: 'object',
          properties: {
            upload: { type: 'string', enum: ['healthy', 'unhealthy'] },
            analytics: { type: 'string', enum: ['healthy', 'unhealthy'] },
          },
        },
      },
    },
  },
};

export const apiV1InfoSchema = {
  tags: ['Gateway'],
  summary: 'API information',
  response: {
    200: {
      description: 'API version and endpoint prefixes',
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Resume Intelligence Platform API' },
        version: { type: 'string', example: '1.0.0' },
        apiVersion: { type: 'string', example: 'v1' },
        endpoints: endpointsSchema,
      },
    },
  },
};

export const apiInfoSchema = {
  tags: ['Gateway'],
  summary: 'API information (legacy)',
  deprecated: true,
  description: 'Kept for backward compatibility; prefer GET /api/v1.',
  response: {
    200: {
      description: 'Gateway version and endpoint prefixes',
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Resume Intelligence Platform API Gateway' },
        version: { type: 'string', example: '1.0.0' },
        endpoints: endpointsSchema,
      },
    },
  },
};
