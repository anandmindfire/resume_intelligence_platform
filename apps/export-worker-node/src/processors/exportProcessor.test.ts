import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import type { Job } from 'bullmq';
import type { QueueJobData } from '@resume-platform/queue-lib';
import { afterAll, describe, expect, it, vi } from 'vitest';

vi.mock('../services/dbService', () => ({ dbService: { getResumesForExport: vi.fn() } }));
vi.mock('@resume-platform/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }));

import { parseExportJobData, processExportJob } from './exportProcessor';
import { dbService } from '../services/dbService';

const getResumes = vi.mocked(dbService.getResumesForExport);
const root = path.join(os.tmpdir(), `export-processor-${process.pid}-${Date.now()}`);

const makeJob = (data: Partial<QueueJobData>) =>
  ({ data: { resumeId: '', filePath: '', fileName: '', mimeType: '', ...data } }) as Job<QueueJobData>;

const record = {
  id: 'r1',
  file_name: 'jane.pdf',
  name: 'Jane, Doe',
  email: 'jane@example.com',
  phone: '+1555',
  skills: 'go; sql',
  experience_count: 2,
  education_count: 1,
  status: 'matched',
  created_at: '2026-01-01',
};

describe('processExportJob', () => {
  afterAll(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('writes a CSV with headers to the output path, creating directories', async () => {
    getResumes.mockResolvedValueOnce([record]);
    const outputPath = path.join(root, 'nested', 'export.csv');

    const result = await processExportJob(makeJob({ resumeIds: ['r1'], outputPath }));

    expect(result).toEqual({ outputPath, recordCount: 1, status: 'completed' });
    expect(getResumes).toHaveBeenCalledWith(['r1']);

    const lines = (await fs.readFile(outputPath, 'utf8')).trim().split('\n');
    expect(lines[0]).toBe('ID,File Name,Name,Email,Phone,Skills,Experience Count,Education Count,Status,Created At');
    expect(lines[1]).toBe('r1,jane.pdf,"Jane, Doe",jane@example.com,+1555,go; sql,2,1,matched,2026-01-01');
  });

  it('exports every resume when no ids are given', async () => {
    getResumes.mockResolvedValueOnce([]);
    const outputPath = path.join(root, 'empty.csv');

    const result = await processExportJob(makeJob({ outputPath }));

    expect(getResumes).toHaveBeenCalledWith(undefined);
    expect(result.recordCount).toBe(0);
    expect((await fs.readFile(outputPath, 'utf8')).trim()).toMatch(/^ID,File Name/);
  });

  it('propagates database failures so the job is retried', async () => {
    getResumes.mockRejectedValueOnce(new Error('db down'));
    await expect(processExportJob(makeJob({ outputPath: path.join(root, 'x.csv') }))).rejects.toThrow('db down');
  });

  it('rejects a job without a usable outputPath before touching the database', async () => {
    await expect(processExportJob(makeJob({}))).rejects.toThrow('missing a valid outputPath');
    await expect(processExportJob(makeJob({ outputPath: '' }))).rejects.toThrow('missing a valid outputPath');
    expect(getResumes).not.toHaveBeenCalled();
  });
});

describe('parseExportJobData', () => {
  const base = { resumeId: '', filePath: '', fileName: '', mimeType: '' };

  it('accepts an output path with or without resume ids', () => {
    expect(parseExportJobData({ ...base, outputPath: '/x.csv' })).toEqual({ outputPath: '/x.csv', resumeIds: undefined });
    expect(parseExportJobData({ ...base, outputPath: '/x.csv', resumeIds: ['a', 'b'] })).toEqual({
      outputPath: '/x.csv',
      resumeIds: ['a', 'b'],
    });
  });

  it.each([[42], [null], [undefined], [{}]])('rejects outputPath %j', (outputPath) => {
    expect(() => parseExportJobData({ ...base, outputPath })).toThrow('missing a valid outputPath');
  });

  it.each([['a'], [[1, 2]], [['a', 2]], [{}]])('rejects resumeIds %j', (resumeIds) => {
    expect(() => parseExportJobData({ ...base, outputPath: '/x.csv', resumeIds })).toThrow(
      'resumeIds must be an array of strings'
    );
  });
});
