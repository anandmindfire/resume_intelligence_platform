import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MOCK_JOBS } from '../data/mockJobs';
import { makeMatchDetail, makeResume } from '../test/fixtures';

vi.mock('../services/jobService', () => ({
  jobService: { getJobsWithMatches: vi.fn(), getJobMatches: vi.fn() },
}));
vi.mock('../services/resumeService', () => ({
  resumeService: { getResume: vi.fn() },
}));

import { jobService } from '../services/jobService';
import { resumeService } from '../services/resumeService';
import { useJobs } from './useJobs';

const jobs = vi.mocked(jobService);
const resumes = vi.mocked(resumeService);

async function renderLoaded() {
  const hook = renderHook(() => useJobs());
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}

describe('useJobs', () => {
  beforeEach(() => {
    jobs.getJobsWithMatches.mockResolvedValue([
      {
        id: 'J1',
        title: 'Backend',
        domain: 'Backend',
        requiredExperience: 3,
        location: 'Berlin',
        requiredSkills: ['Node'],
        keywords: ['api'],
      },
      { id: 'J2', title: 'Generalist' },
    ]);
    jobs.getJobMatches.mockImplementation(async (id: string) =>
      id === 'J1' ? makeMatchDetail({ jobId: 'J1' }) : null
    );
  });

  it('shows mock jobs while loading', () => {
    const { result } = renderHook(() => useJobs());
    expect(result.current.loading).toBe(true);
    expect(result.current.jobs).toBe(MOCK_JOBS);
    expect(result.current.selectedResume).toBeNull();
  });

  it('maps API jobs to the UI shape with sensible defaults', async () => {
    const { result } = await renderLoaded();
    expect(result.current.jobs).toEqual([
      {
        jobId: 'J1',
        title: 'Backend',
        domain: 'Backend',
        experienceRange: '3+ years',
        location: 'Berlin',
        skills: ['Node'],
        keywords: ['api'],
      },
      {
        jobId: 'J2',
        title: 'Generalist',
        domain: 'General',
        experienceRange: 'Not specified',
        location: 'Not specified',
        skills: [],
        keywords: [],
      },
    ]);
  });

  it('loads match details for each job, skipping empty and failed ones', async () => {
    jobs.getJobMatches.mockImplementation(async (id: string) => {
      if (id === 'J2') throw new Error('nope');
      return makeMatchDetail({ jobId: id });
    });
    const { result } = await renderLoaded();
    expect(jobs.getJobMatches).toHaveBeenCalledWith('J1');
    expect(jobs.getJobMatches).toHaveBeenCalledWith('J2');
    expect(Object.keys(result.current.jobMatches)).toEqual(['J1']);
  });

  it('skips null match details', async () => {
    const { result } = await renderLoaded();
    expect(result.current.jobMatches).toEqual({ J1: makeMatchDetail({ jobId: 'J1' }) });
  });

  it('falls back to mock jobs when the jobs API fails', async () => {
    jobs.getJobsWithMatches.mockRejectedValue(new Error('down'));
    jobs.getJobMatches.mockResolvedValue(null);
    const { result } = await renderLoaded();
    expect(result.current.jobs).toEqual(MOCK_JOBS);
    expect(jobs.getJobMatches).toHaveBeenCalledTimes(MOCK_JOBS.length);
  });

  it('falls back to mock jobs when the API returns a non-array payload', async () => {
    jobs.getJobsWithMatches.mockResolvedValue({ data: [] });
    jobs.getJobMatches.mockResolvedValue(null);
    const { result } = await renderLoaded();
    expect(result.current.jobs).toEqual(MOCK_JOBS);
  });

  describe('loadJobMatches', () => {
    it('returns cached details without refetching', async () => {
      const { result } = await renderLoaded();
      jobs.getJobMatches.mockClear();
      let detail: unknown;
      await act(async () => {
        detail = await result.current.loadJobMatches('J1');
      });
      expect(detail).toEqual(makeMatchDetail({ jobId: 'J1' }));
      expect(jobs.getJobMatches).not.toHaveBeenCalled();
    });

    it('fetches and caches details for an uncached job', async () => {
      const { result } = await renderLoaded();
      const fresh = makeMatchDetail({ jobId: 'J2', matchScore: 50 });
      jobs.getJobMatches.mockResolvedValueOnce(fresh);
      let detail: unknown;
      await act(async () => {
        detail = await result.current.loadJobMatches('J2');
      });
      expect(detail).toBe(fresh);
      expect(jobs.getJobMatches).toHaveBeenLastCalledWith('J2');
      expect(result.current.jobMatches.J2).toBe(fresh);
    });

    it('returns null when the API returns nothing', async () => {
      const { result } = await renderLoaded();
      let detail: unknown = 'unset';
      await act(async () => {
        detail = await result.current.loadJobMatches('J2');
      });
      expect(detail).toBeNull();
      expect(result.current.jobMatches.J2).toBeUndefined();
    });

    it('logs and returns null on failure', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { result } = await renderLoaded();
      jobs.getJobMatches.mockRejectedValueOnce(new Error('fail'));
      let detail: unknown = 'unset';
      await act(async () => {
        detail = await result.current.loadJobMatches('J2');
      });
      expect(detail).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith('Failed to load matches for job J2:', expect.any(Error));
    });
  });

  describe('selected resume', () => {
    it('loads a resume for viewing and clears it', async () => {
      const resume = makeResume();
      resumes.getResume.mockResolvedValueOnce(resume);
      const { result } = await renderLoaded();
      await act(async () => {
        await result.current.loadResumeForView('r-1');
      });
      expect(resumes.getResume).toHaveBeenCalledWith('r-1');
      expect(result.current.selectedResume).toBe(resume);

      act(() => result.current.clearSelectedResume());
      expect(result.current.selectedResume).toBeNull();
    });

    it('logs and keeps the previous selection when loading fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      resumes.getResume.mockRejectedValueOnce(new Error('404'));
      const { result } = await renderLoaded();
      await act(async () => {
        await result.current.loadResumeForView('missing');
      });
      expect(result.current.selectedResume).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith('Failed to load resume:', expect.any(Error));
    });
  });

  it('loadData can be re-invoked to refresh', async () => {
    const { result } = await renderLoaded();
    expect(jobs.getJobsWithMatches).toHaveBeenCalledTimes(1);
    await act(async () => {
      await result.current.loadData();
    });
    expect(jobs.getJobsWithMatches).toHaveBeenCalledTimes(2);
  });
});
