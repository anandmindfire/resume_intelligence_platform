import * as dotenv from 'dotenv';

dotenv.config();

export interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  poolMax?: number;
}

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
}

export interface QueueConfig {
  redis: RedisConfig;
  concurrency: number;
  attempts: number;
  backoffDelay: number;
}

export interface UploadConfig {
  maxSize: number;
  allowedTypes: string[];
  directory?: string;
  /** Max concurrent upload requests per process (0 = no limit). Used to avoid OOM under burst. */
  maxConcurrent?: number;
}

export const config = {
  database: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    user: process.env.POSTGRES_USER || 'resume_user',
    password: process.env.POSTGRES_PASSWORD || 'resume_password',
    database: process.env.POSTGRES_DB || 'resume_db',
    poolMax: parseInt(process.env.DB_POOL_MAX || '20', 10),
  } as DatabaseConfig,

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
  } as RedisConfig,

  queue: {
    redis: {
      host: process.env.QUEUE_REDIS_HOST || process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.QUEUE_REDIS_PORT || process.env.REDIS_PORT || '6379', 10),
      password: process.env.QUEUE_REDIS_PASSWORD || process.env.REDIS_PASSWORD,
    },
    concurrency: parseInt(process.env.QUEUE_CONCURRENCY || '5', 10),
    attempts: parseInt(process.env.QUEUE_ATTEMPTS || '3', 10),
    backoffDelay: parseInt(process.env.QUEUE_BACKOFF_DELAY || '5000', 10),
  } as QueueConfig,

  upload: {
    maxSize: parseInt(process.env.UPLOAD_MAX_SIZE || '10485760', 10), // 10MB default
    allowedTypes: (process.env.UPLOAD_ALLOWED_TYPES || 'application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png').split(','),
    directory: process.env.UPLOAD_DIRECTORY || '/app/uploads',
    maxConcurrent: parseInt(process.env.UPLOAD_MAX_CONCURRENT || '0', 10), // 0 = no limit; set per-replica under burst (e.g. 50)
  } as UploadConfig,

  apiGateway: {
    port: parseInt(process.env.API_GATEWAY_PORT || '3000', 10),
    host: process.env.API_GATEWAY_HOST || '0.0.0.0',
  },

  uploadService: {
    port: parseInt(process.env.UPLOAD_SERVICE_PORT || '3001', 10),
    url: process.env.UPLOAD_SERVICE_URL || 'http://localhost:3001',
  },

  analyticsApi: {
    port: parseInt(process.env.ANALYTICS_API_PORT || '3002', 10),
    url: process.env.ANALYTICS_API_URL || 'http://localhost:3002',
  },

  apiDocs: {
    /** Serve Swagger UI at /docs and the OpenAPI spec at /docs/json (set API_DOCS_ENABLED=false to disable). */
    enabled: process.env.API_DOCS_ENABLED !== 'false',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'your-secret-key',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },

  ocr: {
    concurrency: parseInt(process.env.OCR_WORKER_CONCURRENCY || '3', 10),
    tesseractLang: process.env.TESSERACT_LANG || 'eng',
  },

  parser: {
    concurrency: parseInt(process.env.PARSER_WORKER_CONCURRENCY || '3', 10),
  },

  matcher: {
    concurrency: parseInt(process.env.MATCHER_WORKER_CONCURRENCY || '5', 10),
  },

  insights: {
    concurrency: parseInt(process.env.INSIGHTS_WORKER_CONCURRENCY || '2', 10),
  },
};

export default config;
