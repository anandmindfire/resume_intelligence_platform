import fs from 'fs/promises';
import path from 'path';
import { Readable } from 'stream';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Multipart, MultipartFile } from '@fastify/multipart';

vi.mock('@resume-platform/config', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@resume-platform/config')>();
  const nodeFs = await import('fs');
  const nodeOs = await import('os');
  const nodePath = await import('path');
  const directory = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'upload-service-unit-'));
  return {
    ...mod,
    config: { ...mod.config, upload: { ...mod.config.upload, directory, maxSize: 1024 } },
  };
});

vi.mock('@resume-platform/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
  getErrorStack: (e: unknown) => (e instanceof Error ? e.stack : undefined),
}));

vi.mock('./dbService', () => ({
  dbService: { createResume: vi.fn(), getResume: vi.fn(), deleteResume: vi.fn() },
}));

vi.mock('../queues/queueHandler', () => ({
  queueHandler: { queueOCRJob: vi.fn(), queueMatcherJob: vi.fn() },
}));

import { config } from '@resume-platform/config';
import { dbService } from './dbService';
import { queueHandler } from '../queues/queueHandler';
import { uploadService } from './uploadService';

const db = vi.mocked(dbService);
const queue = vi.mocked(queueHandler);
const uploadDir = config.upload.directory!;

const PDF_HEADER = '%PDF-1.4\n';

/**
 * A minimal MultipartFile-shaped fixture: a real Readable so the real pipeline/fs code runs.
 * PDF parts get a real PDF signature prepended (content is magic-byte checked) unless `raw` is set.
 */
function fakeFilePart(
  filename: string,
  mimetype: string,
  content: string,
  { raw = false }: { raw?: boolean } = {}
): MultipartFile {
  const body = !raw && mimetype === 'application/pdf' ? PDF_HEADER + content : content;
  const file = Readable.from([Buffer.from(body)]) as MultipartFile['file'];
  file.truncated = false;
  return {
    type: 'file',
    fieldname: 'resume',
    filename,
    encoding: '7bit',
    mimetype,
    file,
  } as MultipartFile;
}

async function* partsFrom(files: MultipartFile[]): AsyncIterableIterator<Multipart> {
  for (const file of files) yield file;
}

