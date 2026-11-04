import path from 'path';
import { describe, expect, it } from 'vitest';
import { config } from '@resume-platform/config';
import {
  MAX_DISPLAY_NAME_LENGTH,
  buildContentDisposition,
  formatFileSize,
  generateStoredFileName,
  generateTempFileName,
  getUploadPath,
  resolveInsideUploads,
  sanitizeDisplayName,
  sanitizeFileName,
} from './fileUtils';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';

describe('generateStoredFileName', () => {
  it('is a random UUID plus the given extension, never the client name', () => {
    expect(generateStoredFileName('.pdf')).toMatch(new RegExp(`^${UUID}\\.pdf$`));
  });

  it('drops extensions that are not short and alphanumeric', () => {
    expect(generateStoredFileName('.pdf/../../x')).toMatch(new RegExp(`^${UUID}$`));
    expect(generateStoredFileName('')).toMatch(new RegExp(`^${UUID}$`));
  });

  it('produces different names every time', () => {
    const names = new Set(Array.from({ length: 50 }, () => generateStoredFileName('.pdf')));
    expect(names.size).toBe(50);
  });
});

describe('generateTempFileName', () => {
  it('is a UUID with a .part suffix', () => {
    expect(generateTempFileName()).toMatch(new RegExp(`^${UUID}\\.part$`));
  });
});

describe('resolveInsideUploads', () => {
  const root = path.resolve(config.upload.directory!);

  it('accepts a file directly inside the uploads directory', () => {
    expect(resolveInsideUploads(path.join(root, 'a.pdf'))).toBe(path.join(root, 'a.pdf'));
  });

  it.each(['/etc/passwd', `${root}/../secrets`, root, `${root}-evil/a.pdf`])(
    'rejects %s',
    (candidate) => {
      expect(resolveInsideUploads(candidate)).toBeNull();
    }
  );
});

describe('sanitizeDisplayName', () => {
  it('drops directory components (both separators)', () => {
    expect(sanitizeDisplayName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeDisplayName('C:\\Users\\me\\cv.pdf')).toBe('cv.pdf');
  });

  it('strips control and quoting characters that could break headers or markup', () => {
    expect(sanitizeDisplayName('cv\r\nSet-Cookie: x".pdf')).toBe('cvSet-Cookie x.pdf');
  });

  it('keeps Unicode names and limits length', () => {
    expect(sanitizeDisplayName('Résumé 履歴書.pdf')).toBe('Résumé 履歴書.pdf');
    expect(sanitizeDisplayName('a'.repeat(500))).toHaveLength(MAX_DISPLAY_NAME_LENGTH);
  });

  it('falls back to a placeholder for empty or dot names', () => {
    expect(sanitizeDisplayName('')).toBe('resume');
    expect(sanitizeDisplayName(undefined)).toBe('resume');
    expect(sanitizeDisplayName('..')).toBe('resume');
  });
});

describe('buildContentDisposition', () => {
  it('emits an ASCII fallback plus an RFC 5987 UTF-8 name', () => {
    expect(buildContentDisposition('attachment', 'Résumé.pdf')).toBe(
      `attachment; filename="R_sum_.pdf"; filename*=UTF-8''R%C3%A9sum%C3%A9.pdf`
    );
  });

  it('cannot be broken out of with quotes or CRLF', () => {
    const header = buildContentDisposition('inline', 'a"; filename="evil.html\r\nX: y');
    expect(header).not.toMatch(/[\r\n]/);
    expect(header.match(/"/g)).toHaveLength(2);
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
