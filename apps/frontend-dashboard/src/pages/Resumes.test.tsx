import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COPY } from '../constants';
import { makeResume } from '../test/fixtures';
import type { Resume } from '../types';

vi.mock('../hooks/useResumes', () => ({ useResumes: vi.fn() }));
vi.mock('../hooks/useRoles', () => ({ useRoles: vi.fn() }));
vi.mock('../utils/csvExport', () => ({ exportResumesToCSV: vi.fn() }));
vi.mock('../services/analyticsService', () => ({ analyticsService: { getResumes: vi.fn() } }));
vi.mock('../services/resumeService', () => ({
  resumeService: {
    deleteResume: vi.fn(),
    getResumeFileUrl: (id: string) => `/files/${id}`,
  },
}));

import { useResumes } from '../hooks/useResumes';
import { useRoles } from '../hooks/useRoles';
import { exportResumesToCSV } from '../utils/csvExport';
import { analyticsService } from '../services/analyticsService';
import { resumeService } from '../services/resumeService';
import { Resumes } from './Resumes';

type HookState = ReturnType<typeof useResumes>;
const mockResumes = vi.mocked(useResumes);
const DEFAULT_FILTERS = { page: 1, limit: 10, sortBy: 'created_at', sortOrder: 'desc' as const };

function hookState(overrides: Partial<HookState> = {}): HookState {
  return {
    resumes: [makeResume({ id: 'r-1', file_name: 'jane.pdf' }), makeResume({ id: 'r-2', file_name: 'john.pdf', name: 'John' })],
    loading: false,
    error: null,
    filters: { ...DEFAULT_FILTERS },
    total: 2,
    totalPages: 1,
    updateFilters: vi.fn(),
    setPage: vi.fn(),
    setPageSize: vi.fn(),
    setSort: vi.fn(),
    refresh: vi.fn(),
    ...overrides,
  };
}

function renderWith(overrides: Partial<HookState> = {}) {
  const state = hookState(overrides);
  mockResumes.mockReturnValue(state);
  return { ...render(<Resumes />), state };
}

