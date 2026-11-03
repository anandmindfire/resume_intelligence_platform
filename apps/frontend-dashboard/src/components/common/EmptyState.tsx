import React from 'react';
import type { EmptyStateProps } from '../../types';

export const EmptyState: React.FC<EmptyStateProps> = ({ icon = '📄', title, message, action }) => (
  <div className="text-center py-16">
    <div className="text-7xl mb-6 opacity-40 transform hover:scale-110 transition-transform duration-300">
      {icon}
    </div>
    <p className="text-xl font-bold text-neutral-800 mb-2">{title}</p>
    {message && <p className="text-neutral-500 mb-6 max-w-md mx-auto">{message}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);
