import { describe, expect, it } from 'vitest';
import * as common from './common';
import * as components from './index';

describe('component barrels', () => {
  it('common barrel exports the shared components', () => {
    expect(Object.keys(common).sort()).toEqual(
      ['Card', 'EmptyState', 'Pagination', 'StatCard', 'StatusBadge']
    );
  });

  it('components barrel re-exports common, loading and skeleton components', () => {
    expect(Object.keys(components).sort()).toEqual(
      [
        'Card',
        'ChartSkeleton',
        'EmptyState',
        'JobCardSkeleton',
        'Loading',
        'Pagination',
        'StatCard',
        'StatCardSkeleton',
        'StatusBadge',
        'TableSkeleton',
      ]
    );
  });
});
