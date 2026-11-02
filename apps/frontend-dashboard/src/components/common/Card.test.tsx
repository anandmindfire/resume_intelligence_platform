import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Card } from './Card';

describe('Card', () => {
  it('renders children without a header when no title/description/action', () => {
    const { container } = render(<Card>Body content</Card>);
    expect(screen.getByText('Body content')).toBeInTheDocument();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(container.querySelector('.border-b')).toBeNull();
  });

  it('renders title, description and header action', () => {
    render(
      <Card title="My Title" description="Some description" headerAction={<button>Act</button>}>
        Body
      </Card>
    );
    expect(screen.getByRole('heading', { level: 2, name: 'My Title' })).toBeInTheDocument();
    expect(screen.getByText('Some description')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Act' })).toBeInTheDocument();
  });

  it('renders a header for a description alone', () => {
    render(<Card description="Only description">Body</Card>);
    expect(screen.getByText('Only description')).toBeInTheDocument();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('renders a header for a header action alone', () => {
    render(<Card headerAction={<span>Action only</span>}>Body</Card>);
    expect(screen.getByText('Action only')).toBeInTheDocument();
  });

  it('applies className and style to the root element', () => {
    const { container } = render(
      <Card className="extra-class" style={{ animationDelay: '400ms' }}>
        Body
      </Card>
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveClass('card', 'extra-class', 'group');
    expect(root.style.animationDelay).toBe('400ms');
  });
});
