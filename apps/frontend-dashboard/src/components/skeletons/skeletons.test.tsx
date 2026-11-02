import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChartSkeleton, JobCardSkeleton, StatCardSkeleton, TableSkeleton } from './index';
import { CHART_SKELETON_BAR_HEIGHTS, TABLE_SKELETON_VARIANTS } from '../../constants';

describe('TableSkeleton', () => {
  it('renders 8 rows with the resumes layout plus an actions column by default', () => {
    const { container } = render(<TableSkeleton />);
    const expectedCols = TABLE_SKELETON_VARIANTS.resumes.columns.length + 1;
    expect(container.querySelectorAll('thead th')).toHaveLength(expectedCols);
    const rows = container.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(8);
    expect(rows[0].querySelectorAll('td')).toHaveLength(expectedCols);
    // last (actions) column uses the "short" width
    expect(container.querySelector('thead th:last-child .skeleton')).toHaveClass('w-16');
  });

  it('renders the matches layout without an actions column', () => {
    const { container } = render(<TableSkeleton variant="matches" rowCount={3} />);
    expect(container.querySelectorAll('thead th')).toHaveLength(
      TABLE_SKELETON_VARIANTS.matches.columns.length
    );
    expect(container.querySelectorAll('tbody tr')).toHaveLength(3);
  });

  it('renders three pill placeholders in "tags" cells and width classes elsewhere', () => {
    const { container } = render(<TableSkeleton variant="matches" rowCount={1} />);
    const cells = container.querySelectorAll('tbody td');
    // matches columns: medium, long, short, tags
    expect(cells[0].querySelector('.skeleton')).toHaveClass('w-32');
    expect(cells[1].querySelector('.skeleton')).toHaveClass('w-48');
    expect(cells[2].querySelector('.skeleton')).toHaveClass('w-16');
    expect(cells[3].querySelectorAll('.skeleton')).toHaveLength(3);
  });

  it('renders no body rows when rowCount is 0', () => {
    const { container } = render(<TableSkeleton rowCount={0} />);
    expect(container.querySelectorAll('tbody tr')).toHaveLength(0);
  });
});

describe('ChartSkeleton', () => {
  it('renders one bar per configured height with the default min height', () => {
    const { container } = render(<ChartSkeleton />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.minHeight).toBe('280px');
    const bars = root.querySelectorAll<HTMLElement>('.skeleton');
    expect(bars).toHaveLength(CHART_SKELETON_BAR_HEIGHTS.length);
    expect(Array.from(bars).map((b) => b.style.height)).toEqual(
      CHART_SKELETON_BAR_HEIGHTS.map((h) => `${h}%`)
    );
  });

  it('accepts a custom height', () => {
    const { container } = render(<ChartSkeleton height={120} />);
    expect((container.firstElementChild as HTMLElement).style.minHeight).toBe('120px');
  });
});

describe('StatCardSkeleton', () => {
  it('renders a pulsing stat card placeholder', () => {
    const { container } = render(<StatCardSkeleton />);
    expect(container.firstElementChild).toHaveClass('stat-card', 'animate-pulse');
    expect(container.querySelectorAll('.skeleton')).toHaveLength(3);
  });
});

describe('JobCardSkeleton', () => {
  it('renders a pulsing job card placeholder with five skill pills', () => {
    const { container } = render(<JobCardSkeleton />);
    expect(container.firstElementChild).toHaveClass('animate-pulse');
    expect(container.querySelectorAll('.flex-wrap .skeleton')).toHaveLength(5);
  });
});
