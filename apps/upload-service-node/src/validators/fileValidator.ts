import fs from 'fs/promises';
import { config } from '@resume-platform/config';
import type { DetectedFileType, FileValidationResult } from '../types';
import { getErrorMessage, logger } from '@resume-platform/logger';

export const MIME_TYPES = {
  PDF: 'application/pdf',
  DOCX: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  JPEG: 'image/jpeg',
  PNG: 'image/png',
} as const;

/** Client-declared aliases that mean the same type as a canonical MIME type. */
const MIME_ALIASES: Record<string, string> = {
  'image/jpg': MIME_TYPES.JPEG,
  'image/pjpeg': MIME_TYPES.JPEG,
};

const EXTENSIONS: Record<string, string> = {
  [MIME_TYPES.PDF]: '.pdf',
  [MIME_TYPES.DOCX]: '.docx',
  [MIME_TYPES.JPEG]: '.jpg',
  [MIME_TYPES.PNG]: '.png',
};

/**
 * Limits applied when inspecting a DOCX (ZIP) archive, so a small upload can't expand into gigabytes
 * once a worker unpacks it (zip bomb).
 */
export const DOCX_LIMITS = {
  MAX_ENTRIES: 1000,
  MAX_UNCOMPRESSED_BYTES: 100 * 1024 * 1024,
  MAX_COMPRESSION_RATIO: 100,
} as const;

const PDF_MAGIC = Buffer.from('%PDF-');
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const ZIP_LOCAL_HEADER = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const ZIP_EOCD_SIGNATURE = 0x06054b50;
const ZIP_CENTRAL_DIR_SIGNATURE = 0x02014b50;
const ZIP_EOCD_MIN_SIZE = 22;
const ZIP_MAX_COMMENT = 0xffff;

export function fileTooLargeMessage(maxSize: number): string {
  return `File size exceeds maximum allowed size of ${maxSize} bytes`;
}

/** Canonical form of a client-declared MIME type (lower-cased, parameters stripped, aliases resolved). */
export function normalizeMimeType(mimeType: string): string {
  const base = mimeType.split(';')[0].trim().toLowerCase();
  return MIME_ALIASES[base] ?? base;
}

/** True when the declared MIME type is on the allow-list (UPLOAD_ALLOWED_TYPES). */
export function isAllowedMimeType(mimeType: string): boolean {
  const normalized = normalizeMimeType(mimeType);
  return config.upload.allowedTypes.some((allowed) => normalizeMimeType(allowed) === normalized);
}

type ZipInspection = { ok: true; names: string[] } | { ok: false; error: string };

/**
 * Reads a ZIP central directory without extracting anything. Rejects archives that are malformed,
 * use ZIP64, hold too many entries, or would expand beyond DOCX_LIMITS.
 */
