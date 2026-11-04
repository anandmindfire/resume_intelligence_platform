import type { QueueJobData } from '@resume-platform/queue-lib';

export interface UploadResponse {
  resumeId: string;
  fileName: string;
  status: 'uploaded' | 'failed';
  message?: string;
}

export interface BulkUploadResponse {
  total: number;
  success: number;
  failed: number;
  results: UploadResult[];
}

export interface UploadResult {
  resumeId?: string;
  fileName: string;
  status: 'uploaded' | 'failed' | 'success' | 'error';
  error?: string;
}

/** A file type identified from the file's content (magic bytes), not from client-supplied metadata. */
export interface DetectedFileType {
  mimeType: string;
  extension: string;
}

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  /** Present when valid: the type to persist and hand to workers. */
  detected?: DetectedFileType;
}

// Alias for backward compatibility
export type ValidationResult = FileValidationResult;

export interface ResumeRecord {
  id: string;
  file_name: string;
  file_path: string;
  mime_type: string;
  file_size: number;
  status: string;
  created_at?: Date;
  updated_at?: Date;
}

export interface OCRJobData extends QueueJobData {
  resumeId: string;
  filePath: string;
  fileName: string;
  mimeType: string;
}
