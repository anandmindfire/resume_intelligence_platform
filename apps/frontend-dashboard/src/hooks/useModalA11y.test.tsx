import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { useModalA11y } from './useModalA11y';

function Dialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const containerRef = useModalA11y(isOpen, onClose);
  if (!isOpen) return null;
  return (
    <div ref={containerRef} role="dialog" tabIndex={-1}>
      <button>first</button>
      <button>last</button>
    </div>
  );
}

function Harness() {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setIsOpen(true)}>open</button>
      <Dialog isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </div>
  );
}

/** A parent that re-renders (new inline onClose each time) without the dialog itself closing. */
function RerenderingHarness({ onClose }: { onClose: () => void }) {
  const [bump, setBump] = useState(0);
  return (
    <div>
      <button onClick={() => setBump((n) => n + 1)}>rerender {bump}</button>
      {/* A fresh arrow function every render, as real callers typically pass. */}
      <Dialog isOpen onClose={() => onClose()} />
    </div>
  );
}

describe('useModalA11y', () => {
  it('does not attach listeners or steal focus while closed', () => {
    const onClose = vi.fn();
    render(<Dialog isOpen={false} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('focuses the first focusable element when it opens', () => {
    const onClose = vi.fn();
    render(<Dialog isOpen onClose={onClose} />);
    expect(screen.getByRole('button', { name: 'first' })).toHaveFocus();
  });

  it('calls onClose on Escape', () => {
    const onClose = vi.fn();
    render(<Dialog isOpen onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('traps Tab focus within the dialog, wrapping from last to first and back', () => {
    const onClose = vi.fn();
    render(<Dialog isOpen onClose={onClose} />);
    const first = screen.getByRole('button', { name: 'first' });
    const last = screen.getByRole('button', { name: 'last' });

    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(first).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
  });

  it('does not re-steal focus when the parent re-renders with a new onClose while still open', () => {
    const onClose = vi.fn();
    render(<RerenderingHarness onClose={onClose} />);
    const last = screen.getByRole('button', { name: 'last' });
    last.focus();
    expect(last).toHaveFocus();

    fireEvent.click(screen.getByRole('button', { name: /rerender/ }));

    expect(last).toHaveFocus();
  });

  it('still calls the latest onClose after such a re-render', () => {
    const onClose = vi.fn();
    render(<RerenderingHarness onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /rerender/ }));

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('restores focus to the triggering element when the dialog closes', () => {
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'open' });
    trigger.focus();
    fireEvent.click(trigger);

    expect(screen.getByRole('button', { name: 'first' })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(trigger).toHaveFocus();
  });
});
