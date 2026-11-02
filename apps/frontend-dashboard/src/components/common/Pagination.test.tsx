import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Pagination } from './Pagination';
import type { PaginationProps } from '../../types';

function setup(overrides: Partial<PaginationProps> = {}) {
  const props: PaginationProps = {
    page: 1,
    totalPages: 5,
    total: 50,
    limit: 10,
    onPageChange: vi.fn(),
    onPageSizeChange: vi.fn(),
    ...overrides,
  };
  const utils = render(<Pagination {...props} />);
  const buttons = screen.getAllByRole('button');
  return {
    ...utils,
    props,
    prev: buttons[0],
    next: buttons[buttons.length - 1],
    pageButtons: buttons.slice(1, -1),
  };
}

const labels = (els: HTMLElement[]) => els.map((b) => b.textContent);

describe('Pagination', () => {
  it('shows the current item range', () => {
    setup({ page: 2, limit: 10, total: 45 });
    expect(screen.getByText('Showing 11-20 of 45')).toBeInTheDocument();
  });

  it('clamps the end of the range to the total', () => {
    setup({ page: 5, totalPages: 5, limit: 10, total: 45 });
    expect(screen.getByText('Showing 41-45 of 45')).toBeInTheDocument();
  });

  it('shows 0-0 when there are no items', () => {
    setup({ page: 1, totalPages: 0, total: 0 });
    expect(screen.getByText('Showing 0-0 of 0')).toBeInTheDocument();
  });

  it('disables previous on the first page and next on the last page', () => {
    const first = setup({ page: 1, totalPages: 3 });
    expect(first.prev).toBeDisabled();
    expect(first.next).toBeEnabled();
    first.unmount();

    const last = setup({ page: 3, totalPages: 3 });
    expect(last.prev).toBeEnabled();
    expect(last.next).toBeDisabled();
  });

  it('calls onPageChange for previous, next and numbered buttons', () => {
    const { props, prev, next } = setup({ page: 3, totalPages: 5 });
    fireEvent.click(prev);
    fireEvent.click(next);
    fireEvent.click(screen.getByRole('button', { name: '5' }));
    expect(props.onPageChange).toHaveBeenNthCalledWith(1, 2);
    expect(props.onPageChange).toHaveBeenNthCalledWith(2, 4);
    expect(props.onPageChange).toHaveBeenNthCalledWith(3, 5);
  });

  it('highlights the active page', () => {
    setup({ page: 2, totalPages: 3 });
    expect(screen.getByRole('button', { name: '2' })).toHaveClass('bg-primary-600');
    expect(screen.getByRole('button', { name: '1' })).not.toHaveClass('bg-primary-600');
  });

  it('shows all pages when few pages exist', () => {
    const { pageButtons } = setup({ page: 1, totalPages: 3 });
    expect(labels(pageButtons)).toEqual(['1', '2', '3']);
    expect(screen.queryByText('...')).not.toBeInTheDocument();
  });

  it('adds a trailing ellipsis and last page near the start', () => {
    const { pageButtons } = setup({ page: 1, totalPages: 10, total: 100 });
    expect(labels(pageButtons)).toEqual(['1', '2', '3', '10']);
    expect(screen.getAllByText('...')).toHaveLength(1);
  });

  it('adds leading and trailing ellipses in the middle', () => {
    const { pageButtons } = setup({ page: 5, totalPages: 10, total: 100 });
    expect(labels(pageButtons)).toEqual(['1', '3', '4', '5', '6', '7', '10']);
    expect(screen.getAllByText('...')).toHaveLength(2);
  });

  it('omits ellipses when the window is adjacent to the first/last page', () => {
    const { pageButtons } = setup({ page: 4, totalPages: 7, total: 70 });
    expect(labels(pageButtons)).toEqual(['1', '2', '3', '4', '5', '6', '7']);
    expect(screen.queryByText('...')).not.toBeInTheDocument();
  });

  it('adds a leading ellipsis near the end', () => {
    const { pageButtons } = setup({ page: 10, totalPages: 10, total: 100 });
    expect(labels(pageButtons)).toEqual(['1', '8', '9', '10']);
    expect(screen.getAllByText('...')).toHaveLength(1);
  });

  it('renders a page size selector with the given options and reports changes', () => {
    const { props } = setup({ limit: 20, pageSizeOptions: [10, 20, 30] });
    const select = screen.getByLabelText('Per page:') as HTMLSelectElement;
    expect(select.value).toBe('20');
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['10', '20', '30']);
    fireEvent.change(select, { target: { value: '30' } });
    expect(props.onPageSizeChange).toHaveBeenCalledWith(30);
  });

  it('uses default page size options', () => {
    setup();
    const select = screen.getByLabelText('Per page:');
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['5', '10', '20', '50']);
  });

  it('hides the page size selector when showPageSize is false', () => {
    setup({ showPageSize: false });
    expect(screen.queryByLabelText('Per page:')).not.toBeInTheDocument();
  });

  it('hides the page size selector without an onPageSizeChange handler', () => {
    setup({ onPageSizeChange: undefined });
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});