export function inspectZip(buffer: Buffer): ZipInspection {
  const searchStart = Math.max(0, buffer.length - (ZIP_EOCD_MIN_SIZE + ZIP_MAX_COMMENT));
  let eocd = -1;
  for (let i = buffer.length - ZIP_EOCD_MIN_SIZE; i >= searchStart; i--) {
    if (buffer.readUInt32LE(i) === ZIP_EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return { ok: false, error: 'Malformed DOCX archive' };

  const entryCount = buffer.readUInt16LE(eocd + 10);
  const cdSize = buffer.readUInt32LE(eocd + 12);
  const cdOffset = buffer.readUInt32LE(eocd + 16);
  if (entryCount === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    return { ok: false, error: 'Unsupported DOCX archive (ZIP64)' };
  }
  if (entryCount > DOCX_LIMITS.MAX_ENTRIES) {
    return { ok: false, error: 'DOCX archive contains too many entries' };
  }
  if (cdOffset + cdSize > eocd) return { ok: false, error: 'Malformed DOCX archive' };

  const names: string[] = [];
  let totalUncompressed = 0;
  let offset = cdOffset;
  for (let i = 0; i < entryCount; i++) {
    if (offset + 46 > eocd || buffer.readUInt32LE(offset) !== ZIP_CENTRAL_DIR_SIGNATURE) {
      return { ok: false, error: 'Malformed DOCX archive' };
    }
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) {
      return { ok: false, error: 'Unsupported DOCX archive (ZIP64)' };
    }

    totalUncompressed += uncompressedSize;
    if (totalUncompressed > DOCX_LIMITS.MAX_UNCOMPRESSED_BYTES) {
      return { ok: false, error: 'DOCX archive expands beyond the allowed size' };
    }
    if (
      compressedSize > 0 &&
      uncompressedSize / compressedSize > DOCX_LIMITS.MAX_COMPRESSION_RATIO
    ) {
      return { ok: false, error: 'DOCX archive has a suspicious compression ratio' };
    }

    names.push(buffer.toString('utf8', offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return { ok: true, names };
}

/**
 * Identifies a file from its content (magic bytes), never from the client-supplied name or MIME type.
 * Returns null for anything that isn't one of the supported resume formats.
 */
export function detectFileType(buffer: Buffer): DetectedFileType | { error: string } | null {
  const startsWith = (magic: Buffer) =>
    buffer.length >= magic.length && buffer.subarray(0, magic.length).equals(magic);

  if (startsWith(PDF_MAGIC))
    return { mimeType: MIME_TYPES.PDF, extension: EXTENSIONS[MIME_TYPES.PDF] };
  if (startsWith(PNG_MAGIC))
    return { mimeType: MIME_TYPES.PNG, extension: EXTENSIONS[MIME_TYPES.PNG] };
  if (startsWith(JPEG_MAGIC))
    return { mimeType: MIME_TYPES.JPEG, extension: EXTENSIONS[MIME_TYPES.JPEG] };

  if (startsWith(ZIP_LOCAL_HEADER)) {
    const zip = inspectZip(buffer);
    if (!zip.ok) return { error: zip.error };
    const names = new Set(zip.names.map((name) => name.toLowerCase()));
    if (!names.has('[content_types].xml') || !names.has('word/document.xml')) return null;
    // Macro-enabled documents (.docm renamed to .docx) are not accepted.
    if ([...names].some((name) => name.endsWith('vbaproject.bin'))) {
      return { error: 'Macro-enabled documents are not allowed' };
    }
    return { mimeType: MIME_TYPES.DOCX, extension: EXTENSIONS[MIME_TYPES.DOCX] };
  }

  return null;
}

/**
 * Validates a stored upload: size, readability, and that its actual content matches the declared MIME
 * type. On success returns the detected (trusted) type to persist instead of the client's claim.
 */
export async function validateFile(
  filePath: string,
  declaredMimeType: string
): Promise<FileValidationResult> {
  try {
    const stats = await fs.stat(filePath);

    if (stats.size > config.upload.maxSize) {
      return { valid: false, error: fileTooLargeMessage(config.upload.maxSize) };
    }
    if (stats.size === 0) {
      return { valid: false, error: 'File is empty' };
    }

    // Files are capped at UPLOAD_MAX_SIZE, so reading one fully is bounded.
    const content = await fs.readFile(filePath);
    const detected = detectFileType(content);
    if (!detected) {
      return { valid: false, error: 'File content does not match a supported resume format' };
    }
    if ('error' in detected) {
      return { valid: false, error: detected.error };
    }
    if (detected.mimeType !== normalizeMimeType(declaredMimeType)) {
      return { valid: false, error: 'File content does not match its declared type' };
    }
    if (!isAllowedMimeType(detected.mimeType)) {
      return { valid: false, error: `File type ${detected.mimeType} not allowed` };
    }

    return { valid: true, detected };
  } catch (error) {
    // The fs error text contains the server-side path, so it is logged, not returned to the client.
    logger.warn('File validation failed', { error: getErrorMessage(error) });
    return { valid: false, error: 'File validation failed' };
  }
}
