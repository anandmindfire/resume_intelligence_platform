import React from 'react';
import type { CardProps } from '../../types';

export const Card: React.FC<CardProps> = ({
  children,
  title,
  className = '',
  headerAction,
  description,
  style,
}) => (
  <div className={`card ${className} group`} style={style}>
    {(title || headerAction || description) && (
      <div className="mb-6 pb-4 border-b border-neutral-100">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            {title && (
              <h2 className="text-2xl font-bold text-neutral-900 mb-1 group-hover:text-primary-600 transition-colors">
                {title}
              </h2>
            )}
            {description && <p className="text-sm text-neutral-500 mt-1">{description}</p>}
          </div>
          {headerAction && <div className="flex-shrink-0">{headerAction}</div>}
        </div>
      </div>
    )}
    <div className="relative">{children}</div>
  </div>
);
