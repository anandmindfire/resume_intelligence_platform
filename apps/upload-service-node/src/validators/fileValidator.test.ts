import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@resume-platform/config', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@resume-platform/config')>();
  return { ...mod, config: { ...mod.config, upload: { ...mod.config.upload, maxSize: 4096 } } };
});

vi.mock('@resume-platform/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));

import {
  DOCX_LIMITS,
  MIME_TYPES,
  detectFileType,
  inspectZip,
  isAllowedMimeType,
  normalizeMimeType,
  validateFile,
} from './fileValidator';

const PDF = Buffer.from('%PDF-1.4\n% resume\n');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);

type ZipEntry = { name: string; data?: Buffer; compressedSize?: number; uncompressedSize?: number };

/**
 * Builds a minimal stored (uncompressed) ZIP. Sizes can be overridden in the central directory to
 * simulate archives that claim to expand enormously, without allocating that memory in the test.
 */
function buildZip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const data = entry.data ?? Buffer.alloc(0);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt32LE(entry.compressedSize ?? data.length, 20);
    central.writeUInt32LE(entry.uncompressedSize ?? data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += 30 + name.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

const DOCX = buildZip([
  { name: '[Content_Types].xml', data: Buffer.from('<Types/>') },
  { name: 'word/document.xml', data: Buffer.from('<w:document/>') },
]);

describe('normalizeMimeType / isAllowedMimeType', () => {
  it('lower-cases, strips parameters and resolves aliases', () => {
    expect(normalizeMimeType('Application/PDF; charset=binary')).toBe(MIME_TYPES.PDF);
    expect(normalizeMimeType('image/jpg')).toBe(MIME_TYPES.JPEG);
  });

  it('accepts only allow-listed types', () => {
    expect(isAllowedMimeType('application/pdf')).toBe(true);
    expect(isAllowedMimeType('image/jpg')).toBe(true);
    expect(isAllowedMimeType('text/html')).toBe(false);
    expect(isAllowedMimeType('image/svg+xml')).toBe(false);
  });
});

describe('detectFileType', () => {
  it.each([
    ['PDF', PDF, MIME_TYPES.PDF, '.pdf'],
    ['PNG', PNG, MIME_TYPES.PNG, '.png'],
    ['JPEG', JPEG, MIME_TYPES.JPEG, '.jpg'],
    ['DOCX', DOCX, MIME_TYPES.DOCX, '.docx'],
  ])('recognises %s from its content', (_label, content, mimeType, extension) => {
    expect(detectFileType(content)).toEqual({ mimeType, extension });
  });

  it('returns null for unsupported content', () => {
    expect(detectFileType(Buffer.from('<html><script>alert(1)</script></html>'))).toBeNull();
    expect(detectFileType(Buffer.from('MZ\x90\x00'))).toBeNull();
  });

  it('does not treat an arbitrary ZIP as a DOCX', () => {
    expect(detectFileType(buildZip([{ name: 'payload.exe', data: Buffer.from('x') }]))).toBeNull();
  });

  it('rejects macro-enabled documents', () => {
    const docm = buildZip([
      { name: '[Content_Types].xml', data: Buffer.from('<Types/>') },
      { name: 'word/document.xml', data: Buffer.from('<w:document/>') },
      { name: 'word/vbaProject.bin', data: Buffer.from('macro') },
    ]);
    expect(detectFileType(docm)).toEqual({ error: 'Macro-enabled documents are not allowed' });
  });
});

describe('inspectZip (zip-bomb guard)', () => {
  it('rejects archives that would expand beyond the limit', () => {
    const bomb = buildZip([
      {
        name: 'word/document.xml',
        compressedSize: 1_000_000,
        uncompressedSize: DOCX_LIMITS.MAX_UNCOMPRESSED_BYTES + 1,
      },
    ]);
    expect(inspectZip(bomb)).toEqual({
      ok: false,
      error: 'DOCX archive expands beyond the allowed size',
    });
  });

  it('rejects suspicious compression ratios', () => {
    const bomb = buildZip([
      { name: 'word/document.xml', compressedSize: 10, uncompressedSize: 10 * 1000 },
    ]);
    expect(inspectZip(bomb)).toEqual({
      ok: false,
      error: 'DOCX archive has a suspicious compression ratio',
    });
  });

  it('rejects archives with too many entries', () => {
    const many = buildZip(
      Array.from({ length: DOCX_LIMITS.MAX_ENTRIES + 1 }, (_, i) => ({ name: `f${i}` }))
    );
    expect(inspectZip(many)).toEqual({
      ok: false,
      error: 'DOCX archive contains too many entries',
    });
  });

  it('rejects truncated / malformed archives', () => {
    expect(inspectZip(DOCX.subarray(0, DOCX.length - 10))).toMatchObject({ ok: false });
  });
});

describe('validateFile', () => {
  let dir: string;

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'file-validator-'));
  });

  afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  async function write(name: string, content: Buffer | string) {
    const file = path.join(dir, name);
    await fs.writeFile(file, content);
    return file;
  }

  it('accepts a file whose content matches its declared type and returns the detected type', async () => {
    const file = await write('ok.pdf', PDF);
    await expect(validateFile(file, 'application/pdf')).resolves.toEqual({
      valid: true,
      detected: { mimeType: MIME_TYPES.PDF, extension: '.pdf' },
    });
  });

  it('accepts the image/jpg alias for JPEG content', async () => {
    const file = await write('ok.jpg', JPEG);
    await expect(validateFile(file, 'image/jpg')).resolves.toMatchObject({ valid: true });
  });

  it('rejects content that does not match the declared type (e.g. HTML posted as a PDF)', async () => {
    const file = await write('evil.pdf', '<html><script>alert(1)</script></html>');
    await expect(validateFile(file, 'application/pdf')).resolves.toEqual({
      valid: false,
      error: 'File content does not match a supported resume format',
    });
  });

  it('rejects a real PNG declared as a PDF', async () => {
    const file = await write('mismatch.pdf', PNG);
    await expect(validateFile(file, 'application/pdf')).resolves.toEqual({
      valid: false,
      error: 'File content does not match its declared type',
    });
  });

  it('rejects an empty file', async () => {
    const file = await write('empty.pdf', '');
    await expect(validateFile(file, 'application/pdf')).resolves.toEqual({
      valid: false,
      error: 'File is empty',
    });
  });

  it('rejects a file larger than the configured maximum', async () => {
    const file = await write('big.pdf', Buffer.concat([PDF, Buffer.alloc(4096)]));
    await expect(validateFile(file, 'application/pdf')).resolves.toEqual({
      valid: false,
      error: 'File size exceeds maximum allowed size of 4096 bytes',
    });
  });

  it('rejects a missing file without leaking the server path', async () => {
    const result = await validateFile(path.join(dir, 'missing.pdf'), 'application/pdf');
    expect(result).toEqual({ valid: false, error: 'File validation failed' });
  });

  it.skipIf(process.getuid?.() === 0)('rejects an unreadable file', async () => {
    const file = await write('locked.pdf', PDF);
    await fs.chmod(file, 0o000);
    await expect(validateFile(file, 'application/pdf')).resolves.toEqual({
      valid: false,
      error: 'File validation failed',
    });
  });
});
