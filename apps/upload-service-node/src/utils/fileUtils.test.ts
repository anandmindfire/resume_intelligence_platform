import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { config } from '@resume-platform/config';
import { formatFileSize, generateUniqueFileName, getUploadPath, sanitizeFileName } from './fileUtils';

describe('generateUniqueFileName', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps the base name and extension and inserts a timestamp and random suffix', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));

    const name = generateUniqueFileName('jane-doe.pdf');
    expect(name).toMatch(new RegExp(`^jane-doe-${Date.now()}-[a-z0-9]{1,6}\\.pdf$`));
  });

  it('handles names without an extension', () => {
    expect(generateUniqueFileName('README')).toMatch(/^README-\d+-[a-z0-9]{1,6}$/);
  });

  it('only treats the last dot as the extension', () => {
    expect(generateUniqueFileName('cv.final.docx')).toMatch(/^cv\.final-\d+-[a-z0-9]{1,6}\.docx$/);
  });

  it('produces different names for the same input', () => {
    const names = new Set(Array.from({ length: 50 }, () => generateUniqueFileName('a.pdf')));
    expect(names.size).toBe(50);
  });
});

describe('getUploadPath', () => {
  it('joins the file name onto the configured upload directory', () => {
    expect(getUploadPath('a.pdf')).toBe(path.join(config.upload.directory!, 'a.pdf'));
  });

  it('falls back to the default directory when none is configured', () => {
    const original = config.upload.directory;
    config.upload.directory = undefined;
    try {
      expect(getUploadPath('a.pdf')).toBe(path.join('/app/uploads', 'a.pdf'));
    } finally {
      config.upload.directory = original;
    }
  });
});

describe('formatFileSize', () => {
  it.each([
    [0, '0 Bytes'],
    [512, '512 Bytes'],
    [1024, '1 KB'],
    [1536, '1.5 KB'],
    [10 * 1024 * 1024, '10 MB'],
    [1024 ** 3, '1 GB'],
  ])('formats %i bytes as %s', (bytes, expected) => {
    expect(formatFileSize(bytes)).toBe(expected);
  });
});

describe('sanitizeFileName', () => {
  it('replaces anything except letters, digits, dot and dash with underscores', () => {
    expect(sanitizeFileName('My CV (final)/v2.pdf')).toBe('My_CV__final__v2.pdf');
  });

  it('leaves safe names untouched', () => {
    expect(sanitizeFileName('jane-doe.v2.pdf')).toBe('jane-doe.v2.pdf');
  });
});
