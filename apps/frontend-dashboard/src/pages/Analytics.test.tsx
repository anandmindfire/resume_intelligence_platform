import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COPY } from '../constants';
import { makeRoleMatch } from '../test/fixtures';
import { chartRenderCount } from '../test/chartMock';

vi.mock('../hooks/useAnalyticsPage', () => ({ useAnalyticsPage: vi.fn() }));

import { useAnalyticsPage } from '../hooks/useAnalyticsPage';
import { Analytics } from './Analytics';

type HookState = ReturnType<typeof useAnalyticsPage>;

function hookState(overrides: Partial<HookState> = {}): HookState {
  return {
    skills: [
      { skill: 'React', count: 5 },
      { skill: 'Node', count: 2 },
    ],
    experience: { avg_years: 4.25, min_years: 1, max_years: 10 },
    education: [{ institution: 'MIT', count: 3 }],
    matches: [makeRoleMatch()],
    uniqueRoles: [
      { id: 'role-1', title: 'Frontend Developer' },
      { id: 'role-2', title: 'Backend Developer' },
    ],
    matchesTotal: 1234,
    matchesPage: 1,
    matchesTotalPages: 1,
    matchesLimit: 10,
    selectedRole: '',
    setSelectedRole: vi.fn(),
    minScore: 0,
    setMinScore: vi.fn(),
    setMatchesPage: vi.fn(),
    setMatchesPageSize: vi.fn(),
    loading: false,
    matchesLoading: false,
    error: null,
    loadAnalytics: vi.fn(),
    ...overrides,
  };
}

const mockHook = vi.mocked(useAnalyticsPage);

function renderWith(overrides: Partial<HookState> = {}) {
  const state = hookState(overrides);
  mockHook.mockReturnValue(state);
  return { ...render(<Analytics />), state };
}

