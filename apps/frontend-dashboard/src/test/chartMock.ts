import Chart from 'react-apexcharts';
import type { Mock } from 'vitest';

export interface CapturedChartProps {
  type: string;
  height: number | string;
  series: unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options: any;
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
