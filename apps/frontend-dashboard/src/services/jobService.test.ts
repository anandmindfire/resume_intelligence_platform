import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./apiClient', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

import { apiClient } from './apiClient';
import { jobService } from './jobService';

const get = vi.mocked(apiClient.get);
const post = vi.mocked(apiClient.post);

describe('jobService', () => {
  beforeEach(() => {
    get.mockResolvedValue({ data: ['payload'] });
    post.mockResolvedValue({ data: { seeded: 5 } });
  });

  it('getJobs GETs /jobs', async () => {
    await expect(jobService.getJobs()).resolves.toEqual(['payload']);
    expect(get).toHaveBeenCalledWith('/jobs');
  });

  it('getJobsWithMatches GETs /jobs/with-matches', async () => {
    await expect(jobService.getJobsWithMatches()).resolves.toEqual(['payload']);
    expect(get).toHaveBeenCalledWith('/jobs/with-matches');
  });

  it('getJobById GETs /jobs/:id', async () => {
    await jobService.getJobById('JOB-7');
    expect(get).toHaveBeenCalledWith('/jobs/JOB-7');
  });

  it('getJobMatches defaults minScore to 0', async () => {
    await jobService.getJobMatches('JOB-7');
    expect(get).toHaveBeenCalledWith('/jobs/JOB-7/matches', { params: { minScore: 0 } });
  });

  it('getJobMatches passes a custom minScore', async () => {
    await jobService.getJobMatches('JOB-7', 60);
    expect(get).toHaveBeenCalledWith('/jobs/JOB-7/matches', { params: { minScore: 60 } });
  });

  it('seedJobs POSTs /jobs/seed', async () => {
    await expect(jobService.seedJobs()).resolves.toEqual({ seeded: 5 });
    expect(post).toHaveBeenCalledWith('/jobs/seed');
  });
});
