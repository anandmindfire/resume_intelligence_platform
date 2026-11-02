import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * react-apexcharts relies on SVG/canvas APIs that jsdom does not implement.
 * Replace it with a lightweight stub; tests inspect the props it received via
 * `vi.mocked(Chart).mock.calls` (see src/test/chartMock.ts).
 */
vi.mock('react-apexcharts', () => ({
  default: vi.fn((props: { type?: string; height?: number | string }) =>
    createElement('div', {
      'data-testid': 'apex-chart',
      'data-type': props.type,
      'data-height': String(props.height),
    })
  ),
}));

afterEach(() => {
  cleanup();
});
