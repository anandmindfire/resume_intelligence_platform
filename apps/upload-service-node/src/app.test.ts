import fs from 'fs/promises';
import path from 'path';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@resume-platform/config', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@resume-platform/config')>();
  const nodeFs = await import('fs');
  const nodeOs = await import('os');
  const nodePath = await import('path');
  const directory = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'upload-service-test-'));
  return {
    ...mod,
    config: {
      ...mod.config,
      upload: { ...mod.config.upload, directory, maxSize: 1024 },
      apiDocs: { enabled: true },
    },
  };
});

vi.mock('./services/dbService', () => ({
  dbService: {
    createResume: vi.fn(),
    getResume: vi.fn(),
    deleteResume: vi.fn(),
  },
}));

vi.mock('./queues/queueHandler', () => ({
  queueHandler: {
    queueOCRJob: vi.fn(),
    queueMatcherJob: vi.fn(),
  },
}));

vi.mock('@resume-platform/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
  getErrorStack: (e: unknown) => (e instanceof Error ? e.stack : undefined),
}));

import { config } from '@resume-platform/config';
import { buildApp } from './app';
import { dbService } from './services/dbService';
import { queueHandler } from './queues/queueHandler';

const db = vi.mocked(dbService);
const queue = vi.mocked(queueHandler);
const uploadDir = config.upload.directory!;

const PDF = 'application/pdf';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type Part = { field: string; filename?: string; contentType?: string; content: string | Buffer };

