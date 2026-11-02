import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SkillsPieChart } from './SkillsPieChart';
import { chartRenderCount, lastChartProps } from '../test/chartMock';

const data = [
  { skill: 'React', count: 6 },
  { skill: 'Node', count: 3 },
  { skill: 'Go', count: 1 },
];

describe('SkillsPieChart', () => {
  it('renders an empty message and no chart for empty data', () => {
    render(<SkillsPieChart data={[]} />);
    expect(screen.getByText('No data available')).toBeInTheDocument();
    expect(screen.queryByTestId('apex-chart')).not.toBeInTheDocument();
    expect(chartRenderCount()).toBe(0);
  });

  it('renders a pie chart with labels, colours and series from the data', () => {
    render(<SkillsPieChart data={data} />);
    expect(screen.getByTestId('apex-chart')).toHaveAttribute('data-type', 'pie');
    const props = lastChartProps();
    expect(props.type).toBe('pie');
    expect(props.height).toBe(400);
    expect(props.series).toEqual([6, 3, 1]);
    expect(props.options.labels).toEqual(['React', 'Node', 'Go']);
    expect(props.options.colors).toEqual(['#6366f1', '#10b981', '#f59e0b']);
    expect(props.options.chart.type).toBe('pie');
    expect(props.options.legend.position).toBe('bottom');
  });

  it('respects limit and height props', () => {
    render(<SkillsPieChart data={data} limit={2} height={250} />);
    const props = lastChartProps();
    expect(props.series).toEqual([6, 3]);
    expect(props.options.labels).toEqual(['React', 'Node']);
    expect(props.height).toBe(250);
  });

  it('formats data labels as one-decimal percentages', () => {
    render(<SkillsPieChart data={data} />);
    expect(lastChartProps().options.dataLabels.formatter(33.333)).toBe('33.3%');
  });

  it('formats tooltips with resume counts and share of the displayed total', () => {
    render(<SkillsPieChart data={data} />);
    expect(lastChartProps().options.tooltip.y.formatter(6)).toBe('6 resumes (60.0%)');
  });
});
