import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EducationBarChart } from './EducationBarChart';
import { chartRenderCount, lastChartProps } from '../test/chartMock';

describe('EducationBarChart', () => {
  it('renders an empty message for empty data', () => {
    render(<EducationBarChart data={[]} />);
    expect(screen.getByText('No education data available')).toBeInTheDocument();
    expect(chartRenderCount()).toBe(0);
  });

  it('renders a bar chart with institution categories and counts', () => {
    render(
      <EducationBarChart
        data={[
          { institution: 'MIT', count: 4 },
          { institution: 'Stanford', count: 2 },
        ]}
      />
    );
    expect(screen.getByTestId('apex-chart')).toHaveAttribute('data-type', 'bar');
    const props = lastChartProps();
    expect(props.type).toBe('bar');
    expect(props.height).toBe(300);
    expect(props.series).toEqual([{ name: 'Resume Count', data: [4, 2] }]);
    expect(props.options.xaxis.categories).toEqual(['MIT', 'Stanford']);
  });

  it('truncates long names, labels missing ones "Unknown" and caps at 10 bars', () => {
    const data = [
      { institution: 'International Institute of Technology', count: 9 },
      { institution: '', count: 8 },
      ...Array.from({ length: 10 }, (_, i) => ({ institution: `U${i}`, count: i })),
    ];
    render(<EducationBarChart data={data} height={500} />);
    const props = lastChartProps();
    const categories = props.options.xaxis.categories as string[];
    expect(categories).toHaveLength(10);
    expect(categories[0]).toBe('International Instit...');
    expect(categories[1]).toBe('Unknown');
    expect(categories[2]).toBe('U0');
    expect(props.height).toBe(500);
  });

  it('keeps names of exactly 20 characters intact', () => {
    render(<EducationBarChart data={[{ institution: 'A'.repeat(20), count: 1 }]} />);
    expect(lastChartProps().options.xaxis.categories).toEqual(['A'.repeat(20)]);
  });

  it('formats data labels as plain numbers', () => {
    render(<EducationBarChart data={[{ institution: 'MIT', count: 4 }]} />);
    expect(lastChartProps().options.dataLabels.formatter(4)).toBe('4');
  });
});
