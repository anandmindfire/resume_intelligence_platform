import { describe, expect, it, vi } from 'vitest';

vi.mock('../repositories/resumeRepository', () => ({
  resumeRepository: {
    count: vi.fn(),
    countByStatus: vi.fn(),
    findAll: vi.fn(),
    countWithFilters: vi.fn(),
    findById: vi.fn(),
  },
}));
vi.mock('../repositories/matchRepository', () => ({
  matchRepository: {
    getSummaryByRole: vi.fn(),
    findByRole: vi.fn(),
    countByRole: vi.fn(),
    getRolesWithMatches: vi.fn(),
  },
}));
vi.mock('../repositories/analyticsRepository', () => ({
  analyticsRepository: {
    getTopSkills: vi.fn(),
    getExperienceStats: vi.fn(),
    getEducationStats: vi.fn(),
  },
}));

import { analyticsService } from './analyticsService';
import { resumeRepository } from '../repositories/resumeRepository';
import { matchRepository } from '../repositories/matchRepository';
import { analyticsRepository } from '../repositories/analyticsRepository';

const resumes = vi.mocked(resumeRepository);
const matches = vi.mocked(matchRepository);
const analytics = vi.mocked(analyticsRepository);

describe('analyticsService', () => {
  it('getDashboardSummary combines totals, top 10 skills and role summary', async () => {
    resumes.count.mockResolvedValue(120);
    resumes.countByStatus.mockResolvedValue(97);
    analytics.getTopSkills.mockResolvedValue([{ skill: 'python', count: 40 }]);
    matches.getSummaryByRole.mockResolvedValue([{ role_title: 'T', match_count: '3', avg_score: '50' }]);

    await expect(analyticsService.getDashboardSummary()).resolves.toEqual({
      totalResumes: 120,
      processedResumes: 97,
      topSkills: [{ skill: 'python', count: 40 }],
      roleMatches: [{ role_title: 'T', match_count: '3', avg_score: '50' }],
    });
    expect(resumes.countByStatus).toHaveBeenCalledWith('matched');
    expect(analytics.getTopSkills).toHaveBeenCalledWith(10);
  });

  it('delegates simple statistics to the analytics repository', async () => {
    analytics.getTopSkills.mockResolvedValue([]);
    analytics.getExperienceStats.mockResolvedValue({ avg_years: 1, min_years: 0, max_years: 2 });
    analytics.getEducationStats.mockResolvedValue([]);

    await analyticsService.getTopSkills(25);
    expect(analytics.getTopSkills).toHaveBeenCalledWith(25);
    await expect(analyticsService.getExperienceStats()).resolves.toEqual({ avg_years: 1, min_years: 0, max_years: 2 });
    await analyticsService.getEducationStats();
    expect(analytics.getEducationStats).toHaveBeenCalledWith(10);
  });

  describe('getRoleMatches', () => {
    it('pages through matches and reports totals and filterable roles', async () => {
      matches.findByRole.mockResolvedValue([{ id: 'm1' }]);
      matches.countByRole.mockResolvedValue(45);
      matches.getRolesWithMatches.mockResolvedValue([{ id: 'r', title: 'T' }]);

      const result = await analyticsService.getRoleMatches('role-1', 60, { page: 3, limit: 10 });

      expect(matches.findByRole).toHaveBeenCalledWith('role-1', 60, 10, 20);
      expect(matches.countByRole).toHaveBeenCalledWith('role-1', 60);
      expect(matches.getRolesWithMatches).toHaveBeenCalledWith(60);
      expect(result).toEqual({
        data: [{ id: 'm1' }],
        total: 45,
        page: 3,
        limit: 10,
        totalPages: 5,
        uniqueRoles: [{ id: 'r', title: 'T' }],
      });
    });

    it('defaults to page 1 of 100 and reports at least one page', async () => {
      matches.findByRole.mockResolvedValue([]);
      matches.countByRole.mockResolvedValue(0);
      matches.getRolesWithMatches.mockResolvedValue([]);

      const result = await analyticsService.getRoleMatches();

      expect(matches.findByRole).toHaveBeenCalledWith(undefined, 0, 100, 0);
      expect(result).toMatchObject({ page: 1, limit: 100, totalPages: 1 });
    });
  });

  describe('getResumes', () => {
    it('pages and sorts with the given options', async () => {
      resumes.findAll.mockResolvedValue([{ id: 'r1' }]);
      resumes.countWithFilters.mockResolvedValue(21);
      const filters = { keyword: 'jane' };

      const result = await analyticsService.getResumes(filters, { page: 2, limit: 10, sortBy: 'name', sortOrder: 'asc' });

      expect(resumes.findAll).toHaveBeenCalledWith(filters, 10, 10, 'name', 'asc');
      expect(resumes.countWithFilters).toHaveBeenCalledWith(filters);
      expect(result).toEqual({ data: [{ id: 'r1' }], total: 21, page: 2, limit: 10, totalPages: 3 });
    });

    it('defaults to the newest 100 resumes', async () => {
      resumes.findAll.mockResolvedValue([]);
      resumes.countWithFilters.mockResolvedValue(0);

      const result = await analyticsService.getResumes({});

      expect(resumes.findAll).toHaveBeenCalledWith({}, 100, 0, 'created_at', 'desc');
      expect(result).toMatchObject({ page: 1, limit: 100, totalPages: 1 });
    });
  });

  it('getResume looks up by id', async () => {
    resumes.findById.mockResolvedValue({ id: 'r1' });
    await expect(analyticsService.getResume('r1')).resolves.toEqual({ id: 'r1' });
    expect(resumes.findById).toHaveBeenCalledWith('r1');
  });

  describe('exportResumesToCSV', () => {
    const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

    it('returns up to 1000 resumes when no ids are given', async () => {
      resumes.findAll.mockResolvedValue(rows);

      await expect(analyticsService.exportResumesToCSV()).resolves.toEqual(rows);
      await expect(analyticsService.exportResumesToCSV([])).resolves.toEqual(rows);
      expect(resumes.findAll).toHaveBeenCalledWith({}, 1000);
    });

    it('returns only the requested resumes', async () => {
      resumes.findAll.mockResolvedValue(rows);
      await expect(analyticsService.exportResumesToCSV(['c', 'a', 'zzz'])).resolves.toEqual([{ id: 'a' }, { id: 'c' }]);
    });
  });
});