/** Build a multipart/form-data request body for app.inject. */
function multipart(parts: Part[]) {
  const boundary = `----vitest${Math.random().toString(16).slice(2)}`;
  const chunks: Buffer[] = [];
  for (const part of parts) {
    let header = `--${boundary}\r\nContent-Disposition: form-data; name="${part.field}"`;
    if (part.filename) header += `; filename="${part.filename}"`;
    header += '\r\n';
    if (part.contentType) header += `Content-Type: ${part.contentType}\r\n`;
    chunks.push(Buffer.from(`${header}\r\n`), Buffer.from(part.content), Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    payload: Buffer.concat(chunks),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

const resumeFile = (
  filename = 'jane.pdf',
  contentType = PDF,
  content = '%PDF-1.4 resume'
): Part => ({
  field: 'resume',
  filename,
  contentType,
  content,
});

async function storedFiles() {
  return fs.readdir(uploadDir);
}

describe('upload-service app', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await fs.rm(uploadDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    db.createResume.mockResolvedValue(undefined);
    queue.queueOCRJob.mockResolvedValue(undefined);
    queue.queueMatcherJob.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    for (const file of await storedFiles()) {
      await fs.rm(path.join(uploadDir, file), { force: true });
    }
  });

  describe('request correlation', () => {
    it('adopts the x-request-id sent by the gateway and returns it', async () => {
      const res = await app.inject({
        url: '/health',
        headers: { 'x-request-id': 'gateway-trace-0001' },
      });

      expect(res.headers['x-request-id']).toBe('gateway-trace-0001');
    });

    it('generates an id for direct calls and ignores malformed ones', async () => {
      const direct = await app.inject({ url: '/health' });
      const forged = await app.inject({
        url: '/health',
        headers: { 'x-request-id': 'bad id\nforged-log-line' },
      });

      expect(direct.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
      expect(forged.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe('GET /health', () => {
    it('reports ok', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ status: 'ok', service: 'upload-service' });
      expect(new Date(res.json().timestamp).toISOString()).toBe(res.json().timestamp);
    });

    it('sets security headers', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['strict-transport-security']).toContain('max-age=31536000');
    });
  });

  describe('POST /api/v1/upload/single', () => {
    it('stores the file, records it and queues it for OCR', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/upload/single',
        ...multipart([resumeFile()]),
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body).toEqual({
        resumeId: expect.stringMatching(UUID_RE),
        fileName: 'jane.pdf',
        status: 'uploaded',
        message: 'Resume uploaded successfully and queued for processing',
      });

      const [stored] = await storedFiles();
      expect(stored).toMatch(/^jane-\d+-[a-z0-9]+\.pdf$/);
      const filePath = path.join(uploadDir, stored);
      await expect(fs.readFile(filePath, 'utf8')).resolves.toBe('%PDF-1.4 resume');

      expect(db.createResume).toHaveBeenCalledWith({
        id: body.resumeId,
        fileName: 'jane.pdf',
        filePath,
        mimeType: PDF,
        fileSize: 15,
        status: 'uploaded',
      });
      expect(queue.queueOCRJob).toHaveBeenCalledWith({
        resumeId: body.resumeId,
        filePath,
        fileName: 'jane.pdf',
        mimeType: PDF,
      });
    });

    it('returns 400 when the request has no file part', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/upload/single',
        ...multipart([{ field: 'note', content: 'no file here' }]),
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: 'No file uploaded' });
    });

    it('returns 400 for a disallowed MIME type without storing anything', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/upload/single',
        ...multipart([resumeFile('notes.txt', 'text/plain')]),
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: 'File type text/plain not allowed' });
      expect(await storedFiles()).toEqual([]);
      expect(db.createResume).not.toHaveBeenCalled();
    });

    it('rejects files over the size limit with 413 and stores nothing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/upload/single',
        ...multipart([resumeFile('big.pdf', PDF, 'x'.repeat(2048))]),
      });

      expect(res.statusCode).toBe(413);
      expect(res.json()).toEqual({
        error: `File size exceeds maximum allowed size of ${config.upload.maxSize} bytes`,
      });
      expect(await storedFiles()).toEqual([]);
      expect(db.createResume).not.toHaveBeenCalled();
      expect(queue.queueOCRJob).not.toHaveBeenCalled();
    });

    it('accepts a file exactly at the size limit', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/upload/single',
        ...multipart([resumeFile('exact.pdf', PDF, 'x'.repeat(config.upload.maxSize))]),
      });

      expect(res.statusCode).toBe(201);
      expect(db.createResume).toHaveBeenCalledWith(
        expect.objectContaining({ fileSize: config.upload.maxSize })
      );
    });

    it('leaves the server healthy after rejecting a large disallowed file', async () => {
      const rejected = await app.inject({
        method: 'POST',
        url: '/api/v1/upload/single',
        ...multipart([resumeFile('notes.txt', 'text/plain', 'x'.repeat(4096))]),
      });
      expect(rejected.statusCode).toBe(400);

      const accepted = await app.inject({
        method: 'POST',
        url: '/api/v1/upload/single',
        ...multipart([resumeFile()]),
      });
      expect(accepted.statusCode).toBe(201);
    });

    it('returns 500 when the database insert fails', async () => {
      db.createResume.mockRejectedValueOnce(new Error('db down'));

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/upload/single',
        ...multipart([resumeFile()]),
      });

      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({ error: 'Failed to upload resume' });
      expect(queue.queueOCRJob).not.toHaveBeenCalled();
    });

    it('returns 500 when queueing fails', async () => {
      queue.queueOCRJob.mockRejectedValueOnce(new Error('redis down'));

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/upload/single',
        ...multipart([resumeFile()]),
      });

      expect(res.statusCode).toBe(500);
    });
  });

  describe('POST /api/v1/upload/multiple', () => {
    const many = (...parts: Part[]) => multipart(parts.map((p) => ({ ...p, field: 'resumes' })));

    it('stores every file and reports per-file results', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/upload/multiple',
        ...many(resumeFile('a.pdf'), resumeFile('b.png', 'image/png', 'png')),
      });

      expect(res.statusCode).toBe(201);
      expect(res.json()).toEqual({
        total: 2,
        success: 2,
        failed: 0,
        results: [
          { resumeId: expect.stringMatching(UUID_RE), fileName: 'a.pdf', status: 'uploaded' },
          { resumeId: expect.stringMatching(UUID_RE), fileName: 'b.png', status: 'uploaded' },
        ],
      });

      const stored = await storedFiles();
      expect(stored).toHaveLength(2);
      // Same naming scheme as a single upload: <original base name>-<timestamp>-<random>.<ext>.
      expect(stored.sort()).toEqual([
        expect.stringMatching(/^a-\d+-[a-z0-9]+\.pdf$/),
        expect.stringMatching(/^b-\d+-[a-z0-9]+\.png$/),
      ]);
      expect(db.createResume).toHaveBeenCalledTimes(2);
      expect(queue.queueOCRJob).toHaveBeenCalledTimes(2);
    });

    it('returns 400 when the request has no file parts', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/upload/multiple',
        ...multipart([{ field: 'note', content: 'no files' }]),
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: 'No files uploaded', results: [] });
    });

    it('reports disallowed file types per file instead of hanging', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/upload/multiple',
        ...many(
          resumeFile('a.pdf'),
          resumeFile('c.txt', 'text/plain', 'x'.repeat(4096)),
          resumeFile('b.png', 'image/png', 'png')
        ),
      });

      expect(res.statusCode).toBe(201);
      expect(res.json()).toEqual({
        total: 3,
        success: 2,
        failed: 1,
        results: expect.arrayContaining([
          { resumeId: expect.stringMatching(UUID_RE), fileName: 'a.pdf', status: 'uploaded' },
          { resumeId: expect.stringMatching(UUID_RE), fileName: 'b.png', status: 'uploaded' },
          { fileName: 'c.txt', status: 'failed', error: 'File type text/plain not allowed' },
        ]),
      });
      expect(await storedFiles()).toHaveLength(2);
    }, 2000);

    it('reports files over the size limit per file and stores nothing for them', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/upload/multiple',
        ...many(resumeFile('ok.pdf'), resumeFile('big.pdf', PDF, 'x'.repeat(2048))),
      });

      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ total: 2, success: 1, failed: 1 });
      expect(res.json().results).toContainEqual({
        fileName: 'big.pdf',
        status: 'failed',
        error: `File size exceeds maximum allowed size of ${config.upload.maxSize} bytes`,
      });
      expect(await storedFiles()).toHaveLength(1);
      expect(db.createResume).toHaveBeenCalledTimes(1);
    });

    it('returns 400 with the rejection reasons when every file is rejected', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/upload/multiple',
        ...many(resumeFile('c.txt', 'text/plain'), resumeFile('big.pdf', PDF, 'x'.repeat(2048))),
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({
        error: 'No files uploaded',
        results: [
          { fileName: 'c.txt', status: 'failed', error: 'File type text/plain not allowed' },
          {
            fileName: 'big.pdf',
            status: 'failed',
            error: `File size exceeds maximum allowed size of ${config.upload.maxSize} bytes`,
          },
        ],
      });
      expect(await storedFiles()).toEqual([]);
    });

    it('marks a file as failed and removes it when recording it fails', async () => {
      db.createResume
        .mockRejectedValueOnce(new Error('duplicate key'))
        .mockResolvedValueOnce(undefined);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/upload/multiple',
        ...many(resumeFile('a.pdf'), resumeFile('b.pdf')),
      });

      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ total: 2, success: 1, failed: 1 });
      expect(res.json().results[0]).toEqual({
        fileName: 'a.pdf',
        status: 'failed',
        error: 'duplicate key',
      });
      expect(await storedFiles()).toHaveLength(1);
    });
  });

  describe('GET /api/v1/upload/:resumeId/status', () => {
    it('returns the resume status', async () => {
      const createdAt = new Date('2026-01-02T03:04:05Z');
      db.getResume.mockResolvedValueOnce({
        id: 'r-1',
        status: 'parsed',
        file_name: 'jane.pdf',
        file_path: '/x',
        mime_type: PDF,
        file_size: 1,
        created_at: createdAt,
      });

      const res = await app.inject({ method: 'GET', url: '/api/v1/upload/r-1/status' });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        resumeId: 'r-1',
        status: 'parsed',
        fileName: 'jane.pdf',
        createdAt: createdAt.toISOString(),
      });
      expect(db.getResume).toHaveBeenCalledWith('r-1');
    });

    it('returns 404 for an unknown resume', async () => {
      db.getResume.mockResolvedValueOnce(null);
      const res = await app.inject({ method: 'GET', url: '/api/v1/upload/nope/status' });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: 'Resume not found' });
    });

    it('returns 500 when the lookup fails', async () => {
      db.getResume.mockRejectedValueOnce(new Error('db down'));
      const res = await app.inject({ method: 'GET', url: '/api/v1/upload/r-1/status' });
      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({ error: 'Failed to fetch status' });
    });
  });

  describe('DELETE /api/v1/upload/resumes/:resumeId', () => {
    it('deletes the stored file and the record', async () => {
      const filePath = path.join(uploadDir, 'to-delete.pdf');
      await fs.writeFile(filePath, 'x');
      db.getResume.mockResolvedValueOnce({ id: 'r-1', file_path: filePath } as never);

      const res = await app.inject({ method: 'DELETE', url: '/api/v1/upload/resumes/r-1' });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ success: true, message: 'Resume deleted successfully' });
      await expect(fs.access(filePath)).rejects.toThrow();
      expect(db.deleteResume).toHaveBeenCalledWith('r-1');
    });

    it('still deletes the record when the file is already gone', async () => {
      db.getResume.mockResolvedValueOnce({
        id: 'r-1',
        file_path: path.join(uploadDir, 'gone.pdf'),
      } as never);

      const res = await app.inject({ method: 'DELETE', url: '/api/v1/upload/resumes/r-1' });

      expect(res.statusCode).toBe(200);
      expect(db.deleteResume).toHaveBeenCalledWith('r-1');
    });

    it('returns 404 for an unknown resume', async () => {
      db.getResume.mockResolvedValueOnce(null);
      const res = await app.inject({ method: 'DELETE', url: '/api/v1/upload/resumes/nope' });
      expect(res.statusCode).toBe(404);
      expect(db.deleteResume).not.toHaveBeenCalled();
    });

    it('returns 500 when deleting the record fails', async () => {
      db.getResume.mockResolvedValueOnce({ id: 'r-1', file_path: '/nonexistent' } as never);
      db.deleteResume.mockRejectedValueOnce(new Error('db down'));
      const res = await app.inject({ method: 'DELETE', url: '/api/v1/upload/resumes/r-1' });
      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({ error: 'Failed to delete resume' });
    });
  });

  describe('GET /api/v1/upload/resumes/:resumeId/file', () => {
    it('streams the original file inline with its MIME type', async () => {
      const filePath = path.join(uploadDir, 'stored.pdf');
      await fs.writeFile(filePath, '%PDF-1.4 content');
      db.getResume.mockResolvedValueOnce({
        id: 'r-1',
        file_path: filePath,
        file_name: 'jane.pdf',
        mime_type: PDF,
      } as never);

      const res = await app.inject({ method: 'GET', url: '/api/v1/upload/resumes/r-1/file' });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe(PDF);
      expect(res.headers['content-disposition']).toBe('inline; filename="jane.pdf"');
      expect(res.body).toBe('%PDF-1.4 content');
    });

    it('returns 404 when the record is missing', async () => {
      db.getResume.mockResolvedValueOnce(null);
      const res = await app.inject({ method: 'GET', url: '/api/v1/upload/resumes/nope/file' });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: 'Resume not found' });
    });

    it('returns 404 when the stored file is missing', async () => {
      db.getResume.mockResolvedValueOnce({
        id: 'r-1',
        file_path: path.join(uploadDir, 'gone.pdf'),
      } as never);
      const res = await app.inject({ method: 'GET', url: '/api/v1/upload/resumes/r-1/file' });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: 'File not found on server' });
    });

    it('returns 500 when the lookup fails', async () => {
      db.getResume.mockRejectedValueOnce(new Error('db down'));
      const res = await app.inject({ method: 'GET', url: '/api/v1/upload/resumes/r-1/file' });
      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({ error: 'Failed to serve file' });
    });
  });

  describe('POST /api/internal/queue/matcher', () => {
    it('queues a matcher job', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/internal/queue/matcher',
        payload: { resumeId: 'r-1' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ success: true, message: 'Matcher job queued', resumeId: 'r-1' });
      expect(queue.queueMatcherJob).toHaveBeenCalledWith('r-1');
    });

    it('returns 400 without a resumeId', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/internal/queue/matcher',
        payload: {},
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: 'resumeId is required' });
    });

    it('returns 500 when queueing fails', async () => {
      queue.queueMatcherJob.mockRejectedValueOnce(new Error('bull down'));
      const res = await app.inject({
        method: 'POST',
        url: '/api/internal/queue/matcher',
        payload: { resumeId: 'r-1' },
      });
      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({ error: 'Failed to queue matcher job' });
    });
  });

  describe('API docs', () => {
    it('serves an OpenAPI 3 spec documenting every route', async () => {
      const res = await app.inject({ method: 'GET', url: '/docs/json' });

      expect(res.statusCode).toBe(200);
      const spec = res.json();
      expect(spec.openapi).toBe('3.0.3');
      expect(spec.info.title).toBe('Upload Service API');
      expect(Object.keys(spec.paths).sort()).toEqual([
        '/api/internal/queue/matcher',
        '/api/v1/upload/multiple',
        '/api/v1/upload/resumes/{resumeId}',
        '/api/v1/upload/resumes/{resumeId}/file',
        '/api/v1/upload/single',
        '/api/v1/upload/{resumeId}/status',
        '/health',
      ]);
    });

    it('documents multipart uploads with binary file fields', async () => {
      const spec = (await app.inject({ method: 'GET', url: '/docs/json' })).json();
      const single = spec.paths['/api/v1/upload/single'].post;

      expect(single.tags).toEqual(['Upload']);
      expect(single.requestBody.content['multipart/form-data'].schema.properties.resume).toEqual({
        type: 'string',
        format: 'binary',
        description: 'Resume file',
      });
      expect(Object.keys(single.responses)).toEqual(['201', '400', '413', '500']);
    });

    it('serves Swagger UI', async () => {
      const res = await app.inject({ method: 'GET', url: '/docs' });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
    });

    it('is not registered when API docs are disabled', async () => {
      config.apiDocs.enabled = false;
      const noDocs = await buildApp();
      try {
        const res = await noDocs.inject({ method: 'GET', url: '/docs/json' });
        expect(res.statusCode).toBe(404);
      } finally {
        config.apiDocs.enabled = true;
        await noDocs.close();
      }
    });
  });
});
