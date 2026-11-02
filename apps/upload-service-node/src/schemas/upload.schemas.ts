/** OpenAPI route schemas for the upload service (documentation only; see app.ts). */

const errorResponse = {
  type: 'object',
  properties: {
    error: { type: 'string', example: 'Resume not found' },
    message: { type: 'string', description: 'Error detail (development only)' },
  },
  required: ['error'],
} as const;

const resumeIdParams = {
  type: 'object',
  properties: {
    resumeId: { type: 'string', format: 'uuid', description: 'Resume ID returned by the upload endpoints' },
  },
  required: ['resumeId'],
} as const;

const uploadResult = {
  type: 'object',
  properties: {
    resumeId: { type: 'string', format: 'uuid', description: 'Present when the file was accepted' },
    fileName: { type: 'string', example: 'jane-doe.pdf' },
    status: { type: 'string', enum: ['uploaded', 'failed'] },
    error: { type: 'string', description: 'Why the file was rejected', example: 'File type text/plain not allowed' },
  },
  required: ['fileName', 'status'],
} as const;

const ALLOWED_TYPES_NOTE =
  'Allowed types are configured by UPLOAD_ALLOWED_TYPES (default: PDF, DOCX, JPEG, PNG); ' +
  'the maximum size by UPLOAD_MAX_SIZE (default 10 MB).';

export const uploadSingleSchema = {
  tags: ['Upload'],
  summary: 'Upload a single resume',
  description: `Stores the first file in the multipart body, creates a resume record and queues it for OCR. ${ALLOWED_TYPES_NOTE}`,
  consumes: ['multipart/form-data'],
  body: {
    type: 'object',
    properties: {
      resume: { type: 'string', format: 'binary', description: 'Resume file' },
    },
    required: ['resume'],
  },
  response: {
    201: {
      description: 'Resume stored and queued for processing',
      type: 'object',
      properties: {
        resumeId: { type: 'string', format: 'uuid' },
        fileName: { type: 'string', example: 'jane-doe.pdf' },
        status: { type: 'string', enum: ['uploaded'] },
        message: { type: 'string', example: 'Resume uploaded successfully and queued for processing' },
      },
      required: ['resumeId', 'fileName', 'status', 'message'],
    },
    400: { description: 'No file, disallowed file type, or file too large', ...errorResponse },
    500: { description: 'Storage, database or queue failure', ...errorResponse },
  },
};

export const uploadMultipleSchema = {
  tags: ['Upload'],
  summary: 'Upload multiple resumes',
  description:
    'Stores every file in the multipart body. Each file is validated independently; rejected files are reported ' +
    `in \`results\` without failing the whole request. ${ALLOWED_TYPES_NOTE}`,
  consumes: ['multipart/form-data'],
  body: {
    type: 'object',
    properties: {
      resumes: {
        type: 'array',
        items: { type: 'string', format: 'binary' },
        description: 'Resume files (repeat the field once per file)',
      },
    },
    required: ['resumes'],
  },
  response: {
    201: {
      description: 'Per-file results',
      type: 'object',
      properties: {
        total: { type: 'integer', example: 3 },
        success: { type: 'integer', example: 2 },
        failed: { type: 'integer', example: 1 },
        results: { type: 'array', items: uploadResult },
      },
      required: ['total', 'success', 'failed', 'results'],
    },
    400: { description: 'No acceptable files in the request', ...errorResponse },
    500: { description: 'Unexpected failure reading the multipart stream', ...errorResponse },
  },
};

export const getUploadStatusSchema = {
  tags: ['Upload'],
  summary: 'Get processing status of a resume',
  params: resumeIdParams,
  response: {
    200: {
      description: 'Current status',
      type: 'object',
      properties: {
        resumeId: { type: 'string', format: 'uuid' },
        status: {
          type: 'string',
          enum: ['uploaded', 'processing', 'parsed', 'matched', 'failed'],
          example: 'processing',
        },
        fileName: { type: 'string' },
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
    404: { description: 'Resume not found', ...errorResponse },
    500: { description: 'Database failure', ...errorResponse },
  },
};

export const deleteResumeSchema = {
  tags: ['Upload'],
  summary: 'Delete a resume',
  description: 'Deletes the stored file (if it still exists) and the resume record, including its matches.',
  params: resumeIdParams,
  response: {
    200: {
      description: 'Resume deleted',
      type: 'object',
      properties: {
        success: { type: 'boolean', enum: [true] },
        message: { type: 'string', example: 'Resume deleted successfully' },
      },
    },
    404: { description: 'Resume not found', ...errorResponse },
    500: { description: 'Database failure', ...errorResponse },
  },
};

export const getResumeFileSchema = {
  tags: ['Upload'],
  summary: 'Download the original resume file',
  description: 'Streams the stored file inline with its original MIME type and file name.',
  params: resumeIdParams,
  response: {
    200: {
      description: 'The original file',
      content: {
        'application/pdf': { schema: { type: 'string', format: 'binary' } },
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
          schema: { type: 'string', format: 'binary' },
        },
        'image/jpeg': { schema: { type: 'string', format: 'binary' } },
        'image/png': { schema: { type: 'string', format: 'binary' } },
      },
    },
    404: { description: 'Resume record or stored file not found', ...errorResponse },
    500: { description: 'Failed to read the file', ...errorResponse },
  },
};

export const queueMatcherJobSchema = {
  tags: ['Internal'],
  summary: 'Queue a resume for role matching',
  description: 'Called by the parser worker once a resume has been parsed.',
  body: {
    type: 'object',
    properties: {
      resumeId: { type: 'string', format: 'uuid' },
    },
    required: ['resumeId'],
  },
  response: {
    200: {
      description: 'Job queued',
      type: 'object',
      properties: {
        success: { type: 'boolean', enum: [true] },
        message: { type: 'string', example: 'Matcher job queued' },
        resumeId: { type: 'string', format: 'uuid' },
      },
    },
    400: { description: 'resumeId missing', ...errorResponse },
    500: { description: 'Queue failure', ...errorResponse },
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
        service: { type: 'string', example: 'upload-service' },
        timestamp: { type: 'string', format: 'date-time' },
      },
    },
  },
};