describe('Analytics page', () => {
  beforeEach(() => mockHook.mockReset());

  it('renders the error state with a retry button', () => {
    const { state } = renderWith({ error: 'Kaboom' });
    expect(screen.getByText(COPY.ERRORS.SOMETHING_WRONG)).toBeInTheDocument();
    expect(screen.getByText('Kaboom')).toBeInTheDocument();
    expect(screen.queryByText(COPY.PAGES.ANALYTICS.TITLE)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: COPY.LABELS.RETRY }));
    expect(state.loadAnalytics).toHaveBeenCalledTimes(1);
  });

  it('renders skeletons while loading', () => {
    const { container } = renderWith({ loading: true, matchesLoading: true });
    expect(screen.getByText(COPY.PAGES.ANALYTICS.TITLE)).toBeInTheDocument();
    expect(container.querySelectorAll('.stat-card.animate-pulse')).toHaveLength(4);
    expect(screen.queryByText(COPY.STATS.AVG_EXPERIENCE)).not.toBeInTheDocument();
    expect(screen.queryByTestId('apex-chart')).not.toBeInTheDocument();
    expect(screen.queryByText(COPY.CHARTS.EXPERIENCE_STATS)).not.toBeInTheDocument();
    // matches table skeleton
    expect(container.querySelectorAll('table tbody tr')).toHaveLength(8);
  });

  it('renders stat cards from loaded data', () => {
    renderWith();
    const card = (title: string) =>
      screen.getByRole('heading', { level: 3, name: title }).closest('.stat-card') as HTMLElement;
    expect(within(card(COPY.STATS.AVG_EXPERIENCE)).getByText('4.3')).toBeInTheDocument();
    expect(within(card(COPY.STATS.TOP_SKILLS)).getByText('2')).toBeInTheDocument();
    expect(within(card(COPY.STATS.UNIVERSITIES)).getByText('1')).toBeInTheDocument();
    expect(within(card(COPY.STATS.ROLE_MATCHES)).getByText('1,234')).toBeInTheDocument();
  });

  it('shows "-" for average experience when unavailable and hides the experience chart', () => {
    renderWith({ experience: null });
    const card = screen
      .getByRole('heading', { level: 3, name: COPY.STATS.AVG_EXPERIENCE })
      .closest('.stat-card') as HTMLElement;
    expect(within(card).getByText('-')).toBeInTheDocument();
    expect(screen.queryByText(COPY.CHARTS.EXPERIENCE_STATS)).not.toBeInTheDocument();
  });

  it('renders the skills pie, education bar and experience charts', () => {
    renderWith();
    const types = screen.getAllByTestId('apex-chart').map((c) => c.getAttribute('data-type'));
    expect(types).toEqual(['pie', 'bar', 'bar']);
    expect(screen.getByText(COPY.CHARTS.EXPERIENCE_STATS)).toBeInTheDocument();
  });

  it('hides the experience chart when all values are zero', () => {
    renderWith({ experience: { avg_years: 0, min_years: 0, max_years: 0 } });
    expect(screen.queryByText(COPY.CHARTS.EXPERIENCE_STATS)).not.toBeInTheDocument();
    expect(chartRenderCount()).toBe(2);
  });

  it('shows empty states for missing skills and education', () => {
    renderWith({ skills: [], education: [] });
    expect(screen.getByText(COPY.EMPTY.NO_SKILLS)).toBeInTheDocument();
    expect(screen.getByText(COPY.EMPTY.NO_EDUCATION)).toBeInTheDocument();
  });

  it('renders role options and reports role changes', () => {
    const { state } = renderWith({ selectedRole: 'role-2' });
    const select = screen.getAllByRole('combobox')[0] as HTMLSelectElement;
    expect(select.value).toBe('role-2');
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual([
      COPY.LABELS.ALL_ROLES,
      'Frontend Developer',
      'Backend Developer',
    ]);
    fireEvent.change(select, { target: { value: 'role-1' } });
    expect(state.setSelectedRole).toHaveBeenCalledWith('role-1');
  });

  it('reports minimum score changes, treating invalid input as 0', () => {
    const { state } = renderWith({ minScore: 10 });
    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    expect(input.value).toBe('10');
    fireEvent.change(input, { target: { value: '65' } });
    expect(state.setMinScore).toHaveBeenLastCalledWith(65);
    fireEvent.change(input, { target: { value: '' } });
    expect(state.setMinScore).toHaveBeenLastCalledWith(0);
  });

  it('renders match rows with name fallbacks, score classes and skills', () => {
    renderWith({
      matches: [
        makeRoleMatch({ name: 'Alice', match_score: 85, matched_skills: ['A', 'B', 'C', 'D', 'E'] }),
        makeRoleMatch({ name: undefined, file_name: 'bob.pdf', match_score: 55, matched_skills: [] }),
        makeRoleMatch({
          role_title: '',
          name: undefined,
          file_name: undefined,
          match_score: '20.00',
          matched_skills: undefined as unknown as string[],
        }),
      ],
    });
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);

    expect(within(rows[0]).getByText('Alice')).toBeInTheDocument();
    expect(within(rows[0]).getByText('85%')).toHaveClass('match-score-high');
    expect(within(rows[0]).getByText('C')).toBeInTheDocument();
    expect(within(rows[0]).queryByText('D')).not.toBeInTheDocument();
    expect(within(rows[0]).getByText('+2')).toBeInTheDocument();

    expect(within(rows[1]).getByText('bob.pdf')).toBeInTheDocument();
    expect(within(rows[1]).getByText('55%')).toHaveClass('match-score-medium');
    expect(within(rows[1]).getByText(COPY.LABELS.NO_SKILLS_MATCHED)).toBeInTheDocument();

    expect(within(rows[2]).getByText('-')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Unknown Candidate')).toBeInTheDocument();
    expect(within(rows[2]).getByText('20%')).toHaveClass('match-score-low');
    expect(within(rows[2]).getByText(COPY.LABELS.NO_SKILLS_MATCHED)).toBeInTheDocument();
  });

  it('displays a sub-1% score without re-normalising it (0.8 => 1%)', () => {
    renderWith({ matches: [makeRoleMatch({ match_score: 0.8 })] });
    const row = screen.getAllByRole('row')[1];
    expect(within(row).getByText('1%')).toBeInTheDocument();
  });

  it('hides pagination for a single page', () => {
    renderWith();
    expect(screen.queryByText(/^Showing/)).not.toBeInTheDocument();
  });

  it('renders pagination for multiple pages and wires its callbacks', () => {
    const { state } = renderWith({ matchesTotal: 30, matchesTotalPages: 3, matchesPage: 1 });
    expect(screen.getByText('Showing 1-10 of 30')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    expect(state.setMatchesPage).toHaveBeenCalledWith(2);
    fireEvent.change(screen.getByLabelText('Per page:'), { target: { value: '20' } });
    expect(state.setMatchesPageSize).toHaveBeenCalledWith(20);
  });

  it('shows the generic empty state when there are no matches', () => {
    renderWith({ matches: [] });
    expect(screen.getByText(COPY.EMPTY.NO_ROLE_MATCHES)).toBeInTheDocument();
    expect(screen.getByText(COPY.EMPTY.NO_ROLE_MATCHES_YET)).toBeInTheDocument();
  });

  it('suggests changing the filter when a role is selected and nothing matches', () => {
    renderWith({ matches: [], selectedRole: 'role-1' });
    expect(screen.getByText(COPY.EMPTY.NO_ROLE_MATCHES_FILTER)).toBeInTheDocument();
  });
});
