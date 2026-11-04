import path from 'path';
import { randomUUID } from 'crypto';
import { config } from '@resume-platform/config';
import { UPLOADS } from '../constants';

/** Longest original file name kept for display (bytes beyond this are dropped). */
export const MAX_DISPLAY_NAME_LENGTH = 200;

function uploadsRoot(): string {
  return path.resolve(config.upload.directory || UPLOADS.DEFAULT_DIR);
}

/**
 * Name a file is stored under on disk: a random UUID plus the extension of its *detected* type.
 * The client-supplied name never reaches the filesystem, so it can't cause traversal, collisions,
 * odd characters, or a misleading extension.
 */
export function generateStoredFileName(extension = ''): string {
  const safeExt = /^\.[a-z0-9]{1,8}$/.test(extension) ? extension : '';
  return `${randomUUID()}${safeExt}`;
}

/** Name used while an upload is being received, before its type is known. */
export function generateTempFileName(): string {
  return `${randomUUID()}.part`;
}

export function getUploadPath(fileName: string): string {
  return path.join(uploadsRoot(), path.basename(fileName));
}

/**
 * Returns the absolute path if it is inside the uploads directory, otherwise null. Used before any
 * read or delete driven by a stored path (defence in depth if a DB row is ever tampered with).
 */
export function resolveInsideUploads(filePath: string): string | null {
  const root = uploadsRoot();
  const resolved = path.resolve(filePath);
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return resolved;
}

/**
 * Client-supplied file name made safe to store and echo back: no directory components, no control or
 * quoting characters, Unicode-normalized, length-limited. Only ever used for display / downloads.
 */
export function sanitizeDisplayName(originalName: string | undefined): string {
  const base = (originalName ?? '').split(/[\\/]/).pop() ?? '';
  const cleaned = base
    .normalize('NFC')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f"<>|:*?]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_DISPLAY_NAME_LENGTH);
  return cleaned && cleaned !== '.' && cleaned !== '..' ? cleaned : 'resume';
}

/**
 * Content-Disposition value that can't break out of the header: an ASCII-only fallback `filename`
 * plus an RFC 5987 `filename*` carrying the real (UTF-8) name.
 */
export function buildContentDisposition(type: 'inline' | 'attachment', fileName: string): string {
  const name = sanitizeDisplayName(fileName);
  const asciiFallback = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(name).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `${type}; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

export function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
}
