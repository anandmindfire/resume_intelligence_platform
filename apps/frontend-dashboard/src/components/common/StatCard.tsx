import React from 'react';
import type { StatCardProps } from '../../types';

const variantStyles: Record<NonNullable<StatCardProps['variant']>, Record<string, string>> = {
  primary: {
    border: 'border-l-primary-500',
    iconBg: 'bg-primary-100',
    iconColor: 'text-primary-600',
    gradientFrom: 'from-primary-600',
    gradientTo: 'to-primary-400',
    bgGradient: 'from-primary-50 to-white',
  },
  secondary: {
    border: 'border-l-secondary-500',
    iconBg: 'bg-secondary-100',
    iconColor: 'text-secondary-600',
    gradientFrom: 'from-secondary-600',
    gradientTo: 'to-secondary-400',
    bgGradient: 'from-secondary-50 to-white',
  },
  warning: {
    border: 'border-l-warning-500',
    iconBg: 'bg-warning-100',
    iconColor: 'text-warning-600',
    gradientFrom: 'from-warning-600',
    gradientTo: 'to-warning-400',
    bgGradient: 'from-warning-50 to-white',
  },
  accent: {
    border: 'border-l-accent-500',
    iconBg: 'bg-accent-100',
    iconColor: 'text-accent-600',
    gradientFrom: 'from-accent-600',
    gradientTo: 'to-accent-400',
    bgGradient: 'from-accent-50 to-white',
  },
  info: {
    border: 'border-l-info-500',
    iconBg: 'bg-info-100',
    iconColor: 'text-info-600',
    gradientFrom: 'from-info-600',
    gradientTo: 'to-info-400',
    bgGradient: 'from-info-50 to-white',
  },
};

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  label,
  icon: Icon,
  variant = 'primary',
  trend,
}) => {
  const styles = variantStyles[variant];
  return (
    <div
      className={`stat-card ${styles.border} bg-gradient-to-br ${styles.bgGradient} hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300`}
    >
      <div className="flex items-start justify-between mb-4">
        <h3 className="text-sm font-semibold text-neutral-600 uppercase tracking-wide">{title}</h3>
        {Icon && (
          <div className={`${styles.iconBg} p-2 rounded-lg`}>
            <Icon className={`w-5 h-5 ${styles.iconColor}`} />
          </div>
        )}
      </div>
      <div className="mb-2">
        <div
          className={`text-4xl font-bold bg-gradient-to-r ${styles.gradientFrom} ${styles.gradientTo} bg-clip-text text-transparent`}
        >
          {value}
        </div>
        {trend && (
          <div
            className={`flex items-center gap-1 mt-1 text-xs font-semibold ${
              trend.isPositive ? 'text-secondary-600' : 'text-danger-600'
            }`}
          >
            <span>{trend.isPositive ? '↑' : '↓'}</span>
            <span>{Math.abs(trend.value)}%</span>
          </div>
        )}
      </div>
      {label && <p className="text-sm text-neutral-500">{label}</p>}
    </div>
  );
};
