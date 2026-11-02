import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBadge } from './StatusBadge';

describe('StatusBadge', () => {
  it.each([
    ['matched', 'badge-success', 'Matched'],
    ['COMPLETED', 'badge-success', 'Completed'],
    ['success', 'badge-success', 'Success'],
    ['processing', 'badge-info', 'Processing'],
    ['parsing', 'badge-info', 'Parsing'],
    ['uploaded', 'badge-info', 'Uploaded'],
    ['failed', 'badge-danger', 'Failed'],
    ['Error', 'badge-danger', 'Error'],
    ['pending', 'badge-warning', 'Pending'],
    ['queued', 'badge-warning', 'Queued'],
    ['archived', 'badge-secondary', 'Archived'],
  ])('renders status "%s" with %s and label "%s"', (status, cls, label) => {
    render(<StatusBadge status={status} />);
    const badge = screen.getByText(label);
    expect(badge).toHaveClass('badge', cls);
  });

  it('renders "Unknown" for an empty status', () => {
    render(<StatusBadge status="" />);
    expect(screen.getByText('Unknown')).toHaveClass('badge-secondary');
  });

  it('renders "Unknown" for a missing status', () => {
    render(<StatusBadge status={undefined as unknown as string} />);
    expect(screen.getByText('Unknown')).toHaveClass('badge-secondary');
  });
});
