import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Award } from 'lucide-react';
import { StatCard } from './StatCard';
import type { StatCardVariant } from '../../types';

describe('StatCard', () => {
  it('renders title and value with primary styling by default', () => {
    const { container } = render(<StatCard title="Total" value={42} />);
    expect(screen.getByRole('heading', { level: 3, name: 'Total' })).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass('border-l-primary-500');
    expect(container.querySelector('svg')).toBeNull();
  });

  it('renders the optional label and icon', () => {
    const { container } = render(
      <StatCard title="Skills" value="7" label="Unique skills" icon={Award} variant="amber" />
    );
    expect(screen.getByText('Unique skills')).toBeInTheDocument();
    expect(container.querySelector('svg')).toHaveClass('text-amber-600');
  });

  it.each<StatCardVariant>(['primary', 'secondary', 'amber', 'purple', 'blue'])(
    'applies %s variant classes',
    (variant) => {
      const { container } = render(<StatCard title="T" value={1} variant={variant} />);
      expect(container.firstElementChild).toHaveClass(`border-l-${variant}-500`);
    }
  );

  it('renders a positive trend', () => {
    render(<StatCard title="T" value={1} trend={{ value: 12, isPositive: true }} />);
    expect(screen.getByText('↑')).toBeInTheDocument();
    expect(screen.getByText('12%').parentElement).toHaveClass('text-secondary-600');
  });

  it('renders a negative trend using the absolute value', () => {
    render(<StatCard title="T" value={1} trend={{ value: -8, isPositive: false }} />);
    expect(screen.getByText('↓')).toBeInTheDocument();
    expect(screen.getByText('8%').parentElement).toHaveClass('text-red-600');
  });
});
