import { describe, expect, it, vi } from 'vitest';

vi.mock('./apiClient', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

import { apiClient } from './apiClient';
import { uploadService } from './uploadService';

const post = vi.mocked(apiClient.post);

describe('uploadService', () => {
  it('uploadSingle POSTs a multipart form with the file under "resume"', async () => {
    post.mockResolvedValueOnce({ data: { resumeId: 'r-1' } });
    const file = new File(['content'], 'cv.pdf', { type: 'application/pdf' });

    await expect(uploadService.uploadSingle(file)).resolves.toEqual({ resumeId: 'r-1' });

    expect(post).toHaveBeenCalledTimes(1);
    const [url, body, config] = post.mock.calls[0];
    expect(url).toBe('/upload/single');
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get('resume')).toBe(file);
    expect(config).toEqual({ headers: { 'Content-Type': 'multipart/form-data' } });
  });

  it('uploadMultiple POSTs the provided FormData as-is', async () => {
    const response = { total: 1, success: 1, failed: 0, results: [] };
    post.mockResolvedValueOnce({ data: response });
    const formData = new FormData();
    formData.append('resumes', new File(['x'], 'a.pdf'));

    await expect(uploadService.uploadMultiple(formData)).resolves.toBe(response);
    expect(post).toHaveBeenCalledWith('/upload/multiple', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  });

  it('propagates upload errors', async () => {
    post.mockRejectedValueOnce(new Error('413'));
    await expect(uploadService.uploadMultiple(new FormData())).rejects.toThrow('413');
  });
});
