import React from 'react';
import type { ChartSkeletonProps } from '../../types/skeleton';
import { CHART_SKELETON_BAR_HEIGHTS } from '../../constants/skeleton';

export const ChartSkeleton: React.FC<ChartSkeletonProps> = ({ height = 280 }) => (
  <div
    className="flex items-end justify-around gap-4 px-4 py-6 bg-neutral-50 rounded-lg"
    style={{ minHeight: height }}
  >
    {CHART_SKELETON_BAR_HEIGHTS.map((h, i) => (
      <div key={i} className="skeleton flex-1 max-w-12 rounded-t" style={{ height: `${h}%` }} />
    ))}
  </div>
);
