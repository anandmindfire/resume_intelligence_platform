import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterAll, describe, expect, it } from 'vitest';
import { ensureDirectoryExists, getFileExtension, validateOutputPath } from './fileUtils';

describe('ensureDirectoryExists', () => {
  const root = path.join(os.tmpdir(), `export-worker-${process.pid}-${Date.now()}`);

  afterAll(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('creates missing parent directories of the file path', async () => {
    const file = path.join(root, 'a', 'b', 'export.csv');
    await ensureDirectoryExists(file);
    expect((await fs.stat(path.dirname(file))).isDirectory()).toBe(true);
  });

  it('is a no-op when the directory already exists', async () => {
    await expect(ensureDirectoryExists(path.join(root, 'a', 'b', 'other.csv'))).resolves.toBeUndefined();
  });
});

describe('getFileExtension', () => {
  it.each([
    ['/exports/report.CSV', '.csv'],
    ['out.json', '.json'],
    ['archive.tar.gz', '.gz'],
    ['/exports/noext', ''],
  ])('%s -> %j', (file, ext) => {
    expect(getFileExtension(file)).toBe(ext);
  });
});

describe('validateOutputPath', () => {
  it('accepts ordinary paths', () => {
    expect(validateOutputPath('/exports/report.csv')).toBe(true);
    expect(validateOutputPath('relative/report.csv')).toBe(true);
  });

  it('rejects values path.parse cannot handle', () => {
    expect(validateOutputPath(undefined as unknown as string)).toBe(false);
  });
});
