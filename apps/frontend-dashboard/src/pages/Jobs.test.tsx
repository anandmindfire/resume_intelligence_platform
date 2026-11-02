import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COPY } from '../constants';
import { makeJob, makeMatchDetail, makeResume } from '../test/fixtures';

vi.mock('../hooks/useJobs', () => ({ useJobs: vi.fn() }));

import { useJobs } from '../hooks/useJobs';
import { Jobs } from './Jobs';

type HookState = ReturnType<typeof useJobs>;
const mockHook = vi.mocked(useJobs);

const JOBS = [
  makeJob({ jobId: 'J1', title: 'Frontend Developer', domain: 'Web', location: 'Remote', skills: ['React'] }),
  makeJob({ jobId: 'J2', title: 'Backend Engineer', domain: 'Backend', location: 'Berlin, DE', skills: ['Go', 'Postgres'] }),
  makeJob({ jobId: 'J3', title: 'Data Scientist', domain: 'Data', location: 'Remote', skills: ['Python'] }),
];

function hookState(overrides: Partial<HookState> = {}): HookState {
  return {
    jobs: JOBS,
    jobMatches: { J1: makeMatchDetail({ jobId: 'J1', matchScore: 90 }) },
    loading: false,
    loadData: vi.fn(),
    loadJobMatches: vi.fn().mockResolvedValue(null),
    loadResumeForView: vi.fn(),
    selectedResume: null,
    clearSelectedResume: vi.fn(),
    ...overrides,
  };
}

function renderWith(overrides: Partial<HookState> = {}) {
  const state = hookState(overrides);
  mockHook.mockReturnValue(state);
  return { ...render(<Jobs />), state };
}

const cardTitles = () =>
  screen.queryAllByRole('heading', { level: 3 }).map((h) => h.textContent);

describe('Jobs page', () => {
  beforeEach(() => mockHook.mockReset());

  it('renders job card skeletons while loading', () => {
    const { container } = renderWith({ loading: true });
    expect(screen.getByText(COPY.PAGES.JOBS.TITLE)).toBeInTheDocument();
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(6);
    expect(cardTitles()).toEqual([]);
  });

  it('renders a card per job with match info from jobMatches', () => {
    renderWith();
    expect(cardTitles()).toEqual(['Frontend Developer', 'Backend Engineer', 'Data Scientist']);
    expect(screen.getByText('90%')).toBeInTheDocument();
    expect(screen.getByText('2 matches')).toBeInTheDocument();
  });

  it('builds unique domain and location filter options', () => {
    renderWith();
    const [domain, location] = screen.getAllByRole('combobox');
    expect(Array.from((domain as HTMLSelectElement).options).map((o) => o.text)).toEqual([
      COPY.LABELS.ALL_DOMAINS,
      'Web',
      'Backend',
      'Data',
    ]);
    expect(Array.from((location as HTMLSelectElement).options).map((o) => o.text)).toEqual([
      COPY.LABELS.ALL_LOCATIONS,
      'Remote',
      'Berlin, DE',
    ]);
  });

  it('filters by search text across title, domain and skills (case-insensitive)', () => {
    renderWith();
    const search = screen.getByPlaceholderText(COPY.LABELS.SEARCH_JOBS);
    fireEvent.change(search, { target: { value: 'backend' } });
    expect(cardTitles()).toEqual(['Backend Engineer']);
    fireEvent.change(search, { target: { value: 'DATA' } });
    expect(cardTitles()).toEqual(['Data Scientist']);
    fireEvent.change(search, { target: { value: 'postgres' } });
    expect(cardTitles()).toEqual(['Backend Engineer']);
  });

  it('filters by domain and location', () => {
    renderWith();
    const [domain, location] = screen.getAllByRole('combobox');
    fireEvent.change(location, { target: { value: 'Remote' } });
    expect(cardTitles()).toEqual(['Frontend Developer', 'Data Scientist']);
    fireEvent.change(domain, { target: { value: 'Data' } });
    expect(cardTitles()).toEqual(['Data Scientist']);
  });

  it('shows an empty state when nothing matches', () => {
    renderWith();
    fireEvent.change(screen.getByPlaceholderText(COPY.LABELS.SEARCH_JOBS), { target: { value: 'zzz' } });
    expect(screen.getByText(COPY.EMPTY.NO_JOBS)).toBeInTheDocument();
  });

  it('shows an empty state when there are no jobs', () => {
    renderWith({ jobs: [] });
    expect(screen.getByText(COPY.EMPTY.NO_JOBS)).toBeInTheDocument();
  });

  it('opens the detail modal without refetching cached matches', () => {
    const { state } = renderWith();
    fireEvent.click(screen.getByText('Frontend Developer'));
    expect(screen.getByRole('heading', { level: 2, name: 'Frontend Developer' })).toBeInTheDocument();
    expect(state.loadJobMatches).not.toHaveBeenCalled();
  });

  it('loads matches for uncached jobs when opening the modal', async () => {
    const { state } = renderWith();
    fireEvent.click(screen.getByText('Backend Engineer'));
    expect(screen.getByRole('heading', { level: 2, name: 'Backend Engineer' })).toBeInTheDocument();
    await waitFor(() => expect(state.loadJobMatches).toHaveBeenCalledWith('J2'));
  });

  it('closes the modal', () => {
    renderWith();
    fireEvent.click(screen.getByText('Frontend Developer'));
    fireEvent.click(screen.getByRole('button', { name: COPY.LABELS.CLOSE }));
    expect(screen.queryByRole('heading', { level: 2, name: 'Frontend Developer' })).not.toBeInTheDocument();
  });

  it('views a matched resume and closes the nested resume modal', () => {
    const { state, rerender } = renderWith();
    fireEvent.click(screen.getByText('Frontend Developer'));
    fireEvent.click(screen.getByText('John Roe'));
    expect(state.loadResumeForView).toHaveBeenCalledWith('r-2');

    mockHook.mockReturnValue({ ...state, selectedResume: makeResume({ id: 'r-2', file_name: 'john.pdf' }) });
    rerender(<Jobs />);
    expect(screen.getByRole('heading', { name: 'john.pdf' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: COPY.LABELS.VIEW_ORIGINAL })).toHaveAttribute(
      'href',
      '/api/upload/resumes/r-2/file'
    );
    const closeButtons = screen.getAllByRole('button', { name: COPY.LABELS.CLOSE });
    fireEvent.click(closeButtons[closeButtons.length - 1]);
    expect(state.clearSelectedResume).toHaveBeenCalled();
  });
});