describe('Resumes page', () => {
  beforeEach(() => {
    mockResumes.mockReset();
    vi.mocked(useRoles).mockReturnValue([
      { id: 'role-1', title: 'Frontend' },
      { id: 'role-2', title: 'Backend' },
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the error state', () => {
    renderWith({ error: 'Server down' });
    expect(screen.getByText(COPY.ERRORS.LOAD_RESUMES)).toBeInTheDocument();
    expect(screen.getByText('Server down')).toBeInTheDocument();
    expect(screen.queryByText(COPY.PAGES.RESUMES.TITLE)).not.toBeInTheDocument();
  });

  it('shows a table skeleton on initial load', () => {
    const { container } = renderWith({ loading: true, resumes: [], total: 0 });
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(container.querySelectorAll('tbody tr')).toHaveLength(10);
    expect(screen.queryByRole('button', { name: COPY.LABELS.EXPORT_CSV })).not.toBeInTheDocument();
  });

  it('dims the table while reloading with existing results', () => {
    const { container } = renderWith({ loading: true });
    expect(container.querySelector('.opacity-60')).not.toBeNull();
    expect(screen.getByText('jane.pdf')).toBeInTheDocument();
  });

  it('renders the resume list with count and export button', () => {
    renderWith();
    expect(screen.getByText(COPY.PAGES.RESUMES.TITLE)).toBeInTheDocument();
    expect(screen.getByText('2 resumes found')).toBeInTheDocument();
    expect(screen.getByText('jane.pdf')).toBeInTheDocument();
    expect(screen.getByText('john.pdf')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: COPY.LABELS.EXPORT_CSV })).toBeInTheDocument();
    expect(screen.getAllByTitle('Download Original')[0]).toHaveAttribute('href', '/files/r-1');
  });

  it('shows an empty state with a filter hint when filters are active', () => {
    renderWith({ resumes: [], total: 0, filters: { ...DEFAULT_FILTERS, keyword: 'rust' } });
    expect(screen.getByText(COPY.EMPTY.NO_RESUMES)).toBeInTheDocument();
    expect(screen.getByText(COPY.EMPTY.TRY_FILTERS)).toBeInTheDocument();
    expect(screen.getByText('0 resumes found')).toBeInTheDocument();
  });

  // BUG: src/pages/Resumes.tsx:85 - `hasActiveFilters` checks every value in `filters`,
  // including the always-present defaults page/limit/sortBy/sortOrder, so it is always true:
  // the "Clear" button is always shown and the empty state never says "Upload resumes to get started".
  it.fails('treats the default filters as "no active filters"', () => {
    renderWith({ resumes: [], total: 0 });
    expect(screen.getByText(COPY.EMPTY.UPLOAD_TO_START)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: COPY.LABELS.CLEAR })).not.toBeInTheDocument();
  });

  it('forwards keyword, location and minimum score changes to updateFilters', () => {
    const { state } = renderWith();
    fireEvent.change(screen.getByPlaceholderText(COPY.LABELS.SEARCH_PLACEHOLDER), { target: { value: 'react' } });
    expect(state.updateFilters).toHaveBeenLastCalledWith({ keyword: 'react' });
    fireEvent.change(screen.getByPlaceholderText(COPY.LABELS.LOCATION_PLACEHOLDER), { target: { value: 'Berlin' } });
    expect(state.updateFilters).toHaveBeenLastCalledWith({ location: 'Berlin' });
    const score = screen.getByRole('spinbutton');
    fireEvent.change(score, { target: { value: '70' } });
    expect(state.updateFilters).toHaveBeenLastCalledWith({ minScore: 70 });
    fireEvent.change(score, { target: { value: '' } });
    expect(state.updateFilters).toHaveBeenLastCalledWith({ minScore: 0 });
  });

  it('reflects current filter values in the inputs', () => {
    renderWith({ filters: { ...DEFAULT_FILTERS, keyword: 'go', location: 'NYC', minScore: 40 } });
    expect(screen.getByPlaceholderText(COPY.LABELS.SEARCH_PLACEHOLDER)).toHaveValue('go');
    expect(screen.getByPlaceholderText(COPY.LABELS.LOCATION_PLACEHOLDER)).toHaveValue('NYC');
    expect(screen.getByRole('spinbutton')).toHaveValue(40);
  });

  it('lists roles and forwards role changes (empty selection clears roleId)', () => {
    const { state } = renderWith();
    const roleSelect = screen.getAllByRole('combobox')[0] as HTMLSelectElement;
    expect(within(roleSelect).getAllByRole('option').map((o) => o.textContent)).toEqual([
      COPY.LABELS.ALL_ROLES,
      'Frontend',
      'Backend',
    ]);
    fireEvent.change(roleSelect, { target: { value: 'role-2' } });
    expect(roleSelect.value).toBe('role-2');
    expect(state.updateFilters).toHaveBeenLastCalledWith({ roleId: 'role-2' });
    fireEvent.change(roleSelect, { target: { value: '' } });
    expect(state.updateFilters).toHaveBeenLastCalledWith({ roleId: undefined });
  });

  it('applies filters via refresh', () => {
    const { state } = renderWith();
    fireEvent.click(screen.getByRole('button', { name: COPY.LABELS.APPLY_FILTERS }));
    expect(state.refresh).toHaveBeenCalledTimes(1);
  });

  it('clears filters, resets the role and refreshes after a short delay', () => {
    vi.useFakeTimers();
    const { state } = renderWith({ filters: { ...DEFAULT_FILTERS, keyword: 'x' } });
    const roleSelect = screen.getAllByRole('combobox')[0] as HTMLSelectElement;
    fireEvent.change(roleSelect, { target: { value: 'role-1' } });

    fireEvent.click(screen.getByRole('button', { name: COPY.LABELS.CLEAR }));
    expect(state.updateFilters).toHaveBeenLastCalledWith({
      keyword: '',
      location: '',
      minScore: 0,
      roleId: undefined,
      page: 1,
    });
    expect(roleSelect.value).toBe('');
    expect(state.refresh).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(state.refresh).toHaveBeenCalledTimes(1);
  });

  it('changes sort order', () => {
    const { state } = renderWith();
    const sortSelect = screen.getByDisplayValue('Newest first');
    fireEvent.change(sortSelect, { target: { value: 'name-asc' } });
    expect(state.setSort).toHaveBeenCalledWith('name', 'asc');
  });

  it('defaults the sort selector when sort filters are missing', () => {
    renderWith({ filters: { page: 1, limit: 10 } });
    expect(screen.getByDisplayValue('Newest first')).toBeInTheDocument();
  });

  it('exports all matching resumes to CSV', async () => {
    const data: Resume[] = [makeResume()];
    vi.mocked(analyticsService.getResumes).mockResolvedValue({ data, total: 1, page: 1, limit: 1000, totalPages: 1 });
    renderWith({ filters: { ...DEFAULT_FILTERS, keyword: 'react', page: 3 } });
    fireEvent.click(screen.getByRole('button', { name: COPY.LABELS.EXPORT_CSV }));
    await waitFor(() => expect(exportResumesToCSV).toHaveBeenCalled());
    expect(analyticsService.getResumes).toHaveBeenCalledWith({
      ...DEFAULT_FILTERS,
      keyword: 'react',
      limit: 1000,
      page: 1,
    });
    const [exported, filename] = vi.mocked(exportResumesToCSV).mock.calls[0];
    expect(exported).toBe(data);
    expect(filename).toMatch(/^resumes_\d{4}-\d{2}-\d{2}\.csv$/);
  });

  it('opens and closes the resume detail modal from a row click', () => {
    renderWith();
    fireEvent.click(screen.getByText('john.pdf'));
    expect(screen.getByRole('heading', { name: 'john.pdf' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: COPY.LABELS.VIEW_ORIGINAL })).toHaveAttribute('href', '/files/r-2');
    fireEvent.click(screen.getByRole('button', { name: COPY.LABELS.CLOSE }));
    expect(screen.queryByRole('heading', { name: 'john.pdf' })).not.toBeInTheDocument();
  });

  describe('deleting', () => {
    it('does nothing when the user cancels the confirmation', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      const { state } = renderWith();
      fireEvent.click(screen.getAllByTitle('Delete')[0]);
      expect(window.confirm).toHaveBeenCalledWith(COPY.ERRORS.CONFIRM_DELETE);
      expect(resumeService.deleteResume).not.toHaveBeenCalled();
      expect(state.refresh).not.toHaveBeenCalled();
    });

    it('deletes and refreshes after confirmation', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      vi.mocked(resumeService.deleteResume).mockResolvedValue({});
      const { state } = renderWith();
      fireEvent.click(screen.getAllByTitle('Delete')[1]);
      await waitFor(() => expect(state.refresh).toHaveBeenCalled());
      expect(resumeService.deleteResume).toHaveBeenCalledWith('r-2');
    });

    it('closes the detail modal when the open resume is deleted', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      vi.mocked(resumeService.deleteResume).mockResolvedValue({});
      const { state } = renderWith();
      fireEvent.click(screen.getByText('john.pdf'));
      expect(screen.getByRole('heading', { name: 'john.pdf' })).toBeInTheDocument();
      // the modal overlays the table; the row's delete button is still in the DOM
      fireEvent.click(screen.getAllByTitle('Delete')[1]);
      await waitFor(() => expect(state.refresh).toHaveBeenCalled());
      expect(screen.queryByRole('heading', { name: 'john.pdf' })).not.toBeInTheDocument();
    });

    it('keeps the detail modal open when a different resume is deleted', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      vi.mocked(resumeService.deleteResume).mockResolvedValue({});
      const { state } = renderWith();
      fireEvent.click(screen.getByText('john.pdf'));
      fireEvent.click(screen.getAllByTitle('Delete')[0]);
      await waitFor(() => expect(state.refresh).toHaveBeenCalled());
      expect(screen.getByRole('heading', { name: 'john.pdf' })).toBeInTheDocument();
    });

    it('alerts when deletion fails', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(resumeService.deleteResume).mockRejectedValue(new Error('403'));
      const { state } = renderWith();
      fireEvent.click(screen.getAllByTitle('Delete')[0]);
      await waitFor(() => expect(alertSpy).toHaveBeenCalledWith(COPY.ERRORS.DELETE_RESUME));
      expect(state.refresh).not.toHaveBeenCalled();
    });
  });

  it('renders pagination for multiple pages and wires callbacks', () => {
    const { state } = renderWith({ total: 30, totalPages: 3, filters: { ...DEFAULT_FILTERS, page: 2 } });
    expect(screen.getByText('Showing 11-20 of 30')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '3' }));
    expect(state.setPage).toHaveBeenCalledWith(3);
    fireEvent.change(screen.getByLabelText('Per page:'), { target: { value: '50' } });
    expect(state.setPageSize).toHaveBeenCalledWith(50);
  });

  it('falls back to page 1 / limit 10 for pagination when filters omit them', () => {
    renderWith({ total: 30, totalPages: 3, filters: {} });
    expect(screen.getByText('Showing 1-10 of 30')).toBeInTheDocument();
  });
});
