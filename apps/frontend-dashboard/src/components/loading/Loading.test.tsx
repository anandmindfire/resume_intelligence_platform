import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Loading } from './index';
import { COPY } from '../../constants';

describe('Loading', () => {
  it('renders the default message and a spinner', () => {
    const { container } = render(<Loading />);
    expect(screen.getByText(COPY.LOADING.DEFAULT)).toBeInTheDocument();
    expect(container.querySelector('svg')).toHaveClass('animate-spin');
  });

  it('renders a custom message', () => {
    render(<Loading message="Crunching numbers" />);
    expect(screen.getByText('Crunching numbers')).toBeInTheDocument();
    expect(screen.queryByText(COPY.LOADING.DEFAULT)).not.toBeInTheDocument();
  });
});
