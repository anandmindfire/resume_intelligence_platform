import { describe, expect, it, vi } from 'vitest';

vi.mock('./apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./apiClient')>();
  return {
    ...actual,
    apiClient: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
  };
});

import { apiClient } from './apiClient';
import { resumeService, getResumeFileUrl } from './resumeService';

describe('resumeService', () => {
  it('getResume GETs /resumes/:id and returns data', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: { id: 'r-1' } });
    await expect(resumeService.getResume('r-1')).resolves.toEqual({ id: 'r-1' });
    expect(apiClient.get).toHaveBeenCalledWith('/resumes/r-1');
  });

  it('deleteResume DELETEs /upload/resumes/:id', async () => {
    vi.mocked(apiClient.delete).mockResolvedValueOnce({ data: { deleted: true } });
    await expect(resumeService.deleteResume('r-1')).resolves.toEqual({ deleted: true });
    expect(apiClient.delete).toHaveBeenCalledWith('/upload/resumes/r-1');
  });

  it('exposes getResumeFileUrl both as a named export and on the service', () => {
    expect(getResumeFileUrl('r-1')).toBe('/api/upload/resumes/r-1/file');
    expect(resumeService.getResumeFileUrl('r-2')).toBe('/api/upload/resumes/r-2/file');
  });
});
