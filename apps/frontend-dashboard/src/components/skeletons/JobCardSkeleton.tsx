import React from 'react';

export const JobCardSkeleton: React.FC = () => (
  <div className="bg-white rounded-xl border border-neutral-200 p-6 animate-pulse">
    <div className="flex items-start justify-between mb-4">
      <div className="flex-1">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 bg-neutral-200 rounded-lg" />
          <div className="flex-1">
            <div className="skeleton h-6 w-48 mb-2" />
            <div className="skeleton h-5 w-20 rounded-full" />
          </div>
        </div>
      </div>
      <div className="skeleton h-8 w-12" />
    </div>

    <div className="space-y-3 mb-4">
      <div className="flex items-center gap-2">
        <div className="skeleton h-4 w-4 rounded" />
        <div className="skeleton h-4 w-32" />
      </div>
      <div className="flex items-center gap-2">
        <div className="skeleton h-4 w-4 rounded" />
        <div className="skeleton h-4 w-24" />
      </div>
    </div>

    <div className="mb-4">
      <div className="skeleton h-4 w-28 mb-2" />
      <div className="flex flex-wrap gap-2">
        <div className="skeleton h-6 w-16 rounded" />
        <div className="skeleton h-6 w-20 rounded" />
        <div className="skeleton h-6 w-14 rounded" />
        <div className="skeleton h-6 w-16 rounded" />
        <div className="skeleton h-6 w-12 rounded" />
      </div>
    </div>

    <div className="flex items-center justify-between pt-4 border-t border-neutral-100">
      <div className="skeleton h-4 w-24" />
      <div className="skeleton h-4 w-24" />
    </div>
  </div>
);
