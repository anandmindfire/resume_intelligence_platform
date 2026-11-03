import Chart from 'react-apexcharts';
import type { Mock } from 'vitest';

/**
 * Narrow structural shape of the subset of ApexOptions our charts configure and
 * our tests assert on. `ApexOptions` itself marks everything optional, which would
 * force non-null assertions/optional chaining at every call site in tests; this
 * mirrors only what the stubbed Chart actually receives in practice.
 */
export interface CapturedChartOptions {
  chart: { type: string };
  labels: string[];
  colors: string[];
  legend: { position: string };
  dataLabels: { formatter: (val: number) => string };
  tooltip: { y: { formatter: (val: number) => string } };
  xaxis: { categories: unknown[] };
  yaxis: { labels: { formatter: (val: number) => string } };
}

export interface CapturedChartProps {
  type: string;
  height: number | string;
  series: unknown;
  options: CapturedChartOptions;
}

/** Returns the props passed to the most recent render of the stubbed Chart. */
export function lastChartProps(): CapturedChartProps {
  const mock = Chart as unknown as Mock;
  const calls = mock.mock.calls;
  if (calls.length === 0) throw new Error('Chart stub was never rendered');
  return calls[calls.length - 1][0] as CapturedChartProps;
}

export function chartRenderCount(): number {
  return (Chart as unknown as Mock).mock.calls.length;
}
