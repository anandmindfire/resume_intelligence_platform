import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ExperienceChart } from './ExperienceChart';
import { lastChartProps } from '../test/chartMock';

describe('ExperienceChart', () => {
  it('renders avg/min/max years as a bar series', () => {
    render(<ExperienceChart data={{ avg_years: 4.5, min_years: 1, max_years: 12 }} />);
    expect(screen.getByTestId('apex-chart')).toHaveAttribute('data-type', 'bar');
    const props = lastChartProps();
    expect(props.height).toBe(300);
    expect(props.series).toEqual([{ name: 'Years of Experience', data: [4.5, 1, 12] }]);
    expect(props.options.xaxis.categories).toEqual(['Average', 'Minimum', 'Maximum']);
  });

  it('defaults missing values to 0 and accepts a custom height', () => {
    render(
      <ExperienceChart
        data={{ avg_years: undefined, min_years: null, max_years: 0 } as never}
        height={200}
      />
    );
    const props = lastChartProps();
    expect(props.series).toEqual([{ name: 'Years of Experience', data: [0, 0, 0] }]);
    expect(props.height).toBe(200);
  });

  it('formats labels, axis and tooltip values in years', () => {
    render(<ExperienceChart data={{ avg_years: 4.5, min_years: 1, max_years: 12 }} />);
    const { options } = lastChartProps();
    expect(options.dataLabels.formatter(4.55)).toBe('4.5 years');
    expect(options.yaxis.labels.formatter(3)).toBe('3.0 yrs');
    expect(options.tooltip.y.formatter(2.25)).toBe('2.3 years');
  });
});
