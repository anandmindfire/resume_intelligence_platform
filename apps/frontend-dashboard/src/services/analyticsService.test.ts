import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./apiClient', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

import { apiClient } from './apiClient';
import { analyticsService } from './analyticsService';

const get = vi.mocked(apiClient.get);
const post = vi.mocked(apiClient.post);

describe('analyticsService', () => {
  beforeEach(() => {
    get.mockResolvedValue({ data: { ok: true } });
    post.mockResolvedValue({ data: { exported: true } });
  });

  it('getDashboardSummary GETs the dashboard endpoint and returns data', async () => {
    await expect(analyticsService.getDashboardSummary()).resolves.toEqual({ ok: true });
    expect(get).toHaveBeenCalledWith('/analytics/dashboard');
  });

  it('getTopSkills defaults limit to 10', async () => {
    get.mockResolvedValueOnce({ data: [{ skill: 'React', count: 3 }] });
    await expect(analyticsService.getTopSkills()).resolves.toEqual([{ skill: 'React', count: 3 }]);
    expect(get).toHaveBeenCalledWith('/analytics/skills/top', { params: { limit: 10 } });
  });

  it('getTopSkills passes a custom limit', async () => {
    await analyticsService.getTopSkills(25);
    expect(get).toHaveBeenCalledWith('/analytics/skills/top', { params: { limit: 25 } });
  });

  it('getExperienceStats GETs experience stats', async () => {
    await expect(analyticsService.getExperienceStats()).resolves.toEqual({ ok: true });
    expect(get).toHaveBeenCalledWith('/analytics/experience/stats');
  });

  it('getEducationStats GETs education stats', async () => {
    await expect(analyticsService.getEducationStats()).resolves.toEqual({ ok: true });
    expect(get).toHaveBeenCalledWith('/analytics/education/stats');
  });

  describe('getRoleMatches', () => {
    it('uses defaults and omits roleId when not provided', async () => {
      await analyticsService.getRoleMatches();
      expect(get).toHaveBeenCalledWith('/analytics/matches', {
        params: { minScore: 0, page: 1, limit: 10 },
      });
    });

    it('includes roleId and custom paging when provided', async () => {
      const response = { data: [], total: 0, page: 2, limit: 5, totalPages: 0, uniqueRoles: [] };
      get.mockResolvedValueOnce({ data: response });
      await expect(analyticsService.getRoleMatches('role-1', 40, 2, 5)).resolves.toBe(response);
      expect(get).toHaveBeenCalledWith('/analytics/matches', {
        params: { minScore: 40, page: 2, limit: 5, roleId: 'role-1' },
      });
    });

    it('omits an empty roleId', async () => {
      await analyticsService.getRoleMatches('', 0, 1, 1);
      expect(get.mock.calls[0][1]).toEqual({ params: { minScore: 0, page: 1, limit: 1 } });
    });
  });

  describe('getResumes', () => {
    it('sends only defined filters', async () => {
      await analyticsService.getResumes({});
      expect(get).toHaveBeenCalledWith('/analytics/resumes', { params: {} });
    });

    it('forwards every supported filter, including falsy-but-defined values', async () => {
      const page = { data: [], total: 0, page: 1, limit: 10, totalPages: 0 };
      get.mockResolvedValueOnce({ data: page });
      const result = await analyticsService.getResumes({
        keyword: '',
        location: 'Berlin',
        minScore: 0,
        roleId: 'role-9',
        page: 3,
        limit: 20,
        sortBy: 'name',
        sortOrder: 'asc',
      });
      expect(result).toBe(page);
      expect(get).toHaveBeenCalledWith('/analytics/resumes', {
        params: {
          keyword: '',
          location: 'Berlin',
          minScore: 0,
          roleId: 'role-9',
          page: 3,
          limit: 20,
          sortBy: 'name',
          sortOrder: 'asc',
        },
      });
    });

    it('drops null/undefined filter values', async () => {
      await analyticsService.getResumes({
        keyword: undefined,
        roleId: null as unknown as string,
        page: 1,
      });
      expect(get).toHaveBeenCalledWith('/analytics/resumes', { params: { page: 1 } });
    });
  });

  it('exportResumes POSTs the resume ids', async () => {
    await expect(analyticsService.exportResumes(['a', 'b'])).resolves.toEqual({ exported: true });
    expect(post).toHaveBeenCalledWith('/analytics/export/csv', { resumeIds: ['a', 'b'] });
  });

  it('exportResumes without ids POSTs resumeIds undefined', async () => {
    await analyticsService.exportResumes();
    expect(post).toHaveBeenCalledWith('/analytics/export/csv', { resumeIds: undefined });
  });

  it('propagates request errors', async () => {
    get.mockRejectedValueOnce(new Error('network'));
    await expect(analyticsService.getDashboardSummary()).rejects.toThrow('network');
  });
});
