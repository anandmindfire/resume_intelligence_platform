import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

/** Shared UI component props */
export interface CardProps {
  children: ReactNode;
  title?: string;
  className?: string;
  headerAction?: ReactNode;
  description?: string;
  style?: React.CSSProperties;
}

export interface LayoutProps {
  children: ReactNode;
}

export interface EmptyStateProps {
  icon?: string;
  title: string;
  message?: string;
  action?: ReactNode;
}

export interface StatusBadgeProps {
  status: string;
}

export interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (limit: number) => void;
  pageSizeOptions?: number[];
  showPageSize?: boolean;
}

export type StatCardVariant = 'primary' | 'secondary' | 'warning' | 'accent' | 'info';

export interface StatCardProps {
  title: string;
  value: string | number;
  label?: string;
  icon?: LucideIcon;
  variant?: StatCardVariant;
  trend?: {
    value: number;
    isPositive: boolean;
  };
}
