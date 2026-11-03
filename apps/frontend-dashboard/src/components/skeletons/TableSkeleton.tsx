import React from 'react';
import type { TableSkeletonProps } from '../../types/skeleton';
import { TABLE_SKELETON_VARIANTS, SKELETON_COLUMN_WIDTHS } from '../../constants/skeleton';

export const TableSkeleton: React.FC<TableSkeletonProps> = ({
  rowCount = 8,
  variant = 'resumes',
}) => {
  const { columns, showActions } = TABLE_SKELETON_VARIANTS[variant];
  const allColumns = showActions ? [...columns, 'short' as const] : columns;

  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
      <table className="table w-full">
        <thead>
          <tr className="bg-neutral-50">
            {allColumns.map((_, i) => (
              <th key={i} className="px-4 py-3">
                <div className={`skeleton h-4 ${SKELETON_COLUMN_WIDTHS[allColumns[i]]}`} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rowCount }).map((_, rowIdx) => (
            <tr key={rowIdx} className="border-t border-neutral-100">
              {allColumns.map((colType, colIdx) => (
                <td key={colIdx} className="px-4 py-3">
                  {colType === 'tags' ? (
                    <div className="flex gap-1 flex-wrap">
                      <div className="skeleton h-6 w-14 rounded" />
                      <div className="skeleton h-6 w-20 rounded" />
                      <div className="skeleton h-6 w-16 rounded" />
                    </div>
                  ) : (
                    <div className={`skeleton h-4 ${SKELETON_COLUMN_WIDTHS[colType]}`} />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
