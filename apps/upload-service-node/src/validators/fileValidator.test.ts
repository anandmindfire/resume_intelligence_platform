import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@resume-platform/config', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@resume-platform/config')>();
  return { ...mod, config: { ...mod.config, upload: { ...mod.config.upload, maxSize: 10 } } };
});

import { validateFile } from './fileValidator';

describe('validateFile', () => {
  let dir: string;

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'file-validator-'));
  });

  afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('accepts a readable file within the size limit', async () => {
    const file = path.join(dir, 'ok.pdf');
    await fs.writeFile(file, '0123456789');

    await expect(validateFile(file)).resolves.toEqual({ valid: true });
  });

  it('rejects a file larger than the configured maximum', async () => {
    const file = path.join(dir, 'big.pdf');
    await fs.writeFile(file, '01234567890');

    await expect(validateFile(file)).resolves.toEqual({
      valid: false,
      error: 'File size exceeds maximum allowed size of 10 bytes',
    });
  });

  it('rejects a missing file', async () => {
    const result = await validateFile(path.join(dir, 'missing.pdf'));

    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/^File validation failed: ENOENT/);
  });

  it.skipIf(process.getuid?.() === 0)('rejects an unreadable file', async () => {
    const file = path.join(dir, 'locked.pdf');
    await fs.writeFile(file, 'x');
    await fs.chmod(file, 0o000);

    const result = await validateFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/^File validation failed: EACCES/);
  });
});
