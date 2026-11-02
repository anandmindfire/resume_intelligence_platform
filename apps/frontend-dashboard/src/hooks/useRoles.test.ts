import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../services/analyticsService', () => ({
  analyticsService: { getRoleMatches: vi.fn() },
}));

import { analyticsService } from '../services/analyticsService';
import { useRoles } from './useRoles';

const getRoleMatches = vi.mocked(analyticsService.getRoleMatches);
const roles = [
  { id: 'r1', title: 'Frontend' },
  { id: 'r2', title: 'Backend' },
];

function response(uniqueRoles: unknown) {
  return { data: [], total: 0, page: 1, limit: 1, totalPages: 0, uniqueRoles } as never;
}

describe('useRoles', () => {
  it('requests a single match row and returns the unique roles', async () => {
    getRoleMatches.mockResolvedValue(response(roles));
    const { result } = renderHook(() => useRoles());
    expect(result.current).toEqual([]);
    await waitFor(() => expect(result.current).toEqual(roles));
    expect(getRoleMatches).toHaveBeenCalledWith(undefined, 0, 1, 1);
  });

  it('returns [] when uniqueRoles is missing', async () => {
    getRoleMatches.mockResolvedValue(response(undefined));
    const { result } = renderHook(() => useRoles());
    await waitFor(() => expect(getRoleMatches).toHaveBeenCalled());
    await Promise.resolve();
    expect(result.current).toEqual([]);
  });

  it('logs errors and keeps an empty list', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    getRoleMatches.mockRejectedValue(new Error('down'));
    const { result } = renderHook(() => useRoles());
    await waitFor(() =>
      expect(consoleSpy).toHaveBeenCalledWith('Failed to load roles:', expect.any(Error))
    );
    expect(result.current).toEqual([]);
  });

  it('ignores a response that arrives after unmount', async () => {
    let resolve!: (v: unknown) => void;
    getRoleMatches.mockReturnValue(new Promise((r) => (resolve = r)) as never);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result, unmount } = renderHook(() => useRoles());
    unmount();
    resolve(response(roles));
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current).toEqual([]);
    expect(consoleSpy).not.toHaveBeenCalled();
  });
});