describe('uploadService', () => {
  beforeAll(async () => {
    await fs.mkdir(uploadDir, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(uploadDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    db.createResume.mockResolvedValue(undefined);
    queue.queueOCRJob.mockResolvedValue(undefined);
    for (const entry of await fs.readdir(uploadDir)) {
      await fs.rm(path.join(uploadDir, entry), { force: true });
    }
  });

  describe('uploadSingleFile', () => {
    it('stores, persists and queues an allowed file', async () => {
      const part = fakeFilePart('jane.pdf', 'application/pdf', 'small content');

      const outcome = await uploadService.uploadSingleFile(part);

      expect(outcome).toMatchObject({ accepted: true, fileName: 'jane.pdf' });
      expect(db.createResume).toHaveBeenCalledWith(
        expect.objectContaining({
          fileName: 'jane.pdf',
          mimeType: 'application/pdf',
          status: 'uploaded',
        })
      );
      expect(queue.queueOCRJob).toHaveBeenCalledWith(
        expect.objectContaining({ fileName: 'jane.pdf', mimeType: 'application/pdf' })
      );

      // Stored under a random name with the detected extension, readable by the owner only.
      const [stored] = await fs.readdir(uploadDir);
      expect(stored).toMatch(/^[0-9a-f-]{36}\.pdf$/);
      const { mode } = await fs.stat(path.join(uploadDir, stored));
      expect(mode & 0o777).toBe(0o600);
    });

    it('rejects content that does not match the declared type and stores nothing', async () => {
      const part = fakeFilePart('cv.pdf', 'application/pdf', '<html><script>alert(1)</script>', {
        raw: true,
      });

      const outcome = await uploadService.uploadSingleFile(part);

      expect(outcome).toEqual({
        accepted: false,
        statusCode: 400,
        error: 'File content does not match a supported resume format',
      });
      expect(await fs.readdir(uploadDir)).toEqual([]);
      expect(db.createResume).not.toHaveBeenCalled();
    });

    it('never uses the client file name on disk and sanitizes it for display', async () => {
      const part = fakeFilePart('../../etc/cron.d/x\r\n.pdf', 'application/pdf', 'content');

      const outcome = await uploadService.uploadSingleFile(part);

      expect(outcome).toMatchObject({ accepted: true, fileName: 'x.pdf' });
      const [stored] = await fs.readdir(uploadDir);
      expect(stored).toMatch(/^[0-9a-f-]{36}\.pdf$/);
      expect(db.createResume).toHaveBeenCalledWith(
        expect.objectContaining({ fileName: 'x.pdf', filePath: path.join(uploadDir, stored) })
      );
    });

    it('drains and rejects a disallowed MIME type without storing anything', async () => {
      const part = fakeFilePart('notes.txt', 'text/plain', 'x'.repeat(10));

      const outcome = await uploadService.uploadSingleFile(part);

      expect(outcome).toEqual({
        accepted: false,
        statusCode: 400,
        error: 'File type not allowed',
      });
      expect(await fs.readdir(uploadDir)).toEqual([]);
      expect(db.createResume).not.toHaveBeenCalled();
    });

    it('rejects and removes a file truncated at the size limit', async () => {
      const part = fakeFilePart('big.pdf', 'application/pdf', 'x'.repeat(2048));
      part.file.truncated = true;

      const outcome = await uploadService.uploadSingleFile(part);

      expect(outcome).toEqual({
        accepted: false,
        statusCode: 413,
        error: `File size exceeds maximum allowed size of ${config.upload.maxSize} bytes`,
      });
      expect(await fs.readdir(uploadDir)).toEqual([]);
    });

    it('removes the file and propagates a write failure', async () => {
      const part = fakeFilePart('fail.pdf', 'application/pdf', 'content');
      part.file.destroy(new Error('disk full'));

      await expect(uploadService.uploadSingleFile(part)).rejects.toThrow('disk full');
      expect(await fs.readdir(uploadDir)).toEqual([]);
    });

    it('rejects a file that fails post-write validation', async () => {
      const original = config.upload.maxSize;
      config.upload.maxSize = -1; // forces validateFile() to reject every size
      try {
        const part = fakeFilePart('jane.pdf', 'application/pdf', 'content');
        const outcome = await uploadService.uploadSingleFile(part);

        expect(outcome).toMatchObject({ accepted: false, statusCode: 400 });
        expect(await fs.readdir(uploadDir)).toEqual([]);
        expect(db.createResume).not.toHaveBeenCalled();
      } finally {
        config.upload.maxSize = original;
      }
    });
  });

  describe('uploadMultipleFiles', () => {
    it('stores every allowed file and reports anyFileAccepted', async () => {
      const { results, anyFileAccepted } = await uploadService.uploadMultipleFiles(
        partsFrom([
          fakeFilePart('a.pdf', 'application/pdf', 'a'),
          fakeFilePart('b.pdf', 'application/pdf', 'b'),
        ])
      );

      expect(anyFileAccepted).toBe(true);
      expect(results).toHaveLength(2);
      expect(results.every((r) => r.status === 'uploaded')).toBe(true);
      expect(db.createResume).toHaveBeenCalledTimes(2);
    });

    it('reports anyFileAccepted: false when every file is rejected', async () => {
      const { results, anyFileAccepted } = await uploadService.uploadMultipleFiles(
        partsFrom([fakeFilePart('c.txt', 'text/plain', 'x')])
      );

      expect(anyFileAccepted).toBe(false);
      expect(results).toEqual([
        { fileName: 'c.txt', status: 'failed', error: 'File type not allowed' },
      ]);
    });

    it('isolates a post-write validation failure to that one file', async () => {
      // Not flagged truncated by the parser, but its total size still exceeds the limit: validateFile()
      // (a second, independent check after the write completes) must catch it.
      const oversized = fakeFilePart(
        'bad.pdf',
        'application/pdf',
        'x'.repeat(config.upload.maxSize + 1)
      );

      const { results, anyFileAccepted } = await uploadService.uploadMultipleFiles(
        partsFrom([fakeFilePart('good.pdf', 'application/pdf', 'ok'), oversized])
      );

      expect(anyFileAccepted).toBe(true);
      expect(results.find((r) => r.fileName === 'good.pdf')).toMatchObject({ status: 'uploaded' });
      expect(results.find((r) => r.fileName === 'bad.pdf')).toMatchObject({ status: 'failed' });
    });

    it('isolates a database failure to the offending file and removes its stored copy', async () => {
      db.createResume
        .mockRejectedValueOnce(new Error('duplicate key'))
        .mockResolvedValueOnce(undefined);

      const { results } = await uploadService.uploadMultipleFiles(
        partsFrom([
          fakeFilePart('a.pdf', 'application/pdf', 'a'),
          fakeFilePart('b.pdf', 'application/pdf', 'b'),
        ])
      );

      // The internal error is logged, not returned.
      expect(results[0]).toEqual({
        fileName: 'a.pdf',
        status: 'failed',
        error: 'Failed to process file',
      });
      expect(results[1]).toMatchObject({ fileName: 'b.pdf', status: 'uploaded' });
      expect(await fs.readdir(uploadDir)).toHaveLength(1);
    });

    it('cleans up already-stored files when iterating the parts throws', async () => {
      async function* brokenParts(): AsyncIterableIterator<Multipart> {
        yield fakeFilePart('a.pdf', 'application/pdf', 'a');
        throw new Error('client disconnected');
      }

      await expect(uploadService.uploadMultipleFiles(brokenParts())).rejects.toThrow(
        'client disconnected'
      );
      expect(await fs.readdir(uploadDir)).toEqual([]);
    });

    it('skips non-file parts', async () => {
      async function* parts(): AsyncIterableIterator<Multipart> {
        yield { type: 'field', fieldname: 'note', value: 'hi' } as Multipart;
        yield fakeFilePart('a.pdf', 'application/pdf', 'a');
      }

      const { results } = await uploadService.uploadMultipleFiles(parts());
      expect(results).toHaveLength(1);
    });
  });

  it('getUploadStatus delegates to dbService', async () => {
    db.getResume.mockResolvedValueOnce({ id: 'r1' } as never);
    await expect(uploadService.getUploadStatus('r1')).resolves.toEqual({ id: 'r1' });
    expect(db.getResume).toHaveBeenCalledWith('r1');
  });

  describe('deleteResume', () => {
    it('returns not_found for an unknown resume', async () => {
      db.getResume.mockResolvedValueOnce(null);
      await expect(uploadService.deleteResume('nope')).resolves.toBe('not_found');
      expect(db.deleteResume).not.toHaveBeenCalled();
    });

    it('never deletes a stored path outside the uploads directory', async () => {
      const outside = path.join(path.dirname(uploadDir), `outside-${Date.now()}.txt`);
      await fs.writeFile(outside, 'keep me');
      try {
        db.getResume.mockResolvedValueOnce({ id: 'r1', file_path: outside } as never);
        await expect(uploadService.deleteResume('r1')).resolves.toBe('deleted');
        await expect(fs.readFile(outside, 'utf8')).resolves.toBe('keep me');
      } finally {
        await fs.rm(outside, { force: true });
      }
    });

    it('deletes the file and record, warning if the file is already gone', async () => {
      db.getResume.mockResolvedValueOnce({
        id: 'r1',
        file_path: path.join(uploadDir, 'gone.pdf'),
      } as never);
      await expect(uploadService.deleteResume('r1')).resolves.toBe('deleted');
      expect(db.deleteResume).toHaveBeenCalledWith('r1');
    });
  });

  describe('getResumeFile', () => {
    it('reports resume_not_found', async () => {
      db.getResume.mockResolvedValueOnce(null);
      await expect(uploadService.getResumeFile('nope')).resolves.toEqual({
        found: false,
        reason: 'resume_not_found',
      });
    });

    it('reports file_missing when the record exists but the file does not', async () => {
      db.getResume.mockResolvedValueOnce({
        id: 'r1',
        file_path: path.join(uploadDir, 'gone.pdf'),
      } as never);
      await expect(uploadService.getResumeFile('r1')).resolves.toEqual({
        found: false,
        reason: 'file_missing',
      });
    });

    it('refuses to serve a stored path outside the uploads directory', async () => {
      db.getResume.mockResolvedValueOnce({
        id: 'r1',
        file_path: '/etc/passwd',
        file_name: 'passwd',
        mime_type: 'application/pdf',
      } as never);
      await expect(uploadService.getResumeFile('r1')).resolves.toEqual({
        found: false,
        reason: 'file_missing',
      });
    });

    it('returns a readable stream for an existing file', async () => {
      const filePath = path.join(uploadDir, 'stored.pdf');
      await fs.writeFile(filePath, 'content');
      db.getResume.mockResolvedValueOnce({
        id: 'r1',
        file_path: filePath,
        file_name: 'jane.pdf',
        mime_type: 'application/pdf',
      } as never);

      const outcome = await uploadService.getResumeFile('r1');
      expect(outcome).toMatchObject({
        found: true,
        mimeType: 'application/pdf',
        fileName: 'jane.pdf',
      });
    });
  });

  it('queueMatcherJob delegates to queueHandler', async () => {
    await uploadService.queueMatcherJob('r1');
    expect(queue.queueMatcherJob).toHaveBeenCalledWith('r1');
  });
});
