import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoleMatchesResponse } from '../types';
import { makeRoleMatch } from '../test/fixtures';

vi.mock('../services/analyticsService', () => ({
  analyticsService: {
    getTopSkills: vi.fn(),
    getExperienceStats: vi.fn(),
    getEducationStats: vi.fn(),
    getRoleMatches: vi.fn(),
  },
}));

import { analyticsService } from '../services/analyticsService';
import { useAnalyticsPage } from './useAnalyticsPage';

const svc = vi.mocked(analyticsService);

const skills = [{ skill: 'React', count: 5 }];
const experience = { avg_years: 4.2, min_years: 1, max_years: 10 };
const education = [{ institution: 'MIT', count: 2 }];

function matchesResponse(overrides: Partial<RoleMatchesResponse> = {}): RoleMatchesResponse {
  return {
    data: [makeRoleMatch()],
    total: 1,
    page: 1,
    limit: 10,
    totalPages: 1,
    uniqueRoles: [{ id: 'role-1', title: 'Frontend Developer' }],
    ...overrides,
  };
}

async function renderLoaded() {
  const hook = renderHook(() => useAnalyticsPage());
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  await waitFor(() => expect(hook.result.current.matchesLoading).toBe(false));
  await waitFor(() => expect(svc.getRoleMatches).toHaveBeenCalled());
  return hook;
}

describe('useAnalyticsPage', () => {
  beforeEach(() => {
    svc.getTopSkills.mockResolvedValue(skills);
    svc.getExperienceStats.mockResolvedValue(experience);
    svc.getEducationStats.mockResolvedValue(education);
    svc.getRoleMatches.mockResolvedValue(matchesResponse());
  });

  it('starts in a loading state with empty data', () => {
    const { result } = renderHook(() => useAnalyticsPage());
    expect(result.current.loading).toBe(true);
    expect(result.current.skills).toEqual([]);
    expect(result.current.experience).toBeNull();
    expect(result.current.education).toEqual([]);
    expect(result.current.matches).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.matchesPage).toBe(1);
    expect(result.current.matchesLimit).toBe(10);
  });

  it('loads chart data (top 15 skills) and then role matches', async () => {
    const { result } = await renderLoaded();

    expect(svc.getTopSkills).toHaveBeenCalledWith(15);
    expect(result.current.skills).toEqual(skills);
    expect(result.current.experience).toEqual(experience);
    expect(result.current.education).toEqual(education);

    expect(svc.getRoleMatches).toHaveBeenCalledWith(undefined, 0, 1, 10);
    await waitFor(() => expect(result.current.matches).toHaveLength(1));
    expect(result.current.matchesTotal).toBe(1);
    expect(result.current.matchesTotalPages).toBe(1);
    expect(result.current.uniqueRoles).toEqual([{ id: 'role-1', title: 'Frontend Developer' }]);
  });

  it('does not request matches until charts have loaded', async () => {
    let resolveSkills!: (v: unknown) => void;
    svc.getTopSkills.mockReturnValueOnce(new Promise((r) => (resolveSkills = r)));
    const { result } = renderHook(() => useAnalyticsPage());
    expect(svc.getRoleMatches).not.toHaveBeenCalled();
    await act(async () => resolveSkills(skills));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(svc.getRoleMatches).toHaveBeenCalledTimes(1));
  });

  it('keeps defaults for chart requests that fail or return null', async () => {
    svc.getTopSkills.mockRejectedValue(new Error('boom'));
    svc.getExperienceStats.mockResolvedValue(null);
    svc.getEducationStats.mockResolvedValue(undefined);
    const { result } = await renderLoaded();
    expect(result.current.skills).toEqual([]);
    expect(result.current.experience).toBeNull();
    expect(result.current.education).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('treats a null skills payload as an empty list', async () => {
    svc.getTopSkills.mockResolvedValue(null);
    const { result } = await renderLoaded();
    expect(result.current.skills).toEqual([]);
  });

  it('reports an error when all chart requests fail', async () => {
    svc.getTopSkills.mockRejectedValue(new Error('down'));
    svc.getExperienceStats.mockRejectedValue(new Error('down'));
    svc.getEducationStats.mockRejectedValue(new Error('down'));
    const { result } = renderHook(() => useAnalyticsPage());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).not.toBeNull();
  });

  it('does not report an error when only some chart requests fail', async () => {
    svc.getTopSkills.mockRejectedValue(new Error('down'));
    const { result } = await renderLoaded();
    expect(result.current.error).toBeNull();
  });

  it('defaults uniqueRoles to [] when missing from the response', async () => {
    svc.getRoleMatches.mockResolvedValue(
      matchesResponse({ uniqueRoles: undefined as unknown as RoleMatchesResponse['uniqueRoles'] })
    );
    const { result } = await renderLoaded();
    expect(result.current.uniqueRoles).toEqual([]);
  });

  it('logs and recovers when loading matches fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    svc.getRoleMatches.mockRejectedValue(new Error('matches down'));
    const { result } = await renderLoaded();
    await waitFor(() =>
      expect(consoleSpy).toHaveBeenCalledWith('Failed to load matches:', expect.any(Error))
    );
    expect(result.current.matchesLoading).toBe(false);
    expect(result.current.matches).toEqual([]);
  });

  it('refetches matches with the selected role and resets to page 1', async () => {
    const { result } = await renderLoaded();
    act(() => result.current.setMatchesPage(3));
    await waitFor(() => expect(svc.getRoleMatches).toHaveBeenLastCalledWith(undefined, 0, 3, 10));

    act(() => result.current.setSelectedRole('role-1'));
    expect(result.current.selectedRole).toBe('role-1');
    expect(result.current.matchesPage).toBe(1);
    await waitFor(() => expect(svc.getRoleMatches).toHaveBeenLastCalledWith('role-1', 0, 1, 10));
  });

  it('refetches matches with the minimum score and resets to page 1', async () => {
    const { result } = await renderLoaded();
    act(() => result.current.setMatchesPage(2));
    act(() => result.current.setMinScore(55));
    expect(result.current.minScore).toBe(55);
    expect(result.current.matchesPage).toBe(1);
    await waitFor(() => expect(svc.getRoleMatches).toHaveBeenLastCalledWith(undefined, 55, 1, 10));
  });

  it('changes page size and resets to page 1', async () => {
    const { result } = await renderLoaded();
    act(() => result.current.setMatchesPage(4));
    act(() => result.current.setMatchesPageSize(50));
    expect(result.current.matchesLimit).toBe(50);
    expect(result.current.matchesPage).toBe(1);
    await waitFor(() => expect(svc.getRoleMatches).toHaveBeenLastCalledWith(undefined, 0, 1, 50));
  });

  it('loadAnalytics reloads chart data', async () => {
    const { result } = await renderLoaded();
    expect(svc.getTopSkills).toHaveBeenCalledTimes(1);
    await act(async () => {
      await result.current.loadAnalytics();
    });
    expect(svc.getTopSkills).toHaveBeenCalledTimes(2);
    expect(result.current.loading).toBe(false);
  });
});
