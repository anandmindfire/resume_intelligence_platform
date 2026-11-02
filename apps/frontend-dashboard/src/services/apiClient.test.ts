import { describe, expect, it } from 'vitest';
import { apiClient, getResumeFileUrl } from './apiClient';
import { API_BASE_URL } from '../constants';

describe('apiClient', () => {
  it('uses the configured base URL (defaults to /api)', () => {
    expect(API_BASE_URL).toBe('/api');
    expect(apiClient.defaults.baseURL).toBe('/api');
  });

  it('sends JSON by default', () => {
    expect(apiClient.defaults.headers['Content-Type']).toBe('application/json');
  });
});

describe('getResumeFileUrl', () => {
  it('builds the absolute file URL for a resume', () => {
    expect(getResumeFileUrl('abc-123')).toBe('/api/upload/resumes/abc-123/file');
  });
});
