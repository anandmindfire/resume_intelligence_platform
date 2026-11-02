import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('dotenv', () => ({ config: vi.fn() }));

const ENV_KEYS = [
  'POSTGRES_HOST',
  'POSTGRES_PORT',
  'POSTGRES_USER',
  'POSTGRES_PASSWORD',
  'POSTGRES_DB',
  'DB_POOL_MAX',
  'REDIS_HOST',
  'REDIS_PORT',
  'REDIS_PASSWORD',
  'QUEUE_REDIS_HOST',
  'QUEUE_REDIS_PORT',
  'QUEUE_REDIS_PASSWORD',
  'QUEUE_CONCURRENCY',
  'QUEUE_ATTEMPTS',
  'QUEUE_BACKOFF_DELAY',
  'UPLOAD_MAX_SIZE',
  'UPLOAD_ALLOWED_TYPES',
  'UPLOAD_DIRECTORY',
  'UPLOAD_MAX_CONCURRENT',
  'API_GATEWAY_PORT',
  'API_GATEWAY_HOST',
  'UPLOAD_SERVICE_PORT',
  'UPLOAD_SERVICE_URL',
  'ANALYTICS_API_PORT',
  'ANALYTICS_API_URL',
  'API_DOCS_ENABLED',
  'JWT_SECRET',
  'JWT_EXPIRES_IN',
  'OCR_WORKER_CONCURRENCY',
  'TESSERACT_LANG',
  'PARSER_WORKER_CONCURRENCY',
  'MATCHER_WORKER_CONCURRENCY',
  'INSIGHTS_WORKER_CONCURRENCY',
];

async function loadConfig(env: Record<string, string> = {}) {
  vi.resetModules();
  Object.assign(process.env, env);
  return (await import('./index')).config;
}

describe('config', () => {
  let saved: NodeJS.ProcessEnv;

  beforeEach(() => {
    saved = { ...process.env };
    for (const key of ENV_KEYS) delete process.env[key];
  });

  afterEach(() => {
    process.env = saved;
  });

  it('loads .env via dotenv on import', async () => {
    await loadConfig();
    const dotenv = await import('dotenv');
    expect(dotenv.config).toHaveBeenCalled();
  });

  it('exposes sensible defaults when no environment is set', async () => {
    const config = await loadConfig();

    expect(config.database).toEqual({
      host: 'localhost',
      port: 5432,
      user: 'resume_user',
      password: 'resume_password',
      database: 'resume_db',
      poolMax: 20,
    });
    expect(config.redis).toEqual({ host: 'localhost', port: 6379, password: undefined });
    expect(config.queue).toEqual({
      redis: { host: 'localhost', port: 6379, password: undefined },
      concurrency: 5,
      attempts: 3,
      backoffDelay: 5000,
    });
    expect(config.upload).toEqual({
      maxSize: 10 * 1024 * 1024,
      allowedTypes: [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/jpeg',
        'image/png',
      ],
      directory: '/app/uploads',
      maxConcurrent: 0,
    });
    expect(config.apiGateway).toEqual({ port: 3000, host: '0.0.0.0' });
    expect(config.uploadService).toEqual({ port: 3001, url: 'http://localhost:3001' });
    expect(config.analyticsApi).toEqual({ port: 3002, url: 'http://localhost:3002' });
    expect(config.apiDocs).toEqual({ enabled: true });
    expect(config.jwt).toEqual({ secret: 'your-secret-key', expiresIn: '24h' });
    expect(config.ocr).toEqual({ concurrency: 3, tesseractLang: 'eng' });
    expect(config.parser.concurrency).toBe(3);
    expect(config.matcher.concurrency).toBe(5);
    expect(config.insights.concurrency).toBe(2);
  });

  it('reads and parses values from the environment', async () => {
    const config = await loadConfig({
      POSTGRES_HOST: 'db.internal',
      POSTGRES_PORT: '6543',
      POSTGRES_USER: 'svc',
      POSTGRES_PASSWORD: 'pw',
      POSTGRES_DB: 'resumes',
      DB_POOL_MAX: '50',
      REDIS_HOST: 'cache',
      REDIS_PORT: '7000',
      REDIS_PASSWORD: 'secret',
      UPLOAD_MAX_SIZE: '2048',
      UPLOAD_ALLOWED_TYPES: 'application/pdf,text/plain',
      UPLOAD_DIRECTORY: '/tmp/uploads',
      UPLOAD_MAX_CONCURRENT: '25',
      API_GATEWAY_PORT: '8080',
      API_GATEWAY_HOST: '127.0.0.1',
      UPLOAD_SERVICE_URL: 'http://upload:3001',
      ANALYTICS_API_URL: 'http://analytics:3002',
      MATCHER_WORKER_CONCURRENCY: '9',
    });

    expect(config.database).toMatchObject({
      host: 'db.internal',
      port: 6543,
      user: 'svc',
      password: 'pw',
      database: 'resumes',
      poolMax: 50,
    });
    expect(config.redis).toEqual({ host: 'cache', port: 7000, password: 'secret' });
    expect(config.upload).toEqual({
      maxSize: 2048,
      allowedTypes: ['application/pdf', 'text/plain'],
      directory: '/tmp/uploads',
      maxConcurrent: 25,
    });
    expect(config.apiGateway).toEqual({ port: 8080, host: '127.0.0.1' });
    expect(config.uploadService.url).toBe('http://upload:3001');
    expect(config.analyticsApi.url).toBe('http://analytics:3002');
    expect(config.matcher.concurrency).toBe(9);
  });

  it('falls back to the general Redis settings for the queue connection', async () => {
    const config = await loadConfig({ REDIS_HOST: 'cache', REDIS_PORT: '7000', REDIS_PASSWORD: 'pw' });
    expect(config.queue.redis).toEqual({ host: 'cache', port: 7000, password: 'pw' });
  });

  it('prefers queue-specific Redis settings when provided', async () => {
    const config = await loadConfig({
      REDIS_HOST: 'cache',
      QUEUE_REDIS_HOST: 'queue-cache',
      QUEUE_REDIS_PORT: '7100',
      QUEUE_REDIS_PASSWORD: 'qpw',
    });
    expect(config.queue.redis).toEqual({ host: 'queue-cache', port: 7100, password: 'qpw' });
  });

  it('disables API docs only when API_DOCS_ENABLED is exactly "false"', async () => {
    expect((await loadConfig({ API_DOCS_ENABLED: 'false' })).apiDocs.enabled).toBe(false);
    expect((await loadConfig({ API_DOCS_ENABLED: 'true' })).apiDocs.enabled).toBe(true);
  });

  it('exports the same object as the default export', async () => {
    vi.resetModules();
    const mod = await import('./index');
    expect(mod.default).toBe(mod.config);
  });
});
