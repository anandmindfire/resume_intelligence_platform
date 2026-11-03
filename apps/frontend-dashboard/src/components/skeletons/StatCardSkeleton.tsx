import React from 'react';

export const StatCardSkeleton: React.FC = () => (
  <div className="stat-card border-l-neutral-300 bg-gradient-to-br from-neutral-50 to-white animate-pulse">
    <div className="flex items-start justify-between mb-4">
      <div className="skeleton h-4 w-28" />
      <div className="w-9 h-9 rounded-lg bg-neutral-200" />
    </div>
    <div className="mb-2">
      <div className="skeleton h-10 w-16 mb-2" />
      <div className="skeleton h-3 w-24" />
    </div>
  </div>
);
