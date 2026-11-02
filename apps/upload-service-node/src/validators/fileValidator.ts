import fs from 'fs/promises';
import { config } from '@resume-platform/config';
import type { FileValidationResult } from '../types';
import { getErrorMessage } from '../utils/errors';

export function fileTooLargeMessage(maxSize: number): string {
  return `File size exceeds maximum allowed size of ${maxSize} bytes`;
}

export async function validateFile(filePath: string): Promise<FileValidationResult> {
  try {
    const stats = await fs.stat(filePath);
    
    // Check file size
    if (stats.size > config.upload.maxSize) {
      return {
        valid: false,
        error: fileTooLargeMessage(config.upload.maxSize),
      };
    }

    // Check if file exists and is readable
    await fs.access(filePath, fs.constants.R_OK);
    
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: `File validation failed: ${getErrorMessage(error)}`,
    };
  }
}
