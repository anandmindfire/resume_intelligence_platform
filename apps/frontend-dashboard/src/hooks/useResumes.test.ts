import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeResume } from '../test/fixtures';

vi.mock('../services/analyticsService', () => ({
  analyticsService: { getResumes: vi.fn() },
}));

import { analyticsService } from '../services/analyticsService';
import { useResumes } from './useResumes';

const getResumes = vi.mocked(analyticsService.getResumes);
const DEFAULT_FILTERS = { page: 1, limit: 10, sortBy: 'created_at', sortOrder: 'desc' };

async function renderLoaded(initial?: Parameters<typeof useResumes>[0]) {
  const hook = renderHook(() => useResumes(initial));
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}

describe('useResumes', () => {
  beforeEach(() => {
    getResumes.mockResolvedValue({
      data: [makeResume()],
      total: 25,
      page: 1,
      limit: 10,
      totalPages: 3,
    });
  });

  it('starts loading and fetches with default filters', async () => {
    const { result } = renderHook(() => useResumes());
    expect(result.current.loading).toBe(true);
    expect(result.current.filters).toEqual(DEFAULT_FILTERS);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(getResumes).toHaveBeenCalledWith(DEFAULT_FILTERS);
    expect(result.current.resumes).toEqual([makeResume()]);
    expect(result.current.total).toBe(25);
    expect(result.current.totalPages).toBe(3);
    expect(result.current.error).toBeNull();
  });

  it('merges initial filters over the defaults', async () => {
    const { result } = await renderLoaded({ keyword: 'react', limit: 50 });
    expect(result.current.filters).toEqual({ ...DEFAULT_FILTERS, keyword: 'react', limit: 50 });
    expect(getResumes).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, keyword: 'react', limit: 50 });
  });

  it('exposes the error message when the request fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    getResumes.mockRejectedValueOnce(new Error('Server exploded'));
    const { result } = await renderLoaded();
    expect(result.current.error).toBe('Server exploded');
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('uses a generic message for non-Error rejections', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    getResumes.mockRejectedValueOnce('nope');
    const { result } = await renderLoaded();
    expect(result.current.error).toBe('Failed to load resumes');
  });

  it('updateFilters resets to page 1 when a search filter changes', async () => {
    const { result } = await renderLoaded();
    act(() => result.current.setPage(3));
    act(() => result.current.updateFilters({ keyword: 'node' }));
    expect(result.current.filters.page).toBe(1);
    expect(result.current.filters.keyword).toBe('node');
    await waitFor(() =>
      expect(getResumes).toHaveBeenLastCalledWith({ ...DEFAULT_FILTERS, keyword: 'node', page: 1 })
    );
  });

  it.each(['location', 'minScore', 'roleId'] as const)(
    'updateFilters resets page when %s changes',
    async (key) => {
      const { result } = await renderLoaded();
      act(() => result.current.setPage(2));
      act(() => result.current.updateFilters({ [key]: key === 'minScore' ? 10 : 'x' }));
      expect(result.current.filters.page).toBe(1);
    }
  );

  it('updateFilters keeps an explicitly provided page', async () => {
    const { result } = await renderLoaded();
    act(() => result.current.updateFilters({ keyword: 'go', page: 4 }));
    expect(result.current.filters.page).toBe(4);
  });

  it('updateFilters does not reset page for non-search keys', async () => {
    const { result } = await renderLoaded();
    act(() => result.current.setPage(2));
    act(() => result.current.updateFilters({ sortBy: 'name' }));
    expect(result.current.filters.page).toBe(2);
  });

  it('setPage changes only the page and refetches', async () => {
    const { result } = await renderLoaded();
    act(() => result.current.setPage(2));
    expect(result.current.filters).toEqual({ ...DEFAULT_FILTERS, page: 2 });
    await waitFor(() => expect(getResumes).toHaveBeenLastCalledWith({ ...DEFAULT_FILTERS, page: 2 }));
  });

  it('setPageSize changes limit and resets page', async () => {
    const { result } = await renderLoaded();
    act(() => result.current.setPage(3));
    act(() => result.current.setPageSize(50));
    expect(result.current.filters).toEqual({ ...DEFAULT_FILTERS, limit: 50, page: 1 });
  });

  it('setSort changes sorting and resets page', async () => {
    const { result } = await renderLoaded();
    act(() => result.current.setPage(3));
    act(() => result.current.setSort('name', 'asc'));
    expect(result.current.filters).toEqual({ ...DEFAULT_FILTERS, sortBy: 'name', sortOrder: 'asc' });
    await waitFor(() =>
      expect(getResumes).toHaveBeenLastCalledWith({ ...DEFAULT_FILTERS, sortBy: 'name', sortOrder: 'asc' })
    );
  });

  it('refresh refetches with the current filters', async () => {
    const { result } = await renderLoaded();
    expect(getResumes).toHaveBeenCalledTimes(1);
    act(() => result.current.refresh());
    await waitFor(() => expect(getResumes).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.loading).toBe(false));
  });
});
