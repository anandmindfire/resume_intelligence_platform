import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('renders the title with the default icon', () => {
    render(<EmptyState title="Nothing here" />);
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
    expect(screen.getByText('📄')).toBeInTheDocument();
  });

  it('renders a custom icon, message and action', () => {
    render(
      <EmptyState
        icon="🎯"
        title="No matches"
        message="Try again later"
        action={<button>Reload</button>}
      />
    );
    expect(screen.getByText('🎯')).toBeInTheDocument();
    expect(screen.getByText('Try again later')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  });

  it('omits message and action when not provided', () => {
    const { container } = render(<EmptyState title="Empty" />);
    expect(container.querySelectorAll('p')).toHaveLength(1);
    expect(container.querySelector('.mt-4')).toBeNull();
  });
});
